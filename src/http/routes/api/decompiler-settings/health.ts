import type { IncomingMessage, ServerResponse } from "http";
import { reportDecompilerHealth } from "../../../../decompiler/health.js";
import { readJsonBody } from "../../../body.js";

interface HealthBody {
  clientId?: string;
  sessionId?: string;
  providers?: unknown;
}

export async function POST(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody<HealthBody>(req);
    reportDecompilerHealth(body.clientId || body.sessionId || "unknown", body.providers);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid decompiler health report." }));
  }
}
