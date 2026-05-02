#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { boot } from "./bridge/boot.js";
import { registerAllTools } from "./tools/index.js";
import { installServerLogCapture } from "./http/server-logs.js";

// Install log capture early so all console.error calls are buffered.
installServerLogCapture();

// Import config for its side effects (CLI arg parsing + logging).
import "./config.js";

const server = new McpServer({
  name: "roblox-executor-mcp",
  version: "2.0.0",
  description:
    "A MCP Server allowing interaction to the Roblox Game Client (including access to restricted APIs such as getgc(), getreg(), etc.) with full control over the game. Dashboard can be found at http://localhost:16384/",
});

registerAllTools(server);

const transport = new StdioServerTransport();
server.connect(transport);
console.error("MCP Server started and connected via stdio.");

void boot();
