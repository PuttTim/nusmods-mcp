import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

interface CacheEnvelope<T> {
  storedAt: number;
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

async function ensureCacheDir(): Promise<string> {
  const dir = cacheRoot();
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function cacheGet<T>(key: string, ttlMs: number): Promise<T | undefined> {
  const dir = await ensureCacheDir();
  const filePath = join(dir, keyToFilename(key));
  try {
    const raw = await readFile(filePath, "utf8");
    const envelope = JSON.parse(raw) as CacheEnvelope<T>;
    if (Date.now() - envelope.storedAt > ttlMs) {
      return undefined;
    }
    return envelope.value;
  } catch {
    return undefined;
  }
}

export async function cacheSet<T>(key: string, value: T): Promise<void> {
  const dir = await ensureCacheDir();
  const filePath = join(dir, keyToFilename(key));
  const envelope: CacheEnvelope<T> = { storedAt: Date.now(), value };
  await writeFile(filePath, JSON.stringify(envelope), "utf8");
}

export async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const existing = await cacheGet<T>(key, ttlMs);
  if (existing !== undefined) {
    return existing;
  }
  const value = await fetcher();
  await cacheSet(key, value);
  return value;
}
