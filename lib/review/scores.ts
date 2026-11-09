import { config } from "@/lib/config";
import type { Neighbour } from "@/lib/retrieval";
import { overlapScores, type OverlapResult } from "./overlap";

export type RetrievalScores = OverlapResult;

/**
 * Overlap and novelty come from term containment against the retrieved
 * neighbours, not from a model and not from the search score. See the note
 * in overlap.ts for why the search score is the wrong number to show.
 */
export function retrievalScores(abstract: string, neighbours: Neighbour[]): RetrievalScores {
  return overlapScores(abstract, neighbours);
}

const SPECIFICITY_POINTS = { high: 100, medium: 55, low: 15 } as const;

/**
 * A sort order, never an outcome. Nothing in this codebase reads the
 * composite and decides anything: see the reviewer buttons.
 */
export function composite(
  scores: RetrievalScores,
  specificity: "high" | "medium" | "low",
): { composite: number; weights: Record<string, number> } {
  const w = config().weights;
  const parts =
    w.novelty * scores.novelty +
    w.overlap * (100 - scores.overlap) +
    w.specificity * SPECIFICITY_POINTS[specificity];
  const used = w.novelty + w.overlap + w.specificity;
  return { composite: Math.round(parts / used), weights: w };
}

/** Nobody has a prior talk in the corpus the first time. Worth flagging. */
export function firstTimeSpeaker(name: string, corpusNames: Set<string>): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  return !corpusNames.has(n);
}
