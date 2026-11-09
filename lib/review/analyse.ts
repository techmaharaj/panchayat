import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chat } from "@/lib/llm/client";
import type { Neighbour } from "@/lib/retrieval";

export interface Analysis {
  differs_paragraph: string;
  specificity: "high" | "medium" | "low";
  specificity_evidence: string[];
  sales_evidence: string[];
  suggested_track: string;
  /** Set when the model call or its JSON failed. The page still renders. */
  degraded: boolean;
  dropped_quotes: number;
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

const FALLBACK: Analysis = {
  differs_paragraph:
    "The language analysis is unavailable for this submission. The similar prior talks and the retrieval scores below are unaffected and are the harder evidence anyway.",
  specificity: "medium",
  specificity_evidence: [],
  sales_evidence: [],
  suggested_track: "",
  degraded: true,
  dropped_quotes: 0,
};

export async function analyse(abstract: string, neighbours: Neighbour[]): Promise<Analysis> {
  const priors = neighbours
    .slice(0, 6)
    .map((n, i) => `${i + 1}. "${n.title}" (${n.conference} ${n.edition} ${n.year})`)
    .join("\n");

  const user = `ABSTRACT UNDER REVIEW:\n"""\n${abstract}\n"""\n\nMOST SIMILAR PRIOR ACCEPTED TALKS:\n${priors || "none found"}`;

  let raw: string;
  try {
    const res = await chat("analyse", [
      { role: "system", content: prompt() },
      { role: "user", content: user },
    ]);
    raw = ("choices" in res ? res.choices[0]?.message?.content : "") ?? "";
  } catch {
    return FALLBACK;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = extractJson(raw) as Record<string, unknown>;
  } catch {
    return FALLBACK;
  }

  const spec = keepVerbatim(parsed.specificity_evidence, abstract);
  const sales = keepVerbatim(parsed.sales_evidence, abstract);
  const level = String(parsed.specificity ?? "").toLowerCase();

  return {
    differs_paragraph:
      typeof parsed.differs_paragraph === "string" && parsed.differs_paragraph.trim()
        ? parsed.differs_paragraph.trim()
        : FALLBACK.differs_paragraph,
    specificity: level === "high" || level === "low" ? level : "medium",
    specificity_evidence: spec.kept,
    sales_evidence: sales.kept,
    suggested_track: typeof parsed.suggested_track === "string" ? parsed.suggested_track : "",
    degraded: false,
    dropped_quotes: spec.dropped + sales.dropped,
  };
}
