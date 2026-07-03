import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSearchModules } from "./tools/searchModules.js";
import { registerGetModuleInfo } from "./tools/getModuleInfo.js";
import { registerBatchGetModuleInfo } from "./tools/batchGetModuleInfo.js";
import { registerGetModuleTimetable } from "./tools/getModuleTimetable.js";
import { registerListAcademicCalendar } from "./tools/listAcademicCalendar.js";
import { registerDecodeShareUrl } from "./tools/decodeShareUrl.js";
import { registerEncodeShareUrl } from "./tools/encodeShareUrl.js";
import { registerGetFacultySchedule } from "./tools/getFacultySchedule.js";
import { registerGetModuleReviews } from "./tools/getModuleReviews.js";

/** Register the full v1 tool surface on a server. Shared by both entrypoints. */
export function registerAllTools(server: McpServer): void {
  registerSearchModules(server);
  registerGetModuleInfo(server);
  registerBatchGetModuleInfo(server);
  registerGetModuleTimetable(server);
  registerListAcademicCalendar(server);
  registerDecodeShareUrl(server);
  registerEncodeShareUrl(server);
  registerGetFacultySchedule(server);
  registerGetModuleReviews(server);
}
