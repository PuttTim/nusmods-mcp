#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerSearchModules } from "./tools/searchModules.js";
import { registerGetModuleInfo } from "./tools/getModuleInfo.js";
import { registerGetModuleTimetable } from "./tools/getModuleTimetable.js";
import { registerListAcademicCalendar } from "./tools/listAcademicCalendar.js";

const server = new McpServer({
  name: "nusmods-mcp",
  version: "0.1.0",
});

registerSearchModules(server);
registerGetModuleInfo(server);
registerGetModuleTimetable(server);
registerListAcademicCalendar(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("Fatal error starting nusmods-mcp:", error);
  process.exit(1);
});
