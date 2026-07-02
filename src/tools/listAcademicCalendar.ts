import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveAcadYear } from "../config.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

interface WeekRange {
  week: string;
  start: string;
  end: string;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nthMondayOfMonth(year: number, month: number, n: number): Date {
  const date = new Date(Date.UTC(year, month - 1, 1));
  const dayOfWeek = date.getUTCDay();
  const offsetToMonday = (8 - dayOfWeek) % 7;
  date.setUTCDate(date.getUTCDate() + offsetToMonday + (n - 1) * 7);
  return date;
}

function buildSemesterWeeks(startDate: Date): WeekRange[] {
  const labels = [
    "1", "2", "3", "4", "5", "6",
    "Recess",
    "7", "8", "9", "10", "11", "12", "13",
    "Reading",
    "Exam 1", "Exam 2",
  ];

  return labels.map((label, index) => {
    const start = new Date(startDate.getTime() + index * MS_PER_WEEK);
    const end = new Date(start.getTime() + 6 * MS_PER_DAY);
    return { week: label, start: isoDate(start), end: isoDate(end) };
  });
}

function buildAcademicCalendar(acadYear: string): { semester1: WeekRange[]; semester2: WeekRange[] } {
  const startYearMatch = /^(\d{4})-(\d{4})$/.exec(acadYear);
  const startYear = startYearMatch?.[1] ? Number(startYearMatch[1]) : new Date().getFullYear();

  const sem1Start = nthMondayOfMonth(startYear, 8, 1);
  const sem2Start = nthMondayOfMonth(startYear + 1, 1, 2);

  return {
    semester1: buildSemesterWeeks(sem1Start),
    semester2: buildSemesterWeeks(sem2Start),
  };
}

export function registerListAcademicCalendar(server: McpServer): void {
  server.registerTool(
    "list_academic_calendar",
    {
      title: "List academic calendar",
      description:
        "Approximate week-number-to-date-range mapping for both semesters of an academic year, computed from the standard NUS pattern (Sem 1 starts first Monday of August; Sem 2 starts second Monday of January; 6 teaching weeks, 1 recess week, 7 teaching weeks, 1 reading week, 2 exam weeks). NUSMods v2 has no dedicated calendar endpoint, so this is a documented approximation, not authoritative — actual dates can shift by a week in some years.",
      inputSchema: {
        acadYear: z.string().optional().describe('Academic year, e.g. "2025-2026". Defaults to current/upcoming AY.'),
      },
    },
    async ({ acadYear }) => {
      const resolvedAcadYear = resolveAcadYear(acadYear);
      const calendar = buildAcademicCalendar(resolvedAcadYear);

      const payload = {
        acadYear: resolvedAcadYear,
        approximate: true,
        ...calendar,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
      };
    },
  );
}
