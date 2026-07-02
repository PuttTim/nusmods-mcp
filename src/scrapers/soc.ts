import * as cheerio from "cheerio";
import { cached } from "../cache.js";
import type {
  FacultyScheduleEntry,
  FacultyScheduleResult,
  FacultyScheduleSource,
  MeetingSlot,
  ScheduleGroup,
} from "./types.js";

const SOC_URL = "https://www.comp.nus.edu.sg/cug/soc-sched/";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_KEY = "faculty-schedule:soc:v4";

const DAY_RE = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{2}:\d{2})-(\d{2}:\d{2})\s*(.*)$/;
const GRP_RE = /^Grp\s+(\S+):\s*(.*)$/i;
const EXAM_RE = /^Exam:\s*(.+)$/i;

async function fetchHtml(): Promise<string> {
  const response = await fetch(SOC_URL, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) {
    throw new Error(`SoC schedule fetch failed with status ${response.status}`);
  }
  return response.text();
}

function cellLines($: cheerio.CheerioAPI, cell: ReturnType<cheerio.CheerioAPI>): string[] {
  const html = $(cell).html() ?? "";
  const withBreaks = html.replace(/<br\s*\/?>/gi, "\n");
  const text = cheerio.load(`<div>${withBreaks}</div>`)("div").text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseSlot(text: string): MeetingSlot | undefined {
  const match = DAY_RE.exec(text);
  if (!match?.[1] || !match[2] || !match[3]) {
    return undefined;
  }
  const venue = match[4]?.trim();
  const base = `${match[1]} ${match[2]}-${match[3]}`;
  return venue ? `${base} ${venue}` : base;
}

function parseSemesterCell(
  $: cheerio.CheerioAPI,
  cell: ReturnType<cheerio.CheerioAPI>,
  moduleCode: string,
  title: string,
  semester: 1 | 2,
): FacultyScheduleEntry | undefined {
  const lines = cellLines($, cell);
  const instructors: string[] = [];
  const groups: ScheduleGroup[] = [];
  let currentGroup: ScheduleGroup | undefined;
  let examDate: string | undefined;

  for (const line of lines) {
    if (line === "-") {
      continue;
    }
    const examMatch = EXAM_RE.exec(line);
    if (examMatch?.[1]) {
      examDate = examMatch[1].trim();
      continue;
    }
    const grpMatch = GRP_RE.exec(line);
    if (grpMatch?.[1]) {
      currentGroup = { group: grpMatch[1] };
      groups.push(currentGroup);
      const slot = parseSlot((grpMatch[2] ?? "").trim());
      if (slot) {
        currentGroup.slots = [slot];
      }
      continue;
    }
    // A bare day/time line is an additional meeting slot of the current group
    // (a group can meet multiple times a week). Never treat it as an instructor.
    const slot = parseSlot(line);
    if (slot) {
      if (currentGroup) {
        currentGroup.slots = [...(currentGroup.slots ?? []), slot];
      }
      continue;
    }
    // Otherwise treat as an instructor name (from an <a> tag or plain text).
    instructors.push(line);
  }

  if (groups.length === 0 && instructors.length === 0) {
    return undefined;
  }

  const entry: FacultyScheduleEntry = { moduleCode, title, semester };
  if (examDate !== undefined) {
    entry.examDate = examDate;
  }
  // The SoC page lists instructors once per module-semester cell, so they
  // apply to the whole offering; keep them at entry level to avoid repeating
  // them across every group.
  if (instructors.length > 0) {
    entry.instructors = instructors;
  }
  if (groups.length > 0) {
    entry.groups = groups;
  } else {
    // Instructors listed but no group/schedule published yet.
    entry.remarks = "no schedule published";
  }
  return entry;
}

function parseSocHtml(html: string): FacultyScheduleEntry[] {
  const $ = cheerio.load(html);
  const entries: FacultyScheduleEntry[] = [];

  $("table.newtab tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 4) {
      return;
    }
    const codeCell = cells.eq(0);
    const titleCell = cells.eq(1);
    const sem1Cell = cells.eq(2);
    const sem2Cell = cells.eq(3);

    const moduleCode = $(codeCell).text().trim();
    if (!/^[A-Z]{2,4}\d{4}[A-Z]*$/.test(moduleCode)) {
      return;
    }

    const titleText = $(titleCell).text().replace(/\s+/g, " ").trim();
    const title = titleText.replace(/Units\s*=\s*\d+.*$/i, "").trim();

    const sem1Entry = parseSemesterCell($, sem1Cell, moduleCode, title, 1);
    if (sem1Entry) {
      entries.push(sem1Entry);
    }
    const sem2Entry = parseSemesterCell($, sem2Cell, moduleCode, title, 2);
    if (sem2Entry) {
      entries.push(sem2Entry);
    }
  });

  return entries;
}

export class SocScheduleSource implements FacultyScheduleSource {
  readonly faculty = "soc";
  readonly url = SOC_URL;

  async fetchSchedule(): Promise<FacultyScheduleResult> {
    return cached(CACHE_KEY, CACHE_TTL_MS, async () => {
      try {
        const html = await fetchHtml();
        return parseSocHtml(html);
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Failed to fetch or parse SoC schedule",
          faculty: this.faculty,
          url: this.url,
          hint: "page fetch/parse failed; try fetching the page directly or ask the user to check it in a browser",
        };
      }
    });
  }
}
