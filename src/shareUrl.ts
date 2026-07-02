/**
 * Pure (dependency-free, network-free) serialization logic for NUSMods
 * timetable share URLs.
 *
 * Reference: nusmodifications/nusmods
 *   website/src/utils/timetables/lessonId.ts    (LESSON_TYPE_ABBREV)
 *   website/src/utils/timetables/shareLinks.ts  (serialize/deserialize)
 *   website/src/views/routes/paths.ts           (semester -> path slug)
 *   website/src/config/app-config.json          (shortSemesterNames)
 *
 * Share URL shape (v1):
 *   https://nusmods.com/timetable/sem-1/share?CS2103T=LEC:G12,TUT:04&MA2104=LEC:1,TUT:3
 */

/** Full lesson-type name -> abbreviation, verbatim from upstream LESSON_TYPE_ABBREV. */
export const LESSON_TYPE_ABBREV: Readonly<Record<string, string>> = {
  "Design Lecture": "DLEC",
  Laboratory: "LAB",
  Lecture: "LEC",
  "Packaged Laboratory": "PLAB",
  "Packaged Lecture": "PLEC",
  "Packaged Tutorial": "PTUT",
  Recitation: "REC",
  "Sectional Teaching": "SEC",
  "Seminar-Style Module Class": "SEM",
  Tutorial: "TUT",
  "Tutorial Type 2": "TUT2",
  "Tutorial Type 3": "TUT3",
  Workshop: "WS",
};

/** Abbreviation -> full lesson-type name (reverse of LESSON_TYPE_ABBREV). */
export const LESSON_ABBREV_TYPE: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(LESSON_TYPE_ABBREV).map(([full, abbr]) => [abbr, full]),
);

/**
 * Stable lesson-type ordering used for canonical encoding, matching the
 * insertion order of the upstream LESSON_TYPE_ABBREV object (which upstream
 * iterates over when serializing a module config).
 */
export const LESSON_TYPE_ORDER: readonly string[] = Object.keys(LESSON_TYPE_ABBREV);

/** Semester number -> URL path slug (kebabCase of shortSemesterNames). */
export const SEMESTER_TO_SLUG: Readonly<Record<number, string>> = {
  1: "sem-1",
  2: "sem-2",
  3: "st-i",
  4: "st-ii",
};

/** URL path slug -> semester number. */
export const SLUG_TO_SEMESTER: Readonly<Record<string, number>> = {
  "sem-1": 1,
  "sem-2": 2,
  "st-i": 3,
  "st-ii": 4,
};

export interface ParsedSelection {
  moduleCode: string;
  /** Full lesson-type name, e.g. "Lecture". */
  lessonType: string;
  /** Lesson-type abbreviation as it appeared in the URL, e.g. "LEC". */
  lessonTypeAbbrev: string;
  classNo: string;
}

export interface ParsedShareUrl {
  semester: number | null;
  /** Slug found in the path, e.g. "sem-1" (null if the path had none). */
  semesterSlug: string | null;
  selections: ParsedSelection[];
  /** Modules present with no lesson config, e.g. bare `CS2101=` or `CS2101`. */
  modulesWithNoLessons: string[];
  /** Recognised-but-ignored params such as `hidden=` and `ta=`. */
  ignoredParams: string[];
  /** Fragments that could not be interpreted (e.g. v2/v3 lesson configs, unknown abbreviations). */
  unparsed: { moduleCode: string; raw: string; reason: string }[];
}

const RESERVED_PARAMS = new Set(["hidden", "ta"]);
const MODULE_CODE_RE = /^[A-Z]{1,4}\d{4}[A-Z]{0,3}$/;

/**
 * Parse the query portion of a share URL. Values are already query-string safe
 * in the NUSMods format (they contain `:`, `,`, `;`, `(`, `)` unescaped), so we
 * split manually rather than via URLSearchParams to avoid surprises.
 */
function splitQuery(search: string): { key: string; value: string | null }[] {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  if (raw.length === 0) return [];
  return raw.split("&").map((pair) => {
    const eq = pair.indexOf("=");
    if (eq === -1) {
      return { key: decodeURIComponent(pair), value: null };
    }
    return {
      key: decodeURIComponent(pair.slice(0, eq)),
      value: decodeURIComponent(pair.slice(eq + 1)),
    };
  });
}

/** True for v2/v3 configs which wrap lesson identifiers in parentheses. */
function isV2OrV3Config(value: string): boolean {
  return value.trimEnd().endsWith(")");
}

/**
 * Parse a NUSMods share URL into structured selections. Pure — no network,
 * no timetable resolution. Unknown params are reported, never thrown.
 */
