# PRD: NUSMods MCP Server

**Status:** Draft v1 · 2026-07-03
**Owner:** putt

## 1. Overview

A locally hosted MCP server that lets AI agents (Claude Code, Claude Desktop, Cursor, etc.) query NUS module and timetable data agentically. Data sources are the official NUSMods v2 API plus scraped faculty teaching-schedule pages (Math, SoC). See §11 for all source URLs.

The server is **strictly data-only**: it fetches, decodes, and compacts data. All reasoning — timetable construction, optimization (fewest gaps, fewest days on campus), clash avoidance — is done by the AI agent using the data the server provides. The server performs no solving, validation, or scoring.

## 2. Goals

- Let an agent look up modules: search by code/name, get details (description, credits, prereqs, exam info, workload).
- Let an agent retrieve full semester lesson data (lecture/tutorial/lab slots with day, time, weeks, venue) in a compact form suitable for the agent to construct and optimize timetables itself.
- Decode a NUSMods share URL into the structured timetable it represents.
- Encode an agent-selected timetable into a NUSMods share URL that the user can open/import on nusmods.com.
- Retrieve upcoming-semester course offering schedules from faculty websites (Math and SoC) before they appear in NUSMods.
- Run locally with zero-friction registration in MCP clients (stdio).

## 3. Non-goals (v1)

- **No optimization/solver/validation on the server** — no clash checking, no gap/day metrics, no timetable generation. (Explicit decision; revisit if agent-side reasoning proves unreliable.)
- ~~**Module reviews** — the v2 API has no reviews endpoint; nusmods.com reviews live in Disqus. Out of scope; possible future work via alternative sources.~~ *(Superseded 2026-07-03: `get_module_reviews` added, reading directly from the official Disqus API (`threads/listPosts`) against the `nusmods-prod` forum, using a user-provided `DISQUS_API_KEY`.)*
- ~~**Cloud deployment** — local only.~~ *(Superseded 2026-07-03: an authless Cloudflare Workers deployment target was added — streamable HTTP at `/mcp` via the `agents` McpAgent pattern, Workers KV cache, same shared tool logic as the stdio entry. Auth and multi-tenancy remain out of scope.)*
- Writing back to NUSMods (creating/saving timetables on nusmods.com).
- Faculties beyond Math and SoC (adapter design allows adding them later).

## 4. Users & scenarios

Single user (the developer) driving an AI agent locally.

1. **"Plan my Sem 1 timetable for CS2103T, CS2101, MA2104, GEA1000 with fewest days on campus."** Agent calls lesson-data tools per module, reasons over the slots, proposes a timetable, calls `encode_share_url`, and outputs a NUSMods share URL the user can open/import.
2. **"What's CS3230 about, and what are its prereqs and exam date?"** Agent calls module-info tool.
3. **"Here's my planned timetable <share URL> — how many free afternoons do I have?"** Agent calls the share-URL decode tool, then reasons.
4. **"I want another module that fits my current schedule — pick from this list: MA3252, CS3243, ST2334."** Agent decodes the user's share URL (or uses a timetable built earlier in the conversation), calls `get_module_timetable` for each candidate, and reasons about which candidates have at least one clash-free lesson combination against the existing schedule, reporting the viable options and the slots to take.
5. **"Is MA4207 offered next semester?"** Agent checks NUSMods data and/or the Math faculty schedule scraper (faculty pages often publish earlier).

## 5. Architecture

- **Language/runtime:** TypeScript on Node.js, official `@modelcontextprotocol/sdk`. Reuse types from the NUSMods repo (`nusmodifications/nusmods`) where practical.
- **Transport:** stdio (local). Keep server core transport-agnostic so streamable HTTP can be added later for cloud.
- **Data layer:**
  - NUSMods v2 API client with **on-disk cache** (data updates at most daily; NUSMods asks clients to cache). Cache keyed by endpoint + acad year; TTL ~24h; stored under an XDG/`~/.cache/nusmods-mcp` path.
  - Faculty scrapers behind a per-faculty **adapter interface** (`FacultyScheduleSource` → `math`, `soc`), each returning a normalized `{ moduleCode, title, semester, remarks }` shape. Scraped pages cached with a shorter TTL (~6h).
- **Output discipline:** every tool returns compact, purpose-trimmed JSON. Never dump raw API payloads. Search returns code+title only; lesson data is condensed (grouped by lesson type, deduped week patterns).
- **Config:** current academic year and semester are auto-derived from date (override via env/param). All tools take optional `acadYear`/`semester` params defaulting to the current/upcoming one.
  - Default semester rule:
    - July 1 through December 15: Semester 1.
    - December 16 through May 15: Semester 2.
    - May 16 through June 30: no regular semester default; require explicit `semester` unless the tool can operate across semesters.
  - Academic year follows the default semester window. Semester 1 uses the academic year beginning that calendar year; Semester 2 uses the academic year beginning the previous calendar year.

