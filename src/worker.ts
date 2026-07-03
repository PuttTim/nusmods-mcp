/// <reference types="@cloudflare/workers-types" />
import { McpAgent } from "agents/mcp"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { registerAllTools } from "./registerTools.js"
import { setCache, KvCacheStore } from "./cache.js"

interface Env {
	NUSMODS_CACHE: KVNamespace
	MCP_OBJECT: DurableObjectNamespace
}

/**
 * Authless remote MCP server for Cloudflare Workers. Uses the `agents`
 * package's McpAgent (a Durable Object) to serve the same 7 tools as the
 * stdio entry over streamable HTTP (/mcp) and SSE (/sse). Tool logic is shared
 * via registerAllTools; the only difference is the cache backend (Workers KV).
 */
export class NusModsMcp extends McpAgent<Env> {
	server = new McpServer({
		name: "nusmods-mcp",
		version: "0.1.0",
	})

	async init(): Promise<void> {
		setCache(new KvCacheStore(this.env.NUSMODS_CACHE))
		registerAllTools(this.server)
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url)

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return NusModsMcp.serveSSE("/sse").fetch(request, env, ctx)
		}
		if (url.pathname === "/mcp") {
			return NusModsMcp.serve("/mcp").fetch(request, env, ctx)
		}

		return Promise.resolve(
			new Response("nusmods-mcp: connect an MCP client to /mcp (streamable HTTP) or /sse.", {
				status: 404,
				headers: { "content-type": "text/plain" },
			}),
		)
	},
}
