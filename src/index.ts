#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./registerTools.js";

const server = new McpServer({
  name: "nusmods-mcp",
  version: "0.1.0",
});

// The stdio entry keeps the default DiskCache backend (see cache.ts).
registerAllTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("Fatal error starting nusmods-mcp:", error);
  process.exit(1);
});
