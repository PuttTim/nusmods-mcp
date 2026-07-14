import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getModuleInfo } from "../api.js";
import { resolveAcadYear } from "../config.js";
import { getSocOffering } from "../scrapers/soc.js";

const DESCRIPTION_MAX_LENGTH = 600;

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}…`;
}

function omitEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    (result as Record<string, unknown>)[key] = value;
  }
  return result;
}

export function registerBatchGetModuleInfo(server: McpServer): void {
  server.registerTool(
    "batch_get_module_info",
    {
      title: "Batch get module info",
      description:
        "Get trimmed details for multiple modules in one call. Returns an array of results in the same format as get_module_info (including socSchedule for SoC modules, scraped from the SoC teaching schedule page for the AY it currently publishes). Modules not found are returned with an error field. " +
        "A module is offered in semester X only if its semesters array contains an entry with semester: X — entries with a warning field instead of semesters have no NUSMods offering data for that AY and must never be listed as available; check every entry's semesters field individually before filtering by semester.",
      inputSchema: {
        moduleCodes: z.array(z.string().min(1)).min(1).describe("Array of module codes, e.g. [\"CS2103T\", \"MA1521\"]"),
        acadYear: z.string().optional().describe('Academic year, e.g. "2025-2026". Defaults to current/upcoming AY.'),
      },
    },
    async ({ moduleCodes, acadYear }) => {
      const resolvedAcadYear = resolveAcadYear(acadYear);

      const results = await Promise.all(
        moduleCodes.map(async (moduleCode) => {
          const info = await getModuleInfo(resolvedAcadYear, moduleCode);

          if (!info) {
            return { error: `Module ${moduleCode.toUpperCase()} not found for AY ${resolvedAcadYear}` };
          }

          const socSchedule = await getSocOffering(info.moduleCode);

          const semesters = info.semesterData.map((sem) =>
            omitEmpty({
              semester: sem.semester,
              examDate: sem.examDate,
              examDuration: sem.examDuration,
            }),
          );

          return omitEmpty({
            code: info.moduleCode,
            title: info.title,
            department: info.department,
            faculty: info.faculty,
            credits: info.moduleCredit,
            description: info.description ? truncate(info.description, DESCRIPTION_MAX_LENGTH) : undefined,
            prerequisite: info.prerequisite,
            preclusion: info.preclusion,
            corequisite: info.corequisite,
            workload: info.workload,
            semesters: semesters.length > 0 ? semesters : undefined,
            warning:
              semesters.length === 0
                ? `NUSMods has no semester data for ${info.moduleCode} in AY ${resolvedAcadYear} — not confirmed to run in any semester; treat as NOT offered this AY unless socSchedule shows an offering`
                : undefined,
            socSchedule,
          });
        }),
      );

      return {
        content: [{ type: "text", text: JSON.stringify(results) }],
      };
    },
  );
}
