import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { describeResponse, sendAndWait } from "../../factory.js";
import { maxOutputCharsSchema } from "../../schemas.js";

export default function register(server: McpServer): void {
  server.registerTool(
    "get-remote-spy-logs",
    {
      title: "Get captured remote spy logs from Cobalt",
      description:
        "List captured Cobalt remote and bindable call logs. Requires ensure-remote-spy first. Defaults to a summary (names + call counts); set summaryOnly=false to include argument payloads. Use direction and name filters to narrow noisy logs.",
      inputSchema: z.object({
        direction: z
          .enum(["Incoming", "Outgoing", "Both"])
          .describe("Filter by call direction (default: Both)")
          .optional()
          .default("Both"),
        remoteNameFilter: z
          .string()
          .describe(
            "Optional filter — only return logs for remotes whose name contains this string (case-insensitive)"
          )
          .optional(),
        limit: z
          .number()
          .describe("Maximum number of remote logs to return (default: 5)")
          .optional()
          .default(5),
        maxCallsPerRemote: z
          .number()
          .describe("Maximum number of recent calls to return per remote (default: 1)")
          .optional()
          .default(1),
        summaryOnly: z
          .boolean()
          .describe("When true (default), return remote names and call counts without argument payloads. Set false to inspect actual call arguments.")
          .optional()
          .default(true),
        maxOutputChars: maxOutputCharsSchema,
      }),
    },
    async ({ direction, remoteNameFilter, limit, maxCallsPerRemote, summaryOnly, maxOutputChars }) =>
      sendAndWait({
        type: "get-remote-spy-logs",
        data: {
          direction,
          remoteNameFilter: remoteNameFilter || "",
          limit,
          maxCallsPerRemote,
          summaryOnly,
        },
        maxOutputChars,
        stampClient: true,
        truncationHint: "Rerun get-remote-spy-logs with summaryOnly=true, a remoteNameFilter, lower limit, or lower maxCallsPerRemote.",
        failureMessage: (response) =>
          "Failed to get remote spy logs: " + describeResponse(response),
      })
  );
}
