import * as cheerio from "cheerio";
import { cached } from "../cache.js";
import type { FacultyScheduleEntry, FacultyScheduleResult, FacultyScheduleSource } from "./types.js";

const MATH_URL = "https://www.math.nus.edu.sg/modtt/modlist/";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function looksLikeIncapsulaStub(html: string): boolean {
  if (html.trim().length === 0) {
    return true;
  }
  return /_Incapsula_Resource|Incapsula incident ID/i.test(html);
}

async function fetchHtml(): Promise<string> {
  const response = await fetch(MATH_URL, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!response.ok) {
    throw new Error(`Math schedule fetch failed with status ${response.status}`);
  }
  return response.text();
}

/**
 * Best-effort parser for the real modlist page, in case Incapsula ever lets a
 * plain fetch through. The archived layout (web.archive.org) uses a table
 * with columns: Module Code | Module Title | Lecturer | Timetable.
 * This is speculative and defensively coded: any row shape mismatch is
 * skipped rather than thrown.
 */
function parseMathHtml(html: string): FacultyScheduleEntry[] {
  const $ = cheerio.load(html);
  const entries: FacultyScheduleEntry[] = [];

  $("table tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 2) {
      return;
    }
    const moduleCode = $(cells.eq(0)).text().trim();
    if (!/^[A-Z]{2,4}\d{4}[A-Z]*$/.test(moduleCode)) {
      return;
    }
    const title = $(cells.eq(1)).text().replace(/\s+/g, " ").trim();
    const remarks = cells.length > 2 ? $(cells.eq(2)).text().replace(/\s+/g, " ").trim() : undefined;

    entries.push({
      moduleCode,
      title: title.length > 0 ? title : undefined,
      remarks: remarks && remarks.length > 0 ? remarks : undefined,
    });
  });

  return entries;
}

export class MathScheduleSource implements FacultyScheduleSource {
  readonly faculty = "math";
  readonly url = MATH_URL;

  async fetchSchedule(): Promise<FacultyScheduleResult> {
    return cached(`faculty-schedule:math`, CACHE_TTL_MS, async () => {
      try {
        const html = await fetchHtml();
        if (looksLikeIncapsulaStub(html)) {
          return {
            error: "page is bot-protected (Incapsula challenge); could not retrieve real content via plain fetch",
            faculty: this.faculty,
            url: this.url,
            hint: "page is bot-protected; fetch it in a browser or ask the agent to use its own web tools",
          };
        }
        const entries = parseMathHtml(html);
        if (entries.length === 0) {
          return {
            error: "fetched page but could not parse any module rows; page structure may have changed",
            faculty: this.faculty,
            url: this.url,
            hint: "page is bot-protected; fetch it in a browser or ask the agent to use its own web tools",
          };
        }
        return entries;
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Failed to fetch Math schedule",
          faculty: this.faculty,
          url: this.url,
          hint: "page is bot-protected; fetch it in a browser or ask the agent to use its own web tools",
        };
      }
    });
  }
}
