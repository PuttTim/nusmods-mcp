import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getModuleInfo, type Lesson } from "../api.js";
import { resolveAcadYear } from "../config.js";

function compressWeeks(weeks: unknown): string {
  if (!Array.isArray(weeks)) {
    if (weeks && typeof weeks === "object") {
      const obj = weeks as { weeks?: number[]; weekInterval?: number };
      if (Array.isArray(obj.weeks)) {
        const base = compressWeeks(obj.weeks);
        return obj.weekInterval ? `${base} (every ${obj.weekInterval}w)` : base;
      }
    }
    return String(weeks);
  }

  const numbers = weeks.filter((w): w is number => typeof w === "number").slice().sort((a, b) => a - b);
  if (numbers.length === 0) {
    return "";
  }
  if (numbers.length === 13 && numbers[0] === 1 && numbers[12] === 13) {
    return "1-13";
  }

  const ranges: string[] = [];
  let start = numbers[0]!;
  let prev = numbers[0]!;
  for (let i = 1; i <= numbers.length; i++) {
    const current = numbers[i];
    if (current !== undefined && current === prev + 1) {
      prev = current;
      continue;
    }
    ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
    if (current !== undefined) {
      start = current;
      prev = current;
    }
  }
  return ranges.join(",");
}

function formatLesson(lesson: Lesson): string {
  const weeksStr = compressWeeks(lesson.weeks);
  const weeksPart = weeksStr ? ` [wks ${weeksStr}]` : "";
  return `${lesson.day} ${lesson.startTime}-${lesson.endTime} @ ${lesson.venue}${weeksPart}`;
}

export function registerGetModuleTimetable(server: McpServer): void {
  server.registerTool(
    "get_module_timetable",
    {
      title: "Get module timetable",
      description:
        "Get condensed lesson slots for a module in a given semester, grouped by lesson type then class number. Each class number's lessons are taken together as a group; the agent must choose exactly one class number per lesson type.",
      inputSchema: {
        moduleCode: z.string().min(1).describe("Module code, e.g. CS2103T"),
        semester: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).describe("Semester number (1-4)"),
        acadYear: z.string().optional().describe('Academic year, e.g. "2025-2026". Defaults to current/upcoming AY.'),
      },
    },
    async ({ moduleCode, semester, acadYear }) => {
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

      const semesterData = info.semesterData.find((sem) => sem.semester === semester);
      if (!semesterData) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: `Module ${moduleCode.toUpperCase()} is not offered in semester ${semester} for AY ${resolvedAcadYear}`,
              }),
            },
          ],
        };
      }

      const grouped: Record<string, Record<string, string[]>> = {};
      for (const lesson of semesterData.timetable) {
        grouped[lesson.lessonType] ??= {};
        const byClassNo = grouped[lesson.lessonType]!;
        byClassNo[lesson.classNo] ??= [];
        byClassNo[lesson.classNo]!.push(formatLesson(lesson));
      }

      const payload = {
        code: info.moduleCode,
        acadYear: resolvedAcadYear,
        semester,
        timetable: grouped,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
      };
    },
  );
}
