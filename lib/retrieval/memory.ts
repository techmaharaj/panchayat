import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Neighbour, TalkSearch, Talk, TopicCount } from "./types";

/**
 * In-memory BM25 over data/corpus.jsonl. 3,436 docs is nothing, and the
 * KubeCon jargon is distinctive enough that term overlap gives genuinely
 * good neighbours. This is the fallback that keeps the app running with
 * Elastic entirely absent.
 */

const STOP = new Set(
  ("a an and are as at be been by for from has have how i in is it its of on or " +
    "that the this to was were what when which who will with you your we our us " +
    "they their about into over more most can could should would their there here " +
    "talk session attendees learn learns audience will also not but if then than")
    .split(" "),
);

export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9+#.\- ]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[.\-]+|[.\-]+$/g, ""))
    .filter((t) => t.length > 2 && !STOP.has(t));
}

interface Doc {
  talk: Talk;
  tf: Map<string, number>;
  len: number;
  titleTerms: Set<string>;
  haystack: string;
}

interface Corpus {
  docs: Doc[];
  df: Map<string, number>;
  avgLen: number;
  byId: Map<string, Doc>;
}

let corpus: Corpus | null = null;

/** Document frequency across the corpus, for callers weighting rare terms. */
export function documentFrequency(term: string): number {
  return load().df.get(term) ?? 0;
}

export function corpusSize(): number {
  return load().docs.length;
}

function load(): Corpus {
  if (corpus) return corpus;
  const path = join(process.cwd(), "data", "corpus.jsonl");
  const docs: Doc[] = [];
  const df = new Map<string, number>();
  let totalLen = 0;

  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const talk = JSON.parse(line) as Talk;
    const titleTerms = new Set(tokens(talk.title ?? ""));
    // Title terms counted twice: a topic in the title is what the talk is about.
    const terms = [...tokens(talk.title ?? ""), ...titleTerms, ...tokens(talk.abstract ?? "")];
    const tf = new Map<string, number>();
    for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    totalLen += terms.length;
    docs.push({
      talk,
      tf,
      len: terms.length,
      titleTerms,
      haystack: `${talk.title ?? ""} ${talk.abstract ?? ""}`.toLowerCase(),
    });
  }

  const byId = new Map(docs.map((d) => [d.talk.id, d]));
  corpus = { docs, df, avgLen: totalLen / Math.max(docs.length, 1), byId };
  return corpus;
}

const K1 = 1.2;
const B = 0.75;

function bm25(c: Corpus, queryTerms: string[], doc: Doc): number {
  const N = c.docs.length;
  let score = 0;
  for (const t of queryTerms) {
    const f = doc.tf.get(t);
    if (!f) continue;
    const n = c.df.get(t) ?? 0;
    const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
    score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + B * (doc.len / c.avgLen))));
  }
  return score;
}

function toNeighbour(doc: Doc, similarity: number): Neighbour {
  const t = doc.talk;
  return {
    id: t.id,
    title: t.title,
    conference: t.conference,
    edition: t.edition,
    year: t.year,
    track: t.track,
    source_url: t.source_url,
    similarity,
    speakers: t.speakers,
    abstract: t.abstract,
  };
}

export function talkCount(): number {
  return load().docs.length;
}

export function getTalk(id: string): Talk | undefined {
  return load().byId.get(id)?.talk;
}

export const memorySearch: TalkSearch = {
  backend: "in-memory BM25",

  async searchSimilar(text, o) {
    const c = load();
    const k = o?.k ?? 10;
    const qt = [...new Set(tokens(text))];
    if (!qt.length) return [];
    const scored: { doc: Doc; raw: number }[] = [];
    for (const doc of c.docs) {
      if (o?.excludeId && doc.talk.id === o.excludeId) continue;
      const raw = bm25(c, qt, doc);
      if (raw > 0) scored.push({ doc, raw });
    }
    scored.sort((a, b) => b.raw - a.raw);
    const top = scored.slice(0, k);
    // Normalise against the best hit so the UI has a 0..1 scale to show.
    const best = top[0]?.raw ?? 1;
    return top.map((s) => toNeighbour(s.doc, Math.min(1, s.raw / best)));
  },

  async countTopic(topic) {
    const c = load();
    const needle = topic.toLowerCase().trim();
    const qt = [...new Set(tokens(topic))];
    // A topic count is a substring/term match, not a relevance ranking: the
    // number has to mean "talks that are about this", so be strict.
    const hits = c.docs.filter((d) => {
      if (needle.length > 2 && d.haystack.includes(needle)) return true;
      if (qt.length > 1) return qt.every((t) => d.haystack.includes(t));
      return false;
    });
    const byYear: Record<string, number> = {};
    for (const h of hits) byYear[String(h.talk.year)] = (byYear[String(h.talk.year)] ?? 0) + 1;
    const ranked = hits
      .map((d) => ({ d, raw: bm25(c, qt, d) }))
      .sort((a, b) => b.raw - a.raw)
      .slice(0, 5);
    const best = ranked[0]?.raw ?? 1;
    return {
      total: hits.length,
      byYear: Object.fromEntries(Object.entries(byYear).sort(([a], [b]) => a.localeCompare(b))),
      examples: ranked.map((r) => toNeighbour(r.d, Math.min(1, r.raw / best))),
    };
  },
};
