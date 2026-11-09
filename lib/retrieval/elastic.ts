import { es, TALKS_INDEX } from "@/lib/es/client";
import { config } from "@/lib/config";
import type { Neighbour, TalkSearch, TopicCount } from "./types";

/**
 * Elasticsearch implementation of TalkSearch. Hybrid when the index carries
 * the semantic_text field, BM25-only when it does not, decided once by
 * reading the mapping rather than by a constant in the code.
 */

interface Source {
  id: string;
  title: string;
  abstract_raw?: string;
  track?: string;
  conference: string;
  edition: string;
  year: number;
  source_url: string;
  speakers?: { name: string; job_title?: string; affiliation?: string; bio?: string }[];
}

const FIELDS = [
  "id",
  "title",
  "abstract_raw",
  "track",
  "conference",
  "edition",
  "year",
  "source_url",
  "speakers",
];

let semanticPromise: Promise<boolean> | null = null;

/** Does the live index actually have the semantic field? Asked once. */
function hasSemantic(): Promise<boolean> {
  semanticPromise ??= (async () => {
    try {
      const mapping = await es().indices.getMapping({ index: TALKS_INDEX });
      const props = mapping[TALKS_INDEX]?.mappings?.properties as
        | Record<string, { type?: string }>
        | undefined;
      return props?.abstract?.type === "semantic_text";
    } catch {
      return false;
    }
  })();
  return semanticPromise;
}

function toNeighbour(hit: { _source?: unknown; _score?: number | null }, best: number): Neighbour {
  const s = hit._source as Source;
  const raw = hit._score ?? 0;
  return {
    id: s.id,
    title: s.title,
    conference: s.conference,
    edition: s.edition,
    year: s.year,
    track: s.track,
    source_url: s.source_url,
    similarity: best > 0 ? Math.min(1, raw / best) : 0,
    speakers: s.speakers,
    abstract: s.abstract_raw,
  };
}

function normalise(hits: { _source?: unknown; _score?: number | null }[]): Neighbour[] {
  const best = hits[0]?._score ?? 0;
  return hits.map((h) => toNeighbour(h, best ?? 0));
}

export const elasticSearch: TalkSearch = {
  backend: "Elasticsearch",

  async searchSimilar(text, o) {
    const cfg = config();
    const k = o?.k ?? cfg.retrieval.k;
    const exclude = o?.excludeId;
    const filter = exclude ? [{ bool: { must_not: [{ term: { id: exclude } }] } }] : [];

    const bm25 = {
      standard: {
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query: text,
                  fields: ["title^2", "abstract_raw"],
                },
              },
            ],
            filter,
          },
        },
      },
    };

    const body: Record<string, unknown> = (await hasSemantic())
      ? {
          retriever: {
            rrf: {
              retrievers: [
                bm25,
                {
                  standard: {
                    query: {
                      bool: {
                        must: [{ semantic: { field: "abstract", query: text } }],
                        filter,
                      },
                    },
                  },
                },
              ],
              rank_constant: cfg.retrieval.rrf_rank_constant,
              rank_window_size: Math.max(k * 5, 50),
            },
          },
        }
      : { retriever: bm25 };

    const res = await es().search({
      index: TALKS_INDEX,
      size: k,
      _source: FIELDS,
      ...body,
    } as never);

    return normalise(res.hits.hits as never);
  },

  async countTopic(topic): Promise<TopicCount> {
    // A count has to mean "talks that are about this", so it is a phrase
    // match, never the relevance ranking used for neighbours.
    const query = {
      multi_match: {
        query: topic,
        type: "phrase" as const,
        fields: ["title", "abstract_raw"],
      },
    };

    const res = await es().search({
      index: TALKS_INDEX,
      size: 5,
      track_total_hits: true,
      _source: FIELDS,
      query,
      aggs: { by_year: { terms: { field: "year", size: 30, order: { _key: "asc" } } } },
    } as never);

    const total =
      typeof res.hits.total === "number" ? res.hits.total : (res.hits.total?.value ?? 0);

    const buckets =
      ((res.aggregations?.by_year as { buckets?: { key: number; doc_count: number }[] })
        ?.buckets) ?? [];
    const byYear: Record<string, number> = {};
    for (const b of buckets) byYear[String(b.key)] = b.doc_count;

    return { total, byYear, examples: normalise(res.hits.hits as never) };
  },
};
