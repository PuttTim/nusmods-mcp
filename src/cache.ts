import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Minimal key/value cache abstraction shared by both entrypoints. TTL is
 * supplied at write time (KV stores are natively TTL-based) so `get` needs no
 * TTL argument. The stdio entry uses {@link DiskCache}; the Cloudflare Worker
 * uses {@link KvCache} backed by a Workers KV namespace.
 */
export interface KvCache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
}

interface CacheEnvelope<T> {
  expiresAt: number;
  value: T;
}

function cacheRoot(): string {
  const xdgCacheHome = process.env["XDG_CACHE_HOME"];
  const base = xdgCacheHome && xdgCacheHome.length > 0 ? xdgCacheHome : join(homedir(), ".cache");
  return join(base, "nusmods-mcp");
}

function keyToFilename(key: string): string {
  const hash = createHash("sha256").update(key).digest("hex");
  return `${hash}.json`;
}

/** On-disk cache under `~/.cache/nusmods-mcp` (or `$XDG_CACHE_HOME`). */
export class DiskCache implements KvCache {
  private async ensureDir(): Promise<string> {
    const dir = cacheRoot();
    await mkdir(dir, { recursive: true });
    return dir;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const dir = await this.ensureDir();
    const filePath = join(dir, keyToFilename(key));
    try {
      const raw = await readFile(filePath, "utf8");
      const envelope = JSON.parse(raw) as CacheEnvelope<T>;
      if (Date.now() > envelope.expiresAt) {
        return undefined;
      }
      return envelope.value;
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const dir = await this.ensureDir();
    const filePath = join(dir, keyToFilename(key));
    const envelope: CacheEnvelope<T> = { expiresAt: Date.now() + ttlMs, value };
    await writeFile(filePath, JSON.stringify(envelope), "utf8");
  }
}

/**
 * Minimal structural type for a Cloudflare Workers KV namespace, declared
 * locally so the main (Node) tsconfig needs no `@cloudflare/workers-types`
 * dependency. The Worker passes a real `KVNamespace`, which is assignable.
 */
export interface KvNamespaceLike {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/** Cloudflare Workers KV-backed cache. KV enforces TTL natively. */
export class KvCacheStore implements KvCache {
  constructor(private readonly kv: KvNamespaceLike) {}

  async get<T>(key: string): Promise<T | undefined> {
    const value = (await this.kv.get(key, "json")) as T | null;
    return value ?? undefined;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    // KV requires expirationTtl >= 60 seconds.
    const expirationTtl = Math.max(60, Math.round(ttlMs / 1000));
    await this.kv.put(key, JSON.stringify(value), { expirationTtl });
  }
}

let activeCache: KvCache = new DiskCache();

/** Swap the process-wide cache backend (called by the Worker entrypoint). */
export function setCache(cache: KvCache): void {
  activeCache = cache;
}

/**
 * Read-through cache. When `isCacheable` is given, values failing the
 * predicate (e.g. soft-fail error objects) are never written, and a stale
 * cached value failing it is treated as a miss — so transient errors like an
 * invalid API key are retried on the next request instead of being served
 * for the full TTL.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  isCacheable?: (value: T) => boolean,
): Promise<T> {
  const existing = await activeCache.get<T>(key);
  if (existing !== undefined && (isCacheable === undefined || isCacheable(existing))) {
    return existing;
  }
  const value = await fetcher();
  if (isCacheable === undefined || isCacheable(value)) {
    await activeCache.set(key, value, ttlMs);
  }
  return value;
}
