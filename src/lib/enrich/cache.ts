// Enrichment cache — snippet_hash → stored outcome. Read once, memoized;
// writes are best-effort (runtime FS may be read-only).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ENRICHMENT_CACHE_PATH } from "../paths";
import type { EnrichmentOutcome } from "./index";

export type CacheEntry = Omit<EnrichmentOutcome, "finding_id" | "cached">;

// Keyed per (file, snippet): identical lines in different files must not
// share a judgment — code_summary and reasoning describe the line in its
// surrounding context.
export function cacheKey(file: string, snippet_hash: string): string {
  return `${file}:${snippet_hash}`;
}

let cache: Record<string, CacheEntry> | null = null;

export function loadCache(): Record<string, CacheEntry> {
  if (cache !== null) return cache;
  try {
    const parsed: unknown = JSON.parse(readFileSync(ENRICHMENT_CACHE_PATH, "utf8"));
    cache =
      parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, CacheEntry>)
        : {};
  } catch {
    cache = {}; // missing or unreadable file → empty cache
  }
  return cache;
}

export function lookupCache(key: string): CacheEntry | undefined {
  return loadCache()[key];
}

export function persistCacheEntry(key: string, outcome: EnrichmentOutcome): void {
  const map = loadCache();
  const { finding_id: _finding_id, cached: _cached, ...entry } = outcome;
  map[key] = entry;
  try {
    mkdirSync(path.dirname(ENRICHMENT_CACHE_PATH), { recursive: true });
    writeFileSync(ENRICHMENT_CACHE_PATH, JSON.stringify(map, null, 2) + "\n", "utf8");
  } catch {
    // Runtime FS may be read-only; the in-memory map is still updated.
  }
}
