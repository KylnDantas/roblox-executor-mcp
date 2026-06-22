import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadSemanticSettings, validateSemanticSettings } from "../../../semantic/settings.js";
import { semanticIndexCodebase, semanticSearchScripts, type SemanticSearchOutput } from "../../../semantic/vector-index.js";
import { clientStampPrefix, toolTextResponse, type ToolTextResponse } from "../../factory.js";
import { isSecondaryRelay, relayToolToApi } from "../../factory.js";
import { maxOutputCharsSchema } from "../../schemas.js";
import { fetchScriptSearchIndex } from "./script-sources.js";

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 10;
  return Math.max(1, Math.min(50, Math.floor(limit)));
}

function formatSemanticResults(
  query: string,
  output: SemanticSearchOutput
): string {
  const { results, chunkCount, embeddedChunks, isPartialIndex } = output;

  const header =
    `${results.length} semantic ${results.length === 1 ? "match" : "matches"} ` +
    `for "${query}" across ${chunkCount} ${chunkCount === 1 ? "chunk" : "chunks"}`;

  const parts: string[] = [];

  if (isPartialIndex) {
    const pct = chunkCount > 0 ? Math.round((embeddedChunks / chunkCount) * 100) : 0;
    parts.push(
      `WARNING: The codebase is NOT fully indexed. Only ${embeddedChunks}/${chunkCount} chunks (${pct}%) have embeddings. ` +
      `Results may be incomplete or miss relevant matches. Run a full semantic index from the MCP dashboard to get complete results.`
    );
  }

  parts.push(header);

  if (results.length > 0) {
    parts.push(
      results
        .map((result, index) => {
          return (
            `${index + 1}. [${result.path}] lines ${result.startLine}-${result.endLine} ` +
            `(score ${result.score.toFixed(4)})\n\n${result.snippet}`
          );
        })
        .join("\n\n---\n\n")
    );
  }

  return parts.join("\n\n");
}

export default function register(server: McpServer): void {
  server.registerTool(
    "semantic-search-scripts",
    {
      title: "Semantically search scripts in the game",
      description:
        "Find decompiled Roblox scripts by behavior using semantic embeddings. Use when exact identifiers are unknown; use script-grep for exact text or regex.",
      inputSchema: z.object({
        query: z
          .string()
          .describe("Natural-language description of the code behavior to find."),
        limit: z
          .number()
          .describe("Maximum number of semantic matches to return (default: 5, max: 50).")
          .optional()
          .default(5),
        minScore: z
          .number()
          .describe("Optional minimum cosine similarity score. Typical useful values are 0.2-0.5.")
          .optional(),
        requireFullIndex: z
          .boolean()
          .describe("When true, build or complete the semantic index before searching so results are not partial (default: true).")
          .optional()
          .default(true),
        indexOnly: z
          .boolean()
          .describe("When true, build or refresh the semantic index and return readiness without searching.")
          .optional()
          .default(false),
        maxOutputChars: maxOutputCharsSchema,
      }),
    },
    async ({ query, limit, minScore, requireFullIndex, indexOnly, maxOutputChars }): Promise<ToolTextResponse> => {
      // Secondary mode: script sources and embeddings live on the primary.
      if (isSecondaryRelay()) {
        return relayToolToApi("semantic-search", {
          query,
          limit,
          ...(minScore !== undefined ? { minScore } : {}),
          requireFullIndex,
          indexOnly,
          maxOutputChars,
        }, 120000, {
          maxOutputChars,
          truncationHint: "Rerun semantic-search-scripts with a lower limit or higher minScore.",
        });
      }

      const indexResult = fetchScriptSearchIndex({ allowIncomplete: true });
      if (!indexResult.ok) return indexResult.response;

      const settings = await loadSemanticSettings();
      const settingsError = validateSemanticSettings(settings);
      if (settingsError) {
        return {
          content: [
            {
              type: "text",
              text: `Semantic search is not configured: ${settingsError} Configure it from the MCP dashboard.`,
            },
          ],
          isError: true,
        };
      }

      try {
        if (indexOnly || requireFullIndex) {
          const { chunkCount, embeddedChunks } = await semanticIndexCodebase(
            indexResult.index,
            settings
          );
          if (indexOnly) {
            return toolTextResponse(
              `Semantic index ready: ${embeddedChunks}/${chunkCount} chunks embedded.`,
              { maxOutputChars }
            );
          }
        }

        const output = await semanticSearchScripts(
          indexResult.index,
          settings,
          query,
          normalizeLimit(limit),
          minScore
        );

        if (requireFullIndex && output.isPartialIndex) {
          return toolTextResponse(
            "Semantic search did not complete a full index; refusing partial results. Rerun with requireFullIndex=false only if partial results are acceptable.",
            {},
            true
          );
        }

        return toolTextResponse(clientStampPrefix() + formatSemanticResults(query, output), {
          maxOutputChars,
          truncationHint: "Rerun semantic-search-scripts with a lower limit or higher minScore.",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return toolTextResponse(`Semantic search failed: ${message}`, {}, true);
      }
    }
  );
}
