import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MathScheduleSource } from "../scrapers/math.js";
import { SocScheduleSource } from "../scrapers/soc.js";
import { isSoftFail } from "../scrapers/types.js";
import type { FacultyScheduleSource } from "../scrapers/types.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const registry: Record<string, FacultyScheduleSource> = {
  math: new MathScheduleSource(),
  soc: new SocScheduleSource(),
};

export function registerGetFacultySchedule(server: McpServer): void {
  server.registerTool(
    "get_faculty_schedule",
    {
      title: "Get faculty schedule",
      description:
        "Retrieve upcoming-semester course offering schedules scraped from a faculty website (Math or SoC), " +
        "before they appear in NUSMods. Entries are grouped per module+semester; each group's meeting slots " +
        'are compact strings of the form "<Day> <start>-<end> <venue>", e.g. "Mon 09:00-12:00 BIZ2-0301". ' +
        "Returns a structured soft-fail error if the source page cannot be fetched or parsed (e.g. bot-protected pages).",
      inputSchema: {
        faculty: z.enum(["math", "soc"]).describe("Which faculty schedule page to query"),
        moduleCode: z.string().optional().describe("Filter to a specific module code (case-insensitive)"),
        semester: z.union([z.literal(1), z.literal(2)]).optional().describe("Filter to a specific semester, if known"),
        limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Max results to return (default ${DEFAULT_LIMIT}, cap ${MAX_LIMIT})`),
      },
    },
    async ({ faculty, moduleCode, semester, limit }) => {
      const source = registry[faculty];
      if (!source) {
        const payload = {
          error: `Unknown faculty "${faculty}"`,
          faculty,
          url: "",
          hint: `supported faculties: ${Object.keys(registry).join(", ")}`,
        };
        return { content: [{ type: "text", text: JSON.stringify(payload) }] };
      }

      const result = await source.fetchSchedule();

      if (isSoftFail(result)) {
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }

      const needle = moduleCode?.toUpperCase();
      const matches = result.filter((entry) => {
        if (needle && entry.moduleCode.toUpperCase() !== needle) {
          return false;
        }
        if (semester !== undefined && entry.semester !== undefined && entry.semester !== semester) {
          return false;
        }
        return true;
      });

      const cappedLimit = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const payload = {
        faculty,
        url: source.url,
        totalMatches: matches.length,
        results: matches.slice(0, cappedLimit),
      };

      return { content: [{ type: "text", text: JSON.stringify(payload) }] };
    },
  );
}
