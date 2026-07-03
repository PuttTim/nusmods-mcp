#!/usr/bin/env node
// Call a tool on the HOSTED nusmods-mcp server.
//
// Usage:
//   node scripts/remote.mjs                               # list tools
//   node scripts/remote.mjs get_module_reviews '{"moduleCode":"DTK1234","limit":3}'
//   node scripts/remote.mjs get_module_info '{"moduleCode":"CS2103T"}'
//   pnpm remote get_module_reviews '{"moduleCode":"DTK1234"}'
//
// The server URL comes from NUSMODS_MCP_URL (set it in .env or the shell).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

function readEnvFile(name) {
  try {
    const raw = readFileSync(resolve(fileURLToPath(import.meta.url), "../../.env"), "utf8");
    for (const line of raw.split("\n")) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (match && match[1] === name && !line.trimStart().startsWith("#")) {
        return match[2].replace(/^(["'])(.*)\1$/, "$2") || undefined;
      }
    }
  } catch {
    /* no .env */
  }
  return undefined;
}

const url = process.env.NUSMODS_MCP_URL ?? readEnvFile("NUSMODS_MCP_URL");
if (!url) {
  console.error("Set NUSMODS_MCP_URL (env var or .env) to your deployed MCP endpoint, e.g. https://<host>/mcp");
  process.exit(1);
}

const [toolName, argsJson] = process.argv.slice(2);

const client = new Client({ name: "nusmods-remote-cli", version: "0.1.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(url)));

try {
  if (!toolName) {
    const { tools } = await client.listTools();
    console.log(`Tools on ${url}:\n`);
    for (const t of tools) console.log(`  ${t.name}`);
    console.log(`\nUsage: node scripts/remote.mjs <tool> '<json-args>'`);
  } else {
    let args = {};
    if (argsJson) {
      try {
        args = JSON.parse(argsJson);
      } catch {
        console.error(`Arguments are not valid JSON: ${argsJson}`);
        process.exit(1);
      }
    }
    const result = await client.callTool({ name: toolName, arguments: args });
    for (const item of result.content ?? []) {
      if (item.type === "text") {
        try {
          console.log(JSON.stringify(JSON.parse(item.text), null, 2));
        } catch {
          console.log(item.text);
        }
      }
    }
    if (result.isError) process.exitCode = 1;
  }
} finally {
  await client.close();
}
