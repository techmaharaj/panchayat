import { config, axes as axisList } from "@/lib/config";

export interface AxisScore {
  key: string;
  label: string;
  weight: number;
  /** 0 to 100 as the model and retrieval saw it. */
  ai: number;
  /** What a human put here instead, when they did. */
  human?: number;
  note: string;
}

/**
 * The Panch Score. Panch is five: five axes, five elders of the council.
 *
 * It is a sort order for a queue of 200 submissions, not a verdict. Nothing
 * in this codebase reads it and decides anything, and a reviewer can move
 * any axis and watch it move.
 */
export function panchScore(scores: AxisScore[]): number {
  let total = 0;
  let weight = 0;
  for (const a of scores) {
    const v = a.human ?? a.ai;
    total += a.weight * v;
    weight += a.weight;
  }
  return weight ? Math.round(total / weight) : 0;
}

export function buildAxes(values: Record<string, number>, notes: Record<string, string>): AxisScore[] {
  return axisList().map((a) => ({
    key: a.key,
    label: a.label,
    weight: a.weight,
    ai: Math.max(0, Math.min(100, Math.round(values[a.key] ?? 0))),
    note: notes[a.key] ?? "",
  }));
}

/** 0 to 100 as a 1 to 5 star rating, which is the language reviewers use. */
export function stars(value: number): number {
  return Math.max(1, Math.min(5, Math.round((value / 100) * 4 + 1)));
}

export function tracks(): string[] {
  return config().tracks;
}

export function formats(): string[] {
  return config().formats;
}
