import crypto from "crypto";
import { WebSocket } from "ws";
import { HTTP_POLL_TIMEOUT } from "../../../config.js";
import type { RobloxClient } from "../../types.js";
import { clearScriptSourceIndex } from "./script-source-store.js";

const clientRegistry: Map<string, RobloxClient> = new Map();
const wsToClientId: Map<WebSocket, string> = new Map();

let activeClientId: string | undefined = undefined;

export function getActiveClientId(): string | undefined {
  return activeClientId;
}

export function setActiveClientId(clientId: string): void {
  activeClientId = clientId;
}

export function resetRegistry(): void {
  clientRegistry.clear();
  wsToClientId.clear();
}

export function registerClient(info: {
  username: string;
  userId: number;
  placeId: number;
  jobId: string;
  placeName: string;
  transport: "ws" | "http";
  ws?: WebSocket;
}): string {
  const clientId = crypto.randomUUID();
  const entry: RobloxClient = {
    clientId,
    username: info.username,
    userId: info.userId,
    placeId: info.placeId,
    jobId: info.jobId,
    placeName: info.placeName,
    transport: info.transport,
    ws: info.ws,
    lastHttpPoll: Date.now(),
    pendingHttpCommands: [],
    pendingPollResolve: null,
  };
  clientRegistry.set(clientId, entry);
  if (info.ws) {
    wsToClientId.set(info.ws, clientId);
  }
  console.error(
    `[Registry] Client registered: ${clientId} (${info.username} @ ${info.placeName}, ${info.transport})`
  );
  return clientId;
}

export function unregisterClient(clientId: string): void {
  const entry = clientRegistry.get(clientId);
  if (entry?.ws) {
    wsToClientId.delete(entry.ws);
  }
  entry?.pendingPollResolve?.([]);
  clientRegistry.delete(clientId);
  clearScriptSourceIndex(clientId);
  console.error(`[Registry] Client unregistered: ${clientId}`);
}

export function getClientById(clientId: string): RobloxClient | undefined {
  return clientRegistry.get(clientId);
}

export function getClientIdByWs(ws: WebSocket): string | undefined {
  return wsToClientId.get(ws);
}

export function getActiveClients(): RobloxClient[] {
  const active: RobloxClient[] = [];
  for (const entry of clientRegistry.values()) {
    if (entry.transport === "ws") {
      if (entry.ws && entry.ws.readyState === WebSocket.OPEN) {
        active.push(entry);
      }
    } else if (Date.now() - entry.lastHttpPoll < HTTP_POLL_TIMEOUT) {
      active.push(entry);
    }
  }
  return active;
}

export function formatActiveClientListForTool(): string {
  const active = getActiveClients();
  if (active.length === 0) {
    return "No Roblox clients are currently connected.";
  }

  // Compact one-line-per-client format to minimize tokens vs pretty JSON.
  return active
    .map((c) => {
      const marker = c.clientId === activeClientId ? "* " : "  ";
      return (
        `${marker}${c.clientId} | ${c.username ?? "?"} @ ${c.placeName ?? c.placeId} ` +
        `(place=${c.placeId} job=${c.jobId} ${c.transport})`
      );
    })
    .join("\n");
}

export function resolveTargetClient(clientId?: string): RobloxClient | null {
  if (clientId) {
    const entry = clientRegistry.get(clientId);
    if (!entry) return null;
    if (entry.transport === "ws" && (!entry.ws || entry.ws.readyState !== WebSocket.OPEN)) {
      return null;
    }
    if (entry.transport === "http" && Date.now() - entry.lastHttpPoll >= HTTP_POLL_TIMEOUT) {
      return null;
    }
    return entry;
  }

  const active = getActiveClients();
  if (active.length === 0) return null;

  const wsCl = active.filter((c) => c.transport === "ws");
  if (wsCl.length > 0) return wsCl[wsCl.length - 1]!;
  return active.sort((a, b) => b.lastHttpPoll - a.lastHttpPoll)[0]!;
}
