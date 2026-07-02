import type { Lesson } from "./api.js";

/**
 * Compress a NUSMods weeks field into a compact human-readable string.
 * Handles plain number arrays as well as the `{ weeks, weekInterval }` /
 * `{ start, end }` week-range object shapes used by the v2 API.
 */
export function compressWeeks(weeks: unknown): string {
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

/** Format a single lesson meeting slot as "Day HHMM-HHMM @ Venue [wks …]". */
export function formatLesson(lesson: Lesson): string {
  const weeksStr = compressWeeks(lesson.weeks);
  const weeksPart = weeksStr ? ` [wks ${weeksStr}]` : "";
  return `${lesson.day} ${lesson.startTime}-${lesson.endTime} @ ${lesson.venue}${weeksPart}`;
}
