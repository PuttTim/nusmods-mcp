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

export function registerGetModuleInfo(server: McpServer): void {
  server.registerTool(
    "get_module_info",
    {
      title: "Get module info",
      description:
        "Get trimmed details for a single module: title, department, faculty, credits, description, prerequisite/preclusion/corequisite, workload, and semesters offered with exam date/duration. " +
        "A module is offered in semester X only if the semesters array contains an entry with semester: X — if semesters is absent, NUSMods has no offering data for that AY and a warning field is returned; never treat such a module as available. " +
        "For SoC modules, also returns socSchedule with per-semester availability and instructors scraped from the SoC teaching schedule page. " +
        "socSchedule reflects the AY the SoC page currently publishes (usually the upcoming AY) and is typically more accurate than NUSMods for instructors and sem 1/2 availability.",
      inputSchema: {
        moduleCode: z.string().min(1).describe("Module code, e.g. CS2103T"),
        acadYear: z.string().optional().describe('Academic year, e.g. "2025-2026". Defaults to current/upcoming AY.'),
      },
    },
    async ({ moduleCode, acadYear }) => {
      const resolvedAcadYear = resolveAcadYear(acadYear);
      const info = await getModuleInfo(resolvedAcadYear, moduleCode);

      if (!info) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: `Module ${moduleCode.toUpperCase()} not found for AY ${resolvedAcadYear}` }),
            },
          ],
        };
      }

      const socSchedule = await getSocOffering(info.moduleCode);

      const semesters = info.semesterData.map((sem) =>
        omitEmpty({
          semester: sem.semester,
          examDate: sem.examDate,
          examDuration: sem.examDuration,
        }),
      );

      const trimmed = omitEmpty({
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

      return {
        content: [{ type: "text", text: JSON.stringify(trimmed) }],
      };
    },
  );
}
