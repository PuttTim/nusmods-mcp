#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerAllTools } from "./registerTools.js";

// Load .env from the project root (next to dist/) so MCP clients that spawn
// the server without a shell environment still pick up DISQUS_API_KEY etc.
// Real environment variables take precedence over .env values.
function loadDotEnv(): void {
  const envPath = resolve(fileURLToPath(import.meta.url), "../../.env");
  let raw: string;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || match[1] === undefined || line.trimStart().startsWith("#")) continue;
    const value = (match[2] ?? "").replace(/^(["'])(.*)\1$/, "$2");
    if (value !== "" && process.env[match[1]] === undefined) {
      process.env[match[1]] = value;
    }
  }
}

loadDotEnv();

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