## 6. Tools (v1 surface)

| Tool | Input | Output |
|---|---|---|
| `search_modules` | query string, optional faculty/level filters | list of `{code, title}` (paginated/capped) |
| `get_module_info` | module code, acadYear? | description, credits, department, prereq/coreq/preclusion, workload, semesters offered, exam date/duration |
| `get_module_timetable` | module code, semester, acadYear? | condensed lesson slots: per lesson type, classNo → day/start/end/weeks/venue |
| `decode_share_url` | NUSMods timetable share URL (incl. shortened) | semester + per-module chosen lesson slots resolved to concrete times/venues |
| `encode_share_url` | semester, selected lessons `{ moduleCode, lessonType, classNo }[]`, optional acadYear? | canonical `https://nusmods.com/timetable/sem-{n}/share?...` URL |
| `get_faculty_schedule` | faculty (`math` \| `soc`), optional semester/module filter | normalized offering list scraped from the faculty page |
| `list_academic_calendar` | acadYear? | semester date ranges (from NUSMods data), so the agent can map weeks to dates |
| `get_module_reviews` | module code, limit? | community reviews from the module's NUSMods Disqus thread (author, date, likes/dislikes, text), via the official Disqus API and a user-provided key |

Notes:
- `decode_share_url` must handle the `?CS2103T=LEC:G12,TUT:04`-style query encoding and follow NUSMods short links.
- `encode_share_url` is serialization only: it must not solve, optimize, validate clashes, or choose lessons. It may optionally verify that each module/lesson/class exists and report unknown selections before returning a URL.
- Rationale for no `check_timetable`/`optimize_timetable`: explicit product decision to keep the server strictly data-only.

## 7. Functional requirements

- FR1: All NUSMods data served from cache when fresh; cache miss triggers fetch with polite user-agent.
- FR2: Lesson data output for a typical module fits within a few hundred tokens; a 6-module query set stays within a reasonable context budget (~<8k tokens total).
- FR3: Scrapers fail soft: on parse failure return a structured error naming the faculty + URL so the agent can fall back to fetching the page itself or telling the user.
- FR4: Share-URL decoding resolves lesson keys against cached module timetable data and reports unknown/ambiguous class numbers explicitly.
- FR5: Share-URL encoding returns a deterministic canonical URL, grouping lessons by module and preserving NUSMods' expected lesson-type/class-number encoding.
- FR6: Server registers and runs via a single command (`npx nusmods-mcp` or `node dist/index.js`) with no required config.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Agents produce clashing/suboptimal timetables (no server validation by design) | Accepted for v1; revisit adding a validation tool if it bites |
| Faculty page HTML changes break scrapers | Adapter isolation, soft-fail errors, scrapers are best-effort |
| Large lesson payloads blow context | Condensed output formats, dedupe, per-tool caps |
| NUSMods API shape changes | Pin to v2, thin client layer, reuse upstream types |

## 9. Milestones

1. **M1 — Core API tools:** scaffold, cache layer, `search_modules`, `get_module_info`, `get_module_timetable`, `list_academic_calendar`.
2. **M2 — Timetable URL tools:** `decode_share_url` incl. short-link resolution, plus `encode_share_url`.
3. **M3 — Faculty scrapers:** adapter interface + Math + SoC scrapers.
4. **M4 — Polish:** output-size tuning, error messages, README with client registration instructions.

## 10. Open questions / future work

- Add `check_timetable` (clash/metrics) if agent-only reasoning proves unreliable.
- Reviews via alternative sources (Reddit, Telegram) — future.
- More faculty adapters; cloud/HTTP deployment — future.

## 11. References

**Data sources**
- NUSMods v2 API base: https://api.nusmods.com/v2/
- API docs: https://api.nusmods.com/v2/#/ (Swagger UI)
- Key endpoints (per academic year, e.g. `2026-2027`):
  - Module list: `https://api.nusmods.com/v2/{acadYear}/moduleList.json`
  - Module summaries: `https://api.nusmods.com/v2/{acadYear}/moduleInfo.json`
  - Full module detail incl. timetable: `https://api.nusmods.com/v2/{acadYear}/modules/{moduleCode}.json`
- Math faculty teaching schedule: https://www.math.nus.edu.sg/modtt/modlist/
- SoC course schedule: https://www.comp.nus.edu.sg/cug/soc-sched/

**Upstream project**
- NUSMods monorepo (types to reuse, share-URL encoding logic): https://github.com/nusmodifications/nusmods
- NUSMods website (share-URL format reference): https://www.nusmods.com — share links look like `https://nusmods.com/timetable/sem-1/share?CS2103T=LEC:G12,TUT:04&...`, plus shortened links via `https://nusmods.com/short_url` redirects

**Tooling**
- MCP TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
