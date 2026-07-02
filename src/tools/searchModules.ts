import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getModuleList } from "../api.js";
import { resolveAcadYear } from "../config.js";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function leadingDigit(moduleCode: string): number | undefined {
  const match = /[A-Z]+(\d)\d*/.exec(moduleCode.toUpperCase());
  return match?.[1] ? Number(match[1]) : undefined;
}

export function registerSearchModules(server: McpServer): void {
  server.registerTool(
    "search_modules",
    {
      title: "Search modules",
      description:
        "Search NUS modules by code or title substring (case-insensitive). Optionally filter by level (leading digit of the module number, e.g. 2 for 2000-level).",
      inputSchema: {
        query: z.string().min(1).describe("Substring to match against module code or title"),
        level: z.number().int().min(1).max(9).optional().describe("Filter to modules at this level, e.g. 2 for 2000-level"),
        acadYear: z.string().optional().describe('Academic year, e.g. "2025-2026". Defaults to current/upcoming AY.'),
        limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Max results to return (default ${DEFAULT_LIMIT}, cap ${MAX_LIMIT})`),
      },
    },
    async ({ query, level, acadYear, limit }) => {
      const resolvedAcadYear = resolveAcadYear(acadYear);
      const moduleList = await getModuleList(resolvedAcadYear);
      const needle = query.toLowerCase();

      const matches = moduleList.filter((entry) => {
        const haystack = `${entry.moduleCode} ${entry.title}`.toLowerCase();
        if (!haystack.includes(needle)) {
          return false;
        }
        if (level !== undefined && leadingDigit(entry.moduleCode) !== level) {
          return false;
        }
        return true;
      });

      const cappedLimit = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const results = matches.slice(0, cappedLimit).map((entry) => ({
        code: entry.moduleCode,
        title: entry.title,
        semesters: entry.semesters,
      }));

      const payload = {
        acadYear: resolvedAcadYear,
        totalMatches: matches.length,
        results,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
      };
    },
  );
}
