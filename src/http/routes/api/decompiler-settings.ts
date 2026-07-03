import type { IncomingMessage, ServerResponse } from "http";
import {
  loadDecompilerSettings,
  saveDecompilerSettings,
  toPublicDecompilerSettings,
  type DecompilerSettingsInput,
} from "../../../decompiler/settings.js";
import { getDecompilerHealthSnapshot } from "../../../decompiler/health.js";
import { readJsonBody } from "../../body.js";

export async function GET(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const settings = await loadDecompilerSettings();
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(toPublicDecompilerSettings(settings, getDecompilerHealthSnapshot())));
}

export async function PUT(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody<DecompilerSettingsInput>(req);
    const settings = await saveDecompilerSettings(body);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(toPublicDecompilerSettings(settings, getDecompilerHealthSnapshot())));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid decompiler settings.";
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: message }));
  }
}
