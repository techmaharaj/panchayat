/**
 * How do we know retrieval works?
 *
 * The corpus contains talks that ran under the same title in more than one
 * edition. Query with one twin's abstract, exclude it, and check whether a
 * sibling comes back in the top 5. That gives a recall@5 with no human
 * labelling and no made-up ground truth.
 *
 * Usage: node --experimental-strip-types --env-file=.env.local scripts/eval-retrieval.ts
 *
 * Elastic is queried over HTTP here rather than through lib/retrieval so the
 * script needs no bundler to resolve path aliases.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memorySearch } from "../lib/retrieval/memory.ts";

interface Rec {
  id: string;
  title: string;
  abstract: string;
}

const K = 5;

function normaliseTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function corpus(): Rec[] {
  return readFileSync(join(process.cwd(), "data", "corpus.jsonl"), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Rec);
}

function esUrl(): string {
  const cloudId = process.env.ELASTIC_CLOUD_ID;
  if (!cloudId) throw new Error("no ELASTIC_CLOUD_ID");
  const decoded = Buffer.from(cloudId.split(":")[1], "base64").toString("utf8");
  const [host, esId] = decoded.split("$");
  return `https://${esId}.${host}`;
}

async function elasticTop(text: string, excludeId: string): Promise<string[]> {
  const filter = [{ bool: { must_not: [{ term: { id: excludeId } }] } }];
  const bm25 = {
    standard: {
      query: {
        bool: { must: [{ multi_match: { query: text, fields: ["title^2", "abstract_raw"] } }], filter },
      },
    },
  };
  const body = {
    size: K,
    _source: ["id"],
    retriever: {
      rrf: {
        retrievers: [
          bm25,
          {
            standard: {
              query: { bool: { must: [{ semantic: { field: "abstract", query: text } }], filter } },
            },
          },
        ],
        rank_constant: 60,
        rank_window_size: 50,
      },
    },
  };
  const res = await fetch(`${esUrl()}/talks/_search`, {
    method: "POST",
    headers: {
      authorization: `ApiKey ${process.env.ELASTIC_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`elastic ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { hits: { hits: { _source: { id: string } }[] } };
  return json.hits.hits.map((h) => h._source.id);
}

async function main() {
  const all = corpus();
  const byTitle = new Map<string, Rec[]>();
  for (const r of all) {
    const key = normaliseTitle(r.title);
    const list = byTitle.get(key) ?? [];
    list.push(r);
    byTitle.set(key, list);
  }

  // One query per talk that has at least one twin, skipping any whose
  // abstract is too short to be a fair query.
  const cases: { probe: Rec; siblings: Set<string> }[] = [];
  for (const group of byTitle.values()) {
    if (group.length < 2) continue;
    for (const probe of group) {
      if ((probe.abstract ?? "").length < 120) continue;
      const siblings = new Set(group.filter((g) => g.id !== probe.id).map((g) => g.id));
      if (siblings.size) cases.push({ probe, siblings });
    }
  }

  console.log(`${cases.length} probes from ${[...byTitle.values()].filter((g) => g.length > 1).length} repeated-title groups\n`);

  let memHits = 0;
  for (const c of cases) {
    const top = await memorySearch.searchSimilar(c.probe.abstract, { k: K, excludeId: c.probe.id });
    if (top.some((t) => c.siblings.has(t.id))) memHits += 1;
  }
  const memRecall = memHits / cases.length;
  console.log(`in-memory BM25   recall@${K} = ${(100 * memRecall).toFixed(1)}%  (${memHits}/${cases.length})`);

  if (!process.env.ELASTIC_CLOUD_ID) {
    console.log("elastic skipped: not configured");
    return;
  }

  let esHits = 0;
  let esErrors = 0;
  for (const c of cases) {
    try {
      const ids = await elasticTop(c.probe.abstract, c.probe.id);
      if (ids.some((id) => c.siblings.has(id))) esHits += 1;
    } catch {
      esErrors += 1;
    }
  }
  const esDone = cases.length - esErrors;
  console.log(
    `Elastic hybrid   recall@${K} = ${((100 * esHits) / Math.max(esDone, 1)).toFixed(1)}%  (${esHits}/${esDone})` +
      (esErrors ? `  [${esErrors} query errors]` : ""),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
