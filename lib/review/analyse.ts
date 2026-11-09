import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chat } from "@/lib/llm/client";
import type { Neighbour } from "@/lib/retrieval";
import { buildAxes, type AxisScore } from "./axes";
import { overlapScores } from "./overlap";

export interface Analysis {
  differs_paragraph: string;
  axes: AxisScore[];
  specificity_evidence: string[];
  sales_evidence: string[];
  suggested_track: string;
  nearest_title: string | null;
  /** Set when the model call or its JSON failed. The page still renders. */
  degraded: boolean;
  dropped_quotes: number;
}

export interface SubmissionInput {
  title: string;
  abstract: string;
  track: string;
  format?: string;
  speaker_bio?: string;
  speaker_name?: string;
  speaker_employer?: string;
}

let systemPrompt: string | null = null;

function prompt(): string {
  systemPrompt ??= readFileSync(join(process.cwd(), "prompts", "analyse.md"), "utf8");
  return systemPrompt;
}

/**
 * Keep only quotes that are verbatim substrings of the source. A model that
 * paraphrases its own evidence is worse than one that gives none, because a
 * reviewer will believe the paraphrase.
 */
export function keepVerbatim(quotes: unknown, source: string): { kept: string[]; dropped: number } {
  if (!Array.isArray(quotes)) return { kept: [], dropped: 0 };
  const kept: string[] = [];
  let dropped = 0;
  const seen = new Set<string>();
  for (const q of quotes) {
    const s = typeof q === "string" ? q.trim() : "";
    if (s.length > 2 && source.includes(s) && !seen.has(s)) {
      seen.add(s);
      kept.push(s);
    } else {
      dropped += 1;
    }
  }
  return { kept, dropped };
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in response");
  return JSON.parse(body.slice(start, end + 1));
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fallback;
}

export async function analyse(
  sub: SubmissionInput,
  neighbours: Neighbour[],
): Promise<Analysis> {
  const abstract = sub.abstract;
  const overlap = overlapScores(abstract, neighbours);

  const priors = neighbours
    .slice(0, 6)
    .map((n, i) => `${i + 1}. "${n.title}" (${n.conference} ${n.edition} ${n.year}${n.track ? `, ${n.track}` : ""})`)
    .join("\n");

  const user = [
    `TRACK THE SPEAKER CHOSE: ${sub.track || "none given"}`,
    sub.format ? `FORMAT: ${sub.format}` : "",
    `TITLE: ${sub.title}`,
    `\nABSTRACT:\n"""\n${abstract}\n"""`,
    sub.speaker_bio ? `\nSPEAKER BIO:\n"""\n${sub.speaker_bio}\n"""` : "",
    `\nMOST SIMILAR PRIOR ACCEPTED TALKS:\n${priors || "none found"}`,
  ]
    .filter(Boolean)
    .join("\n");

  // Originality is not the model's to judge. It comes from the corpus.
  const originality = overlap.novelty;

  const fallback = (): Analysis => ({
    differs_paragraph:
      "The language pass is unavailable for this submission. Originality below is computed from the corpus and is unaffected: it is the harder evidence anyway.",
    axes: buildAxes(
      { content: 50, originality, relevance: 50, speaker: 50, not_a_pitch: 50 },
      { originality: overlap.nearest_title ? `Measured against "${overlap.nearest_title}".` : "" },
    ),
    specificity_evidence: [],
    sales_evidence: [],
    suggested_track: "",
    nearest_title: overlap.nearest_title,
    degraded: true,
    dropped_quotes: 0,
  });

  let raw: string;
  try {
    const res = await chat("analyse", [
      { role: "system", content: prompt() },
      { role: "user", content: user },
    ]);
    raw = ("choices" in res ? res.choices[0]?.message?.content : "") ?? "";
  } catch {
    return fallback();
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = extractJson(raw) as Record<string, unknown>;
  } catch {
    return fallback();
  }

  const spec = keepVerbatim(parsed.specificity_evidence, abstract);
  const sales = keepVerbatim(parsed.sales_evidence, abstract);

  const values = {
    content: num(parsed.content_score, 50),
    originality,
    relevance: num(parsed.relevance_score, 50),
    speaker: num(parsed.speaker_score, 50),
    not_a_pitch: num(parsed.pitch_score, 50),
  };

  const notes = {
    content: String(parsed.content_note ?? ""),
    originality: overlap.nearest_title
      ? `${overlap.overlap} percent of this abstract's distinctive vocabulary already appears in "${overlap.nearest_title}".`
      : "Nothing in the corpus is close to this.",
    relevance: String(parsed.relevance_note ?? ""),
    speaker: String(parsed.speaker_note ?? ""),
    not_a_pitch: String(parsed.pitch_note ?? ""),
  };

  return {
    differs_paragraph:
      typeof parsed.differs_paragraph === "string" && parsed.differs_paragraph.trim()
        ? parsed.differs_paragraph.trim()
        : fallback().differs_paragraph,
    axes: buildAxes(values, notes),
    specificity_evidence: spec.kept,
    sales_evidence: sales.kept,
    suggested_track: typeof parsed.suggested_track === "string" ? parsed.suggested_track : "",
    nearest_title: overlap.nearest_title,
    degraded: false,
    dropped_quotes: spec.dropped + sales.dropped,
  };
}
