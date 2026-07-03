import { cached } from "./cache.js";

const API_BASE = "https://disqus.com/api/3.0";
const FORUM = "nusmods-prod";
const USER_AGENT = "nusmods-mcp/0.1 (local MCP server)";
const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_LIMIT = 100;
const HARD_CAP = 200;

let apiKey: string | undefined;

/** Set the Disqus API key programmatically (used by the Worker entry). */
export function setDisqusApiKey(key: string | undefined): void {
  apiKey = key;
}

/** Resolve the configured Disqus API key, falling back to `DISQUS_API_KEY` env (stdio only). */
export function getDisqusApiKey(): string | undefined {
  if (apiKey) {
    return apiKey;
  }
  if (typeof process !== "undefined" && process.env) {
    return process.env["DISQUS_API_KEY"];
  }
  return undefined;
}

export interface ModuleReview {
  author: string;
  date?: string;
  likes: number;
  dislikes: number;
  text: string;
  replyTo?: string;
}

export interface DisqusSoftFail {
  error: string;
}

export function isDisqusSoftFail(value: unknown): value is DisqusSoftFail {
  return typeof value === "object" && value !== null && "error" in value;
}

interface DisqusPost {
  id: string;
  parent?: string | number | null;
  author?: { name?: string };
  createdAt?: string;
  likes?: number;
  dislikes?: number;
  message?: string;
  raw_message?: string;
  isDeleted?: boolean;
}

interface DisqusListPostsResponse {
  code: number;
  response?: DisqusPost[];
  cursor?: { hasNext?: boolean; next?: string };
  // On error, Disqus returns { code, response: "message" } (response is a string, not an array).
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .trim();
}

async function fetchPage(moduleCode: string, key: string, cursor?: string): Promise<DisqusListPostsResponse> {
  const params = new URLSearchParams({
    api_key: key,
    forum: FORUM,
    "thread:ident": moduleCode.toUpperCase(),
    limit: String(PAGE_LIMIT),
    order: "desc",
  });
  if (cursor) {
    params.set("cursor", cursor);
  }
  const response = await fetch(`${API_BASE}/threads/listPosts.json?${params.toString()}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  return (await response.json()) as DisqusListPostsResponse;
}

/**
 * Fetch and normalize reviews (Disqus comments) for a module's NUSMods
 * reviews thread. Paginates via cursor until the thread is exhausted or
 * {@link HARD_CAP} posts are fetched, so the returned length is the thread's
 * review count for threads under the cap. Results are cached per module code
 * for 24h. Returns a soft-fail object on any Disqus API error (invalid key,
 * unknown thread, etc.) instead of throwing.
 */
export async function fetchModuleReviews(moduleCode: string): Promise<ModuleReview[] | DisqusSoftFail> {
  const key = getDisqusApiKey();
  if (!key) {
    return {
      error:
        "No Disqus API key configured. Create one at https://disqus.com/api/applications/ and set it via the " +
        "DISQUS_API_KEY environment variable (stdio) or `npx wrangler secret put DISQUS_API_KEY` (Cloudflare).",
    };
  }

  const cacheKey = `disqusReviews:${moduleCode.toUpperCase()}`;

  const result = await cached(cacheKey, DAY_MS, async () => {
    const posts: DisqusPost[] = [];
    let cursor: string | undefined;
    let softFail: DisqusSoftFail | undefined;

    while (posts.length < HARD_CAP) {
      const page = await fetchPage(moduleCode, key, cursor);
      if (page.code !== 0 || !Array.isArray(page.response)) {
        const message = typeof page.response === "string" ? page.response : `Disqus API error (code ${page.code})`;
        softFail = { error: message };
        break;
      }
      posts.push(...page.response);
      if (!page.cursor?.hasNext || !page.cursor.next) {
        break;
      }
      cursor = page.cursor.next;
    }

    if (softFail) {
      return softFail;
    }

    const authorById = new Map<string, string>();
    for (const post of posts) {
      authorById.set(post.id, post.author?.name ?? "unknown");
    }

    const reviews: ModuleReview[] = posts
      .filter((post) => !post.isDeleted)
      .map((post) => {
        // raw_message can still contain HTML tags and entities, so always strip.
        const text = stripHtml(post.raw_message || post.message || "");
        const parentId = post.parent != null ? String(post.parent) : undefined;
        const replyTo = parentId ? authorById.get(parentId) : undefined;
        return {
          author: post.author?.name ?? "unknown",
          date: post.createdAt,
          likes: post.likes ?? 0,
          dislikes: post.dislikes ?? 0,
          text,
          ...(replyTo ? { replyTo } : {}),
        };
      });

    return reviews;
  }, (value) => !isDisqusSoftFail(value));

  return result;
}
