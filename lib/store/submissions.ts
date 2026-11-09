import { randomUUID } from "node:crypto";
import { es, elasticConfigured } from "@/lib/es/client";
import type { AxisScore } from "@/lib/review/axes";
import type { Neighbour } from "@/lib/retrieval";

export const SUBMISSIONS_INDEX = "submissions";

export interface ReviewRecord {
  reviewer: string;
  verdict: "approve" | "reject" | "needs_discussion";
  axes: { key: string; value: number }[];
  comment: string;
  anonymised: boolean;
  decided_at: string;
}

export interface Submission {
  id: string;
  title: string;
  abstract: string;
  track: string;
  format: string;
  speaker: { name: string; employer: string; bio: string; email: string };
  submitted_at: string;
  /** null until a reviewer opens it: analysis is lazy, see the [id] route. */
  panch_score: number | null;
  analysed_at: string | null;
  axes: AxisScore[];
  differs_paragraph: string;
  specificity_evidence: string[];
  sales_evidence: string[];
  suggested_track: string;
  nearest_title: string | null;
  neighbours: Neighbour[];
  analysis_degraded: boolean;
  review: ReviewRecord | null;
}

/**
 * Submissions live in Elasticsearch. When Elastic is absent the same
 * interface is served from memory, so the whole flow still demos: the
 * submissions are lost on restart and the UI says which store answered.
 */
const memoryStore = new Map<string, Submission>();

async function ensureIndex(): Promise<void> {
  const client = es();
  if (await client.indices.exists({ index: SUBMISSIONS_INDEX })) return;
  // No number_of_replicas: serverless manages replication and rejects it.
  await client.indices.create({
    index: SUBMISSIONS_INDEX,
    mappings: {
      properties: {
        id: { type: "keyword" },
        title: { type: "text" },
        abstract: { type: "text" },
        track: { type: "keyword" },
        format: { type: "keyword" },
        speaker: {
          type: "object",
          properties: {
            name: { type: "keyword" },
            employer: { type: "keyword" },
            bio: { type: "text" },
            email: { type: "keyword" },
          },
        },
        submitted_at: { type: "date" },
        analysed_at: { type: "date" },
        panch_score: { type: "integer" },
        review: {
          type: "object",
          properties: {
            reviewer: { type: "keyword" },
            verdict: { type: "keyword" },
            comment: { type: "text" },
            anonymised: { type: "boolean" },
            decided_at: { type: "date" },
          },
        },
      },
    } as never,
  });
}

export function storeBackend(): string {
  return elasticConfigured() ? "Elasticsearch" : "in-memory (lost on restart)";
}

export function newId(): string {
  return randomUUID().slice(0, 8);
}

export async function saveSubmission(sub: Submission): Promise<{ backend: string }> {
  if (!elasticConfigured()) {
    memoryStore.set(sub.id, sub);
    return { backend: storeBackend() };
  }
  try {
    await ensureIndex();
    await es().index({
      index: SUBMISSIONS_INDEX,
      id: sub.id,
      document: sub as never,
      refresh: "wait_for",
    });
    return { backend: "Elasticsearch" };
  } catch (err) {
    console.error("[store] Elastic write failed, holding in memory:", err);
    memoryStore.set(sub.id, sub);
    return { backend: "in-memory (Elastic write failed)" };
  }
}

export async function listSubmissions(): Promise<{ items: Submission[]; backend: string }> {
  if (!elasticConfigured()) {
    return { items: [...memoryStore.values()], backend: storeBackend() };
  }
  try {
    await ensureIndex();
    const res = await es().search({
      index: SUBMISSIONS_INDEX,
      size: 200,
      sort: [{ submitted_at: { order: "desc" } }],
      query: { match_all: {} },
    } as never);
    const items = res.hits.hits.map((h) => h._source as Submission);
    // Anything written while Elastic was unreachable is still worth showing.
    const seen = new Set(items.map((i) => i.id));
    for (const [id, s] of memoryStore) if (!seen.has(id)) items.push(s);
    return { items, backend: "Elasticsearch" };
  } catch (err) {
    console.error("[store] Elastic read failed, serving memory:", err);
    return { items: [...memoryStore.values()], backend: "in-memory (Elastic read failed)" };
  }
}

export async function getSubmission(id: string): Promise<Submission | null> {
  if (memoryStore.has(id)) return memoryStore.get(id) ?? null;
  if (!elasticConfigured()) return null;
  try {
    const res = await es().get({ index: SUBMISSIONS_INDEX, id });
    return (res._source as Submission) ?? null;
  } catch {
    return null;
  }
}

/** Write the analysis back once, the first time a reviewer opens the talk. */
export async function saveAnalysis(id: string, patch: Partial<Submission>): Promise<void> {
  const existing = await getSubmission(id);
  if (!existing) return;
  if (memoryStore.has(id) || !elasticConfigured()) {
    memoryStore.set(id, { ...existing, ...patch });
    return;
  }
  try {
    await es().update({ index: SUBMISSIONS_INDEX, id, doc: patch as never, refresh: "wait_for" });
  } catch (err) {
    console.error("[store] analysis write failed, holding in memory:", err);
    memoryStore.set(id, { ...existing, ...patch });
  }
}

export async function saveReview(id: string, review: ReviewRecord): Promise<boolean> {
  const existing = await getSubmission(id);
  if (!existing) return false;
  if (memoryStore.has(id) || !elasticConfigured()) {
    memoryStore.set(id, { ...existing, review });
    return true;
  }
  try {
    await es().update({
      index: SUBMISSIONS_INDEX,
      id,
      doc: { review } as never,
      refresh: "wait_for",
    });
    return true;
  } catch (err) {
    console.error("[store] review write failed, holding in memory:", err);
    memoryStore.set(id, { ...existing, review });
    return true;
  }
}
