#!/usr/bin/env node
// Call a tool on the HOSTED nusmods-mcp server.
//
// Usage:
//   node scripts/remote.mjs                               # list tools
//   node scripts/remote.mjs get_module_reviews '{"moduleCode":"DTK1234","limit":3}'
//   node scripts/remote.mjs get_module_info '{"moduleCode":"CS2103T"}'
//   pnpm remote get_module_reviews '{"moduleCode":"DTK1234"}'
//
// Override the server with NUSMODS_MCP_URL if needed.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const URL_DEFAULT = "https://your-host.example.com/mcp";
const url = process.env.NUSMODS_MCP_URL ?? URL_DEFAULT;

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
