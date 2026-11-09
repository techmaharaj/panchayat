import { elasticConfigured } from "@/lib/es/client";
import { memorySearch } from "./memory";
import { elasticSearch } from "./elastic";
import type { TalkSearch } from "./types";

export type { Neighbour, Talk, TalkSearch, TopicCount, Speaker } from "./types";
export { talkCount, getTalk } from "./memory";

/**
 * Everything imports search from here. Elastic is selected when it is
 * configured; the in-memory corpus is the fallback, so the app still runs
 * with Elastic entirely absent. Which one is live is printed once and
 * surfaced in the UI, because saying it out loud is part of the demo.
 */
let active: TalkSearch | null = null;

export function search(): TalkSearch {
  if (active) return active;
  active = elasticConfigured() ? elasticSearch : memorySearch;
  console.log(`[retrieval] backend: ${active.backend}`);
  return active;
}

export function backendName(): string {
  return search().backend;
}

/** Elastic can go away mid-demo. When it does, answer from memory instead. */
export async function searchWithFallback<T>(
  run: (s: TalkSearch) => Promise<T>,
): Promise<{ result: T; backend: string; degraded: boolean }> {
  const primary = search();
  try {
    return { result: await run(primary), backend: primary.backend, degraded: false };
  } catch (err) {
    if (primary === memorySearch) throw err;
    console.error(`[retrieval] ${primary.backend} failed, falling back to memory:`, err);
    return {
      result: await run(memorySearch),
      backend: `${memorySearch.backend} (fallback)`,
      degraded: true,
    };
  }
}
