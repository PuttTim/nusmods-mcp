export type Semester = 1 | 2 | 3 | 4;

export interface DefaultAcademicContext {
  acadYear: string;
  semester: Semester | null;
}

export function formatAcadYear(startCalendarYear: number): string {
  return `${startCalendarYear}-${startCalendarYear + 1}`;
}

function withinRange(
  month: number,
  day: number,
  startMonth: number,
  startDay: number,
  endMonth: number,
  endDay: number,
): boolean {
  const value = month * 100 + day;
  const start = startMonth * 100 + startDay;
  const end = endMonth * 100 + endDay;
  return value >= start && value <= end;
}

export function computeDefaultAcademicContext(now: Date = new Date()): DefaultAcademicContext {
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const year = now.getFullYear();

  if (withinRange(month, day, 7, 1, 12, 15)) {
    return { acadYear: formatAcadYear(year), semester: 1 };
  }

  if (withinRange(month, day, 12, 16, 12, 31) || withinRange(month, day, 1, 1, 5, 15)) {
    const ayStart = month >= 12 ? year : year - 1;
    return { acadYear: formatAcadYear(ayStart), semester: 2 };
  }

  return { acadYear: formatAcadYear(year), semester: null };
}

export function getDefaultAcademicContext(now: Date = new Date()): DefaultAcademicContext {
  const envAcadYear = process.env["NUSMODS_ACAD_YEAR"];
  const computed = computeDefaultAcademicContext(now);
  if (envAcadYear) {
    return { acadYear: envAcadYear, semester: computed.semester };
  }
  return computed;
}

export function resolveAcadYear(explicit: string | undefined, now: Date = new Date()): string {
  return explicit ?? getDefaultAcademicContext(now).acadYear;
}
