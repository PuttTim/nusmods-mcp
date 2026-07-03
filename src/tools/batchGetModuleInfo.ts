import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getModuleInfo } from "../api.js";
import { resolveAcadYear } from "../config.js";

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
        "Get trimmed details for multiple modules in one call. Returns an array of results in the same format as get_module_info. Modules not found are returned with an error field.",
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
          });
        }),
      );

      return {
        content: [{ type: "text", text: JSON.stringify(results) }],
      };
    },
  );
}
