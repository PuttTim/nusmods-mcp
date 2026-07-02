import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getModuleInfo, type Lesson } from "../api.js";
import { resolveAcadYear } from "../config.js";
import { formatLesson } from "../lessonFormat.js";
import { parseShareUrl, SEMESTER_TO_SLUG } from "../shareUrl.js";

const USER_AGENT = "nusmods-mcp/0.1 (local MCP server)";

/** Hosts whose links are short redirects to a full share URL. */
function isShortLink(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.hostname === "modsn.us" ||
      u.hostname === "www.modsn.us" ||
      (/nusmods\.com$/.test(u.hostname) && u.pathname.startsWith("/short_url"))
    );
  } catch {
    return false;
  }
}

/** Follow redirects on a short link to obtain the canonical full share URL. */
async function resolveShortLink(url: string): Promise<string> {
  if (!isShortLink(url)) return url;
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT },
    });
    // response.url is the final URL after all redirects.
    return response.url || url;
  } catch {
    return url;
  }
}

export function registerDecodeShareUrl(server: McpServer): void {
  server.registerTool(
    "decode_share_url",
    {
      title: "Decode NUSMods share URL",
      description:
        "Decode a NUSMods timetable share URL (including shortened modsn.us / nusmods.com/short_url links) into its semester and per-module chosen lessons, resolved against live module timetable data to concrete day/time/venue slots. Reports unknown module codes, lesson types and class numbers in an `issues` array. Since share URLs do not carry an academic year, pass acadYear to control which AY's timetable is used.",
      inputSchema: {
        url: z.string().min(1).describe("NUSMods share URL, e.g. https://nusmods.com/timetable/sem-1/share?CS2103T=LEC:G12,TUT:04 (short links accepted)"),
        acadYear: z
          .string()
          .optional()
          .describe('Academic year to resolve against, e.g. "2025-2026". Defaults to current/upcoming AY.'),
      },
    },
    async ({ url, acadYear }) => {
      const resolvedAcadYear = resolveAcadYear(acadYear);
      const fullUrl = await resolveShortLink(url);
      const parsed = parseShareUrl(fullUrl);

      const issues: string[] = [];
      for (const u of parsed.unparsed) {
        issues.push(`${u.moduleCode}: could not parse "${u.raw}" (${u.reason})`);
      }

      if (parsed.semester === null) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: `Could not determine semester from URL (path slug: ${parsed.semesterSlug ?? "none"}). Expected one of ${Object.values(SEMESTER_TO_SLUG).join(", ")}.`,
                resolvedUrl: fullUrl,
              }),
            },
          ],
        };
      }
      const semester = parsed.semester;

      // Group parsed selections by module code.
      const moduleCodes = Array.from(
        new Set([...parsed.selections.map((s) => s.moduleCode), ...parsed.modulesWithNoLessons]),
      ).sort();

      // modules: { CODE: { LessonType: { classNo: [slots] } } }
      const modules: Record<string, Record<string, Record<string, string[]>>> = {};

      for (const moduleCode of moduleCodes) {
        const info = await getModuleInfo(resolvedAcadYear, moduleCode);
        if (!info) {
          issues.push(`Module ${moduleCode} not found for AY ${resolvedAcadYear}`);
          continue;
        }
        const semesterData = info.semesterData.find((s) => s.semester === semester);
        if (!semesterData) {
          issues.push(`Module ${moduleCode} is not offered in semester ${semester} for AY ${resolvedAcadYear}`);
          continue;
        }

        modules[moduleCode] ??= {};
        const timetable = semesterData.timetable;

        const moduleSelections = parsed.selections.filter((s) => s.moduleCode === moduleCode);
        for (const sel of moduleSelections) {
          const matching: Lesson[] = timetable.filter(
            (l) => l.lessonType === sel.lessonType && l.classNo === sel.classNo,
          );
          if (matching.length === 0) {
            const hasLessonType = timetable.some((l) => l.lessonType === sel.lessonType);
            if (!hasLessonType) {
              issues.push(`Module ${moduleCode} has no lesson type "${sel.lessonType}" (${sel.lessonTypeAbbrev}) in semester ${semester}`);
            } else {
              issues.push(`Module ${moduleCode} ${sel.lessonType} (${sel.lessonTypeAbbrev}) has no class "${sel.classNo}" in semester ${semester}`);
            }
            continue;
          }
          modules[moduleCode]![sel.lessonType] ??= {};
          modules[moduleCode]![sel.lessonType]![sel.classNo] = matching.map(formatLesson);
        }
      }

      const payload = {
        semester,
        semesterSlug: parsed.semesterSlug,
        acadYear: resolvedAcadYear,
        resolvedUrl: fullUrl !== url ? fullUrl : undefined,
        modules,
        modulesWithNoLessons: parsed.modulesWithNoLessons.length > 0 ? parsed.modulesWithNoLessons : undefined,
        ignoredParams: parsed.ignoredParams.length > 0 ? parsed.ignoredParams : undefined,
        issues: issues.length > 0 ? issues : undefined,
      };

      return { content: [{ type: "text", text: JSON.stringify(payload) }] };
    },
  );
}
