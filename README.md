# nusmods-mcp

A local MCP (Model Context Protocol) server for querying [NUSMods](https://nusmods.com) module and timetable data agentically from AI tools (Claude Code, Claude Desktop, Cursor, …).

The server is **strictly data-only**: it fetches, decodes, and compacts data from the NUSMods v2 API and faculty schedule pages. Timetable construction, optimization, and clash avoidance are done by the AI agent using this data. See [PRD.md](./PRD.md) for the full design.

## Tools

| Tool | Purpose |
|---|---|
| `search_modules` | Search modules by code/title, with level filter |
| `get_module_info` | Module details: description, credits, prereqs, workload, exam info |
| `get_module_timetable` | Condensed lesson slots for a module in a semester |
| `decode_share_url` | Decode a NUSMods share URL (incl. short links) into concrete lessons |
| `encode_share_url` | Build a canonical NUSMods share URL from selected lessons |
| `get_faculty_schedule` | Scraped course schedules: SoC (works) and Math (bot-protected; soft-fails with a hint) |
| `list_academic_calendar` | Approximate week → date-range mapping per semester |

## Setup

```sh
npm install
npm run build
```

### Register in Claude Code

```sh
claude mcp add nusmods -- node /path/to/nusmods-mcp/dist/index.js
```

### Register in Claude Desktop / other clients

```json
{
  "mcpServers": {
    "nusmods": {
      "command": "node",
      "args": ["/path/to/nusmods-mcp/dist/index.js"]
    }
  }
}
```

## Configuration

No config required. Optional:

- `NUSMODS_ACAD_YEAR` — override the auto-derived academic year (format `2025-2026`).
- Academic year/semester default from the current date (Jul 1–Dec 15 → Sem 1; Dec 16–May 15 → Sem 2; mid-May–June requires an explicit `semester`). All tools accept explicit `acadYear`/`semester` params.

API responses are cached on disk under `~/.cache/nusmods-mcp` (24h TTL; scraped pages 6h).

## Development

```sh
npm run build          # compile to dist/
node scripts/smoke.mjs # end-to-end smoke test of all tools over MCP stdio
```

## Data sources

- [NUSMods v2 API](https://api.nusmods.com/v2/)
- [SoC course schedule](https://www.comp.nus.edu.sg/cug/soc-sched/) (scraped)
- [Math teaching schedule](https://www.math.nus.edu.sg/modtt/modlist/) (bot-protected; the tool returns a structured hint to fetch it via a browser)
