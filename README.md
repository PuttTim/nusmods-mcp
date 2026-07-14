# nusmods-mcp

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/PuttTim/nusmods-mcp)

A local MCP (Model Context Protocol) server for querying [NUSMods](https://nusmods.com) module and timetable data agentically from AI tools 

The server is **strictly data-only**: it fetches, decodes, and compacts data from the NUSMods v2 API and faculty schedule pages. Timetable construction, optimization, and clash avoidance are done by your own AI agent using this data.

## Tools

| Tool | Purpose |
|---|---|
| `search_modules` | Search modules by code/title, with level filter |
| `get_module_info` | Module details: description, credits, prereqs, workload, exam info; SoC modules also include per-semester instructors and availability scraped from the SoC schedule page |
| `get_module_timetable` | Condensed lesson slots for a module in a semester |
| `decode_share_url` | Decode a NUSMods share URL (incl. short links) into concrete lessons |
| `encode_share_url` | Build a canonical NUSMods share URL from selected lessons |
| `get_faculty_schedule` | Scraped course schedules: SoC (works) and Math (bot-protected; soft-fails with a hint) |
| `list_academic_calendar` | Approximate week → date-range mapping per semester |
| `get_module_reviews` | Community reviews for a module from the NUSMods Disqus thread |

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

## Reviews

`get_module_reviews` reads the community comments posted on a module's NUSMods
reviews page (e.g. `https://nusmods.com/courses/CS2103T/reviews`), which are
hosted on Disqus (forum `nusmods-prod`, thread ident = module code). These are
public forum comments, not curated or verified content.

It requires a Disqus API key:

1. Create an app at <https://disqus.com/api/applications/> to get an API key
   (only the public key is needed; no OAuth required for read-only access).
2. Configure it:
   - **stdio**: copy `.env.example` to `.env` in the project root and fill in
     `DISQUS_API_KEY` (loaded automatically at startup), or set it as an
     environment variable (env vars take precedence).
   - **Cloudflare Workers**: `npx wrangler secret put DISQUS_API_KEY`.

Without a key configured, the tool returns a structured error explaining how
to set one up instead of failing silently.

## Deploy to Cloudflare (remote server)

The fastest path is the **Deploy to Cloudflare** button at the top of this
README: it clones the repo into your GitHub account, auto-provisions the KV
namespace and Durable Object, and deploys. Afterwards, set the Disqus key on
the new Worker: `npx wrangler secret put DISQUS_API_KEY` (or via the
dashboard). Note the button only works while the repository is public.

Manual deployment from a clone:

The same 8 tools can also run as an authless remote MCP server on Cloudflare
Workers (streamable HTTP at `/mcp`, SSE at `/sse`). The Worker entry is
`src/worker.ts`; it shares all tool logic with the stdio server and only swaps
the disk cache for a Workers KV cache.

```sh
npm install
npx wrangler login                       # one-time auth

# Create the KV namespace and paste the printed id into wrangler.jsonc,
# replacing REPLACE_WITH_KV_NAMESPACE_ID:
npx wrangler kv namespace create NUSMODS_CACHE

npm run deploy                           # wrangler deploy
```

Local development needs no auth or KV id — `wrangler dev` provisions a local KV
store automatically:

```sh
npm run dev:worker                       # wrangler dev on http://127.0.0.1:8787
```

Connect a client to the deployed server (streamable HTTP):

```sh
claude mcp add --transport http nusmods https://<your-worker>.workers.dev/mcp
```

For clients that only speak SSE, use `https://<your-worker>.workers.dev/sse`.

## Configuration

No config required. Optional:

- `NUSMODS_ACAD_YEAR` — override the auto-derived academic year (format `2025-2026`).
- Academic year/semester default from the current date (Jul 1–Dec 15 → Sem 1; Dec 16–May 15 → Sem 2; mid-May–June requires an explicit `semester`). All tools accept explicit `acadYear`/`semester` params.

API responses are cached on disk under `~/.cache/nusmods-mcp` (24h TTL; scraped pages 6h). The Cloudflare Worker uses the same TTLs backed by a Workers KV namespace (`NUSMODS_CACHE`) instead of disk.

## Development

```sh
npm run build          # compile to dist/
node scripts/smoke.mjs # end-to-end smoke test of all tools over MCP stdio
```

## Data sources

- [NUSMods v2 API](https://api.nusmods.com/v2/)
- [SoC course schedule](https://www.comp.nus.edu.sg/cug/soc-sched/) (scraped)
- [Math teaching schedule](https://www.math.nus.edu.sg/modtt/modlist/) (bot-protected; the tool returns a structured hint to fetch it via a browser)