export function parseShareUrl(url: string): ParsedShareUrl {
  let pathname = "";
  let search = "";
  try {
    const parsed = new URL(url);
    pathname = parsed.pathname;
    search = parsed.search;
  } catch {
    // Not a full URL — treat the whole thing as a query string.
    const qIndex = url.indexOf("?");
    if (qIndex >= 0) {
      pathname = url.slice(0, qIndex);
      search = url.slice(qIndex);
    } else {
      search = url;
    }
  }

  const slugMatch = pathname.match(/\/timetable\/([^/]+)\/share/) ?? pathname.match(/\/timetable\/([^/]+)/);
  const semesterSlug = slugMatch ? slugMatch[1]! : null;
  const semester = semesterSlug && semesterSlug in SLUG_TO_SEMESTER ? SLUG_TO_SEMESTER[semesterSlug]! : null;

  const selections: ParsedSelection[] = [];
  const modulesWithNoLessons: string[] = [];
  const ignoredParams: string[] = [];
  const unparsed: ParsedShareUrl["unparsed"] = [];

  for (const { key, value } of splitQuery(search)) {
    if (RESERVED_PARAMS.has(key)) {
      ignoredParams.push(value === null ? key : `${key}=${value}`);
      continue;
    }

    const moduleCode = key.toUpperCase();
    if (!MODULE_CODE_RE.test(moduleCode)) {
      ignoredParams.push(value === null ? key : `${key}=${value}`);
      continue;
    }

    if (value === null || value.length === 0) {
      modulesWithNoLessons.push(moduleCode);
      continue;
    }

    if (isV2OrV3Config(value)) {
      unparsed.push({
        moduleCode,
        raw: value,
        reason: "v2/v3 lesson-group/details serialization is not supported; only the v1 CLASS:classNo format is decoded",
      });
      continue;
    }

    // v1: LEC:G12,TUT:04
    let anyLesson = false;
    for (const token of value.split(",")) {
      if (token.length === 0) continue;
      const sep = token.indexOf(":");
      if (sep === -1) {
        unparsed.push({ moduleCode, raw: token, reason: "missing ':' separator" });
        continue;
      }
      const abbrev = token.slice(0, sep);
      const classNo = token.slice(sep + 1);
      const lessonType = LESSON_ABBREV_TYPE[abbrev];
      if (!lessonType) {
        unparsed.push({ moduleCode, raw: token, reason: `unknown lesson-type abbreviation "${abbrev}"` });
        continue;
      }
      anyLesson = true;
      selections.push({ moduleCode, lessonType, lessonTypeAbbrev: abbrev, classNo });
    }
    if (!anyLesson && !unparsed.some((u) => u.moduleCode === moduleCode)) {
      modulesWithNoLessons.push(moduleCode);
    }
  }

  return { semester, semesterSlug, selections, modulesWithNoLessons, ignoredParams, unparsed };
}

export interface EncodeSelection {
  moduleCode: string;
  /** Full lesson-type name or its abbreviation. */
  lessonType: string;
  classNo: string;
}

export interface EncodeResult {
  url: string;
  /** Selections whose lesson type could not be recognised. */
  issues: string[];
}

/** Resolve a lesson-type input (full name or abbreviation) to its abbreviation. */
export function resolveLessonTypeAbbrev(input: string): string | undefined {
  if (input in LESSON_TYPE_ABBREV) return LESSON_TYPE_ABBREV[input];
  if (input in LESSON_ABBREV_TYPE) return input; // already an abbreviation
  return undefined;
}

/**
 * Serialize selections into a canonical, deterministic NUSMods share URL.
 * Modules are sorted alphabetically; lesson types within a module follow
 * LESSON_TYPE_ORDER, then classNo. Serialization only — no clash checking.
 */
export function encodeShareUrl(input: {
  semester: number;
  selections: EncodeSelection[];
}): EncodeResult {
  const slug = SEMESTER_TO_SLUG[input.semester];
  const issues: string[] = [];
  if (!slug) {
    issues.push(`invalid semester ${input.semester} (expected 1-4)`);
  }

  // moduleCode -> array of { abbrev, order, classNo }
  const byModule = new Map<string, { abbrev: string; order: number; classNo: string }[]>();

  for (const sel of input.selections) {
    const moduleCode = sel.moduleCode.toUpperCase();
    const abbrev = resolveLessonTypeAbbrev(sel.lessonType);
    if (!abbrev) {
      issues.push(`${moduleCode}: unknown lesson type "${sel.lessonType}"`);
      continue;
    }
    const full = LESSON_ABBREV_TYPE[abbrev]!;
    const order = LESSON_TYPE_ORDER.indexOf(full);
    const list = byModule.get(moduleCode) ?? [];
    list.push({ abbrev, order: order === -1 ? Number.MAX_SAFE_INTEGER : order, classNo: sel.classNo });
    byModule.set(moduleCode, list);
  }

  const moduleCodes = [...byModule.keys()].sort();
  const params = moduleCodes.map((moduleCode) => {
    const lessons = byModule.get(moduleCode)!.slice().sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.classNo.localeCompare(b.classNo);
    });
    const value = lessons.map((l) => `${l.abbrev}:${l.classNo}`).join(",");
    return value.length > 0 ? `${moduleCode}=${value}` : `${moduleCode}=`;
  });

  const query = params.join("&");
  const url = `https://nusmods.com/timetable/${slug ?? "sem-1"}/share${query ? `?${query}` : ""}`;
  return { url, issues };
}
