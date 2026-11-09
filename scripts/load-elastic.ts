/**
 * Build the one `talks` index and load data/corpus.jsonl into it.
 *
 * Usage: node --experimental-strip-types --env-file=.env.local scripts/load-elastic.ts [--bm25]
 *
 * --bm25 forces the BM25-only mapping, skipping semantic_text. The script
 * also drops to BM25 on its own if the first semantic batch stalls, because
 * on hackathon day a slow inference pipeline is a fallback, not a puzzle.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@elastic/elasticsearch";

const INDEX = "talks";
const BATCH = 200;
const INFERENCE_ID = ".elser-2-elastic";
const FIRST_BATCH_BUDGET_MS = 45_000;

const forceBm25 = process.argv.includes("--bm25");

function client(): Client {
  const id = process.env.ELASTIC_CLOUD_ID;
  const apiKey = process.env.ELASTIC_API_KEY;
  if (!id || !apiKey) throw new Error("ELASTIC_CLOUD_ID / ELASTIC_API_KEY not set");
  return new Client({ cloud: { id }, auth: { apiKey }, requestTimeout: 120_000 });
}

function mappings(semantic: boolean): Record<string, unknown> {
  const props: Record<string, unknown> = {
    id: { type: "keyword" },
    title: { type: "text" },
    abstract_raw: { type: "text" },
    track: { type: "keyword" },
    session_types: { type: "keyword" },
    speakers: {
      type: "object",
      properties: {
        name: { type: "keyword" },
        job_title: { type: "text" },
        affiliation: { type: "keyword" },
        bio: { type: "text" },
      },
    },
    conference: { type: "keyword" },
    edition: { type: "keyword" },
    year: { type: "integer" },
    source_url: { type: "keyword" },
    accepted: { type: "boolean" },
  };
  if (semantic) {
    props.abstract = { type: "semantic_text", inference_id: INFERENCE_ID };
  }
  return { properties: props };
}

function readCorpus(): Record<string, unknown>[] {
  const path = join(process.cwd(), "data", "corpus.jsonl");
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

async function createIndex(es: Client, semantic: boolean) {
  if (await es.indices.exists({ index: INDEX })) {
    await es.indices.delete({ index: INDEX });
  }
  // No number_of_replicas: this cluster is serverless, which manages
  // replication itself and rejects index.number_of_replicas with a 400.
  await es.indices.create({
    index: INDEX,
    mappings: mappings(semantic) as never,
  });
  console.log(`created index ${INDEX} (semantic=${semantic})`);
}

function toDoc(t: Record<string, unknown>, semantic: boolean) {
  const doc: Record<string, unknown> = {
    id: t.id,
    title: t.title,
    abstract_raw: t.abstract,
    track: t.track,
    session_types: t.session_types,
    speakers: t.speakers,
    conference: t.conference,
    edition: t.edition,
    year: t.year,
    source_url: t.source_url,
    accepted: t.accepted ?? true,
  };
  if (semantic) doc.abstract = t.abstract;
  return doc;
}

/** Bulk one batch and surface per-document errors: bulk returns 200 while docs fail. */
async function bulkBatch(
  es: Client,
  batch: Record<string, unknown>[],
  semantic: boolean,
): Promise<{ failed: number; firstError?: string }> {
  const operations: unknown[] = [];
  for (const t of batch) {
    operations.push({ index: { _index: INDEX, _id: t.id as string } });
    operations.push(toDoc(t, semantic));
  }
  const res = await es.bulk({ operations: operations as never, refresh: false });
  if (!res.errors) return { failed: 0 };
  let failed = 0;
  let firstError: string | undefined;
  for (const item of res.items) {
    const op = item.index ?? item.create ?? item.update;
    if (op?.error) {
      failed += 1;
      firstError ??= `${op._id}: ${op.error.type} ${op.error.reason ?? ""}`;
    }
  }
  return { failed, firstError };
}

async function load(es: Client, talks: Record<string, unknown>[], semantic: boolean) {
  let indexed = 0;
  let failedTotal = 0;
  for (let i = 0; i < talks.length; i += BATCH) {
    const batch = talks.slice(i, i + BATCH);
    const started = Date.now();
    const { failed, firstError } = await bulkBatch(es, batch, semantic);
    const took = Date.now() - started;
    indexed += batch.length - failed;
    failedTotal += failed;
    if (failed) console.error(`  batch ${i / BATCH}: ${failed} failed. first: ${firstError}`);
    console.log(`  ${indexed}/${talks.length} in ${took}ms`);

    // The 2-minute decision, enforced in code: if semantic ingest is slow,
    // give up on it now rather than at 16:25.
    if (i === 0 && semantic && took > FIRST_BATCH_BUDGET_MS) {
      throw new SemanticTooSlow(took);
    }
  }
  return { indexed, failedTotal };
}

class SemanticTooSlow extends Error {
  ms: number;
  constructor(ms: number) {
    super(`first semantic batch took ${ms}ms`);
    this.ms = ms;
  }
}

async function main() {
  const es = client();
  const talks = readCorpus();
  console.log(`corpus: ${talks.length} talks`);

  let semantic = !forceBm25;
  let result: { indexed: number; failedTotal: number };

  await createIndex(es, semantic);
  try {
    result = await load(es, talks, semantic);
  } catch (err) {
    if (!(err instanceof SemanticTooSlow)) throw err;
    console.error(`\nFALLBACK: ${err.message}. Rebuilding BM25-only and not revisiting.\n`);
    semantic = false;
    await createIndex(es, semantic);
    result = await load(es, talks, semantic);
  }

  await es.indices.refresh({ index: INDEX });
  const count = await es.count({ index: INDEX });
  console.log(
    `\ndone. mode=${semantic ? "semantic+bm25" : "bm25"} indexed=${result.indexed} ` +
      `failed=${result.failedTotal} _count=${count.count}`,
  );
  if (count.count !== talks.length) {
    console.error(`MISMATCH: expected ${talks.length}, got ${count.count}`);
    process.exit(1);
  }
  // Leave a marker the app reads so search knows whether semantic exists.
  const mapping = await es.indices.getMapping({ index: INDEX });
  const props = mapping[INDEX]?.mappings?.properties ?? {};
  console.log(`semantic field present: ${Boolean((props as Record<string, unknown>).abstract)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
