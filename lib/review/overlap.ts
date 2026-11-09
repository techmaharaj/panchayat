import { tokens, documentFrequency, corpusSize } from "@/lib/retrieval/memory";
import type { Neighbour } from "@/lib/retrieval";

/**
 * How much of this abstract's distinctive vocabulary already appears in the
 * prior talks nearest to it.
 *
 * This is deliberately not the search score. A BM25 or RRF score has no
 * absolute meaning: normalising it against the top hit in its own result set
 * makes the nearest neighbour 100 every time, which looks like a number and
 * is not one. Term containment is absolute, comparable between submissions,
 * and a reviewer can check it by reading.
 *
 * Rare terms count for more than common ones, because "Kubernetes" appearing
 * in both says nothing and "LDAP" appearing in both says a lot.
 */
export function overlapAgainst(abstract: string, neighbour: Neighbour): number {
  const queryTerms = new Set(tokens(abstract));
  if (!queryTerms.size) return 0;
  const theirs = new Set(tokens(`${neighbour.title} ${neighbour.abstract ?? ""}`));
  const N = corpusSize();

  let weightTotal = 0;
  let weightShared = 0;
  for (const t of queryTerms) {
    const df = documentFrequency(t);
    // Unseen terms are the rarest of all, so floor the df at 1 rather than 0.
    const idf = Math.log(1 + N / Math.max(df, 1));
    weightTotal += idf;
    if (theirs.has(t)) weightShared += idf;
  }
  if (weightTotal === 0) return 0;
  return weightShared / weightTotal;
}

export interface OverlapResult {
  /** 0 to 100 against the single nearest prior talk. */
  overlap: number;
  novelty: number;
  nearest_title: string | null;
  /** Mean over the top three, so one coincidence does not dominate. */
  mean_top3: number;
}

export function overlapScores(abstract: string, neighbours: Neighbour[]): OverlapResult {
  if (!neighbours.length) {
    return { overlap: 0, novelty: 100, nearest_title: null, mean_top3: 0 };
  }
  const scored = neighbours.map((n) => overlapAgainst(abstract, n));
  const best = Math.max(...scored);
  const bestAt = scored.indexOf(best);
  const top3 = [...scored].sort((a, b) => b - a).slice(0, 3);
  const mean3 = top3.reduce((a, b) => a + b, 0) / top3.length;
  return {
    overlap: Math.round(100 * best),
    novelty: Math.round(100 * (1 - best)),
    nearest_title: neighbours[bestAt]?.title ?? null,
    mean_top3: Math.round(100 * mean3),
  };
}
