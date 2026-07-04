import { cached } from "./cache.js";

const USER_AGENT = "nusmods-mcp/0.1 (local MCP server)";
const API_BASE = "https://api.nusmods.com/v2";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MODULE_TTL_MS = 72 * HOUR_MS;
const MODULE_REFRESH_MS = 24 * HOUR_MS;

export interface ModuleListEntry {
  moduleCode: string;
  title: string;
  semesters: number[];
}

export interface Lesson {
  classNo: string;
  startTime: string;
  endTime: string;
  weeks: unknown;
  day: string;
  lessonType: string;
  venue: string;
  size?: number;
}

export interface SemesterData {
  semester: number;
  timetable: Lesson[];
  examDate?: string;
  examDuration?: number;
}

export interface ModuleInfo {
  acadYear: string;
  moduleCode: string;
  department?: string;
  faculty?: string;
  description?: string;
  moduleCredit?: string;
  title: string;
  workload?: unknown;
  prerequisite?: string;
  preclusion?: string;
  corequisite?: string;
  aliases?: string[];
  semesterData: SemesterData[];
  prereqTree?: unknown;
  fulfillRequirements?: string[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`NUSMods API request failed: ${response.status} ${response.statusText} (${url})`);
  }
  return (await response.json()) as T;
}

export async function getModuleList(acadYear: string): Promise<ModuleListEntry[]> {
  const key = `moduleList:${acadYear}`;
  return cached(key, DAY_MS, () => fetchJson<ModuleListEntry[]>(`${API_BASE}/${acadYear}/moduleList.json`));
}

export async function getModuleInfo(acadYear: string, moduleCode: string): Promise<ModuleInfo | undefined> {
  const key = `module:${acadYear}:${moduleCode.toUpperCase()}`;
  try {
    return await cached(
      key,
      MODULE_TTL_MS,
      () => fetchJson<ModuleInfo>(`${API_BASE}/${acadYear}/modules/${moduleCode.toUpperCase()}.json`),
      { refreshAfterMs: MODULE_REFRESH_MS },
    );
  } catch {
    return undefined;
  }
}
