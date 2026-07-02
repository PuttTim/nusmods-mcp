/**
 * Compact meeting slot: "<Day> <start>-<end>[ <venue>]",
 * e.g. "Mon 09:00-12:00 BIZ2-0301". Kept as a string to keep tool payloads small.
 */
export type MeetingSlot = string;

export interface ScheduleGroup {
  group: string;
  slots?: MeetingSlot[];
  instructors?: string[];
}

export interface FacultyScheduleEntry {
  moduleCode: string;
  title?: string;
  semester?: 1 | 2;
  examDate?: string;
  remarks?: string;
  /** Instructors for the whole module offering; per-group instructors (if a source distinguishes them) go in groups[].instructors. */
  instructors?: string[];
  groups?: ScheduleGroup[];
}

export interface FacultyScheduleSoftFail {
  error: string;
  faculty: string;
  url: string;
  hint: string;
}

export type FacultyScheduleResult = FacultyScheduleEntry[] | FacultyScheduleSoftFail;

export function isSoftFail(result: FacultyScheduleResult): result is FacultyScheduleSoftFail {
  return !Array.isArray(result);
}

export interface FacultyScheduleSource {
  /** Short identifier, e.g. "math" | "soc". */
  readonly faculty: string;
  /** Canonical source URL for this faculty's schedule page. */
  readonly url: string;
  /** Fetch and parse the schedule page into normalized entries, or a structured soft-fail. */
  fetchSchedule(): Promise<FacultyScheduleResult>;
}
