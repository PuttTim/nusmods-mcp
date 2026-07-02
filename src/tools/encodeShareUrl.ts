import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getModuleInfo } from "../api.js";
import { resolveAcadYear } from "../config.js";
import { encodeShareUrl, resolveLessonTypeAbbrev } from "../shareUrl.js";

export function registerEncodeShareUrl(server: McpServer): void {
  server.registerTool(
    "encode_share_url",
    {
      title: "Encode NUSMods share URL",
      description:
        "Serialize an agent-selected timetable into a canonical, deterministic NUSMods share URL (modules sorted alphabetically, lesson types in a stable order). Serialization only: it does NOT check clashes, optimize, or choose lessons. If acadYear is supplied, each selection is verified against live timetable data and unknown modules/lesson types/class numbers are reported in `issues` — the URL is always returned regardless.",
      inputSchema: {
        semester: z
          .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
          .describe("Semester number (1-4)"),
        acadYear: z
          .string()
          .optional()
          .describe('Academic year for optional verification, e.g. "2025-2026". If omitted, no verification is done.'),
        selections: z
          .array(
            z.object({
              moduleCode: z.string().min(1).describe("Module code, e.g. CS2103T"),
              lessonType: z.string().min(1).describe('Lesson type: full name ("Lecture") or abbreviation ("LEC")'),
              classNo: z.string().min(1).describe("Class number, e.g. G12"),
            }),
          )
          .describe("Selected lessons to serialize"),
      },
    },
    async ({ semester, acadYear, selections }) => {
      const { url, issues } = encodeShareUrl({ semester, selections });

      const allIssues = [...issues];

      // Optional verification against live timetable data.
      if (acadYear !== undefined) {
        const resolvedAcadYear = resolveAcadYear(acadYear);
        const infoCache = new Map<string, Awaited<ReturnType<typeof getModuleInfo>>>();
        for (const sel of selections) {
          const moduleCode = sel.moduleCode.toUpperCase();
          const abbrev = resolveLessonTypeAbbrev(sel.lessonType);
          if (!abbrev) continue; // already reported by encodeShareUrl

          if (!infoCache.has(moduleCode)) {
            infoCache.set(moduleCode, await getModuleInfo(resolvedAcadYear, moduleCode));
          }
          const info = infoCache.get(moduleCode);
          if (!info) {
            allIssues.push(`Module ${moduleCode} not found for AY ${resolvedAcadYear}`);
            continue;
          }
          const semesterData = info.semesterData.find((s) => s.semester === semester);
          if (!semesterData) {
            allIssues.push(`Module ${moduleCode} is not offered in semester ${semester} for AY ${resolvedAcadYear}`);
            continue;
          }
          const hasClass = semesterData.timetable.some(
            (l) => l.classNo === sel.classNo && resolveLessonTypeAbbrev(l.lessonType) === abbrev,
          );
          if (!hasClass) {
            const hasType = semesterData.timetable.some((l) => resolveLessonTypeAbbrev(l.lessonType) === abbrev);
            if (!hasType) {
              allIssues.push(`Module ${moduleCode} has no lesson type "${sel.lessonType}" in semester ${semester}`);
            } else {
              allIssues.push(`Module ${moduleCode} ${sel.lessonType} has no class "${sel.classNo}" in semester ${semester}`);
            }
          }
        }
      }

      const payload = {
        url,
        semester,
        acadYear: acadYear !== undefined ? resolveAcadYear(acadYear) : undefined,
        issues: allIssues.length > 0 ? allIssues : undefined,
      };

      return { content: [{ type: "text", text: JSON.stringify(payload) }] };
    },
  );
}
