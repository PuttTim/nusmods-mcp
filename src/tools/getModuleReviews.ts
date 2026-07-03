import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchModuleReviews, isDisqusSoftFail } from "../disqus.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const TEXT_MAX_LENGTH = 1000;

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}…`;
}

export function registerGetModuleReviews(server: McpServer): void {
  server.registerTool(
    "get_module_reviews",
    {
      title: "Get module reviews",
      description:
        "Get community reviews/comments for a module from the NUSMods Disqus reviews thread " +
        "(https://nusmods.com/courses/{code}/reviews). Newest first. Requires a Disqus API key " +
        "(DISQUS_API_KEY); returns a structured error with setup instructions if none is configured.",
      inputSchema: {
        moduleCode: z.string().min(1).describe("Module code, e.g. CS2103T"),
        limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Max reviews to return (default ${DEFAULT_LIMIT}, cap ${MAX_LIMIT})`),
      },
    },
    async ({ moduleCode, limit }) => {
      const cappedLimit = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const result = await fetchModuleReviews(moduleCode.toUpperCase(), cappedLimit);

      if (isDisqusSoftFail(result)) {
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }

      const reviews = result.slice(0, cappedLimit).map((review) => ({
        author: review.author,
        date: review.date,
        likes: review.likes,
        dislikes: review.dislikes,
        ...(review.replyTo ? { replyTo: review.replyTo } : {}),
        text: truncate(review.text, TEXT_MAX_LENGTH),
      }));

      const payload = {
        moduleCode: moduleCode.toUpperCase(),
        totalReviews: result.length,
        returned: reviews.length,
        reviews,
      };

      return { content: [{ type: "text", text: JSON.stringify(payload) }] };
    },
  );
}
