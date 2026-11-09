# Panchayat

CFP review for a programme committee that has 200 abstracts and a weekend,
grounded in 3,436 real talks accepted at KubeCon and its co-located events
between 2023 and 2026.

A panchayat is a village council. The name is the argument: the tool is the
clerk, the humans are the council. Nothing here approves or rejects anything.

## The two things it does

**A mentor for a first-time speaker.** Someone with a good idea and nobody to
ask opens a chat and says "I want to talk about Backstage". The mentor calls
a tool, finds that 111 of the 3,436 prior talks are about Backstage, shows
them real ones with links to the actual schedule pages, and then asks what
they themselves did, because that is the only thing that makes a talk theirs.

It will not write their abstract. Asked directly, told the deadline is in an
hour, it declines, says why, and asks a question instead. That refusal is the
product, not a limitation of it.

**A reviewer view.** Paste an abstract and get the prior talks nearest to it,
an overlap number you can check by reading, a paragraph on how it differs from
those talks, and the phrases that carry its specificity quoted back verbatim.
Then you decide.

## What it will not do

- No auto-approve, no auto-reject, no path where a score produces an outcome.
  The composite is a sort order for a queue and is labelled as one.
- The mentor never writes or rewrites a speaker's words.
- Nothing is labelled "AI-generated". That is not a call this tool can make
  and it is not the useful signal. Specificity is: numbers, version strings,
  named tools, a named employer, what failed. "Reads as vendor copy" appears
  only as a prompt to look closer.
- No claim about the field comes from model memory. Every count and every
  talk the mentor names comes from a tool call in that conversation.
- Every evidence quote is checked as a verbatim substring of the source text.
  Quotes that fail are dropped rather than paraphrased, because a reviewer
  will believe a paraphrase.

## How it is built

Next.js App Router, TypeScript, no client-side keys.

**Retrieval** sits behind one interface, `TalkSearch` in `lib/retrieval/`.

- `elastic.ts` queries one `talks` index on Elasticsearch, hybrid: BM25 over
  `title` and `abstract_raw` fused by RRF with a `semantic` query over
  `abstract`, which is a `semantic_text` field backed by ELSER.
- `memory.ts` is a BM25 implementation over `data/corpus.jsonl`, loaded once.
  3,436 documents is nothing in memory and the KubeCon jargon is distinctive
  enough that term overlap gives good neighbours.
- Elastic is selected when `ELASTIC_CLOUD_ID` is set, and the in-memory
  corpus is the fallback. If Elastic fails mid-request the request is retried
  against memory and the UI says which backend answered. The app runs end to
  end with Elastic entirely absent.

Both backends independently count 111 Backstage talks with the same split by
year, which is a cheap and reassuring cross-check.

**Scores.** Overlap is idf-weighted term containment between the submission
and its nearest prior talk: how much of this abstract's distinctive
vocabulary already appears there, with rare words counting for more than
common ones. It is deliberately not the search score. A BM25 or RRF score has
no absolute meaning, and normalising it against the top hit of its own result
set makes the nearest neighbour 100 every time. That first version scored two
unrelated abstracts at 98 and 99; term containment scores them 8 and 27.

**Models.** One OpenAI-compatible endpoint, reached only through
`lib/llm/client.ts`. Call sites name a purpose, `"mentor"` or `"analyse"`,
never a model. Every model name, temperature and weight is in
`config/models.yaml`, and a missing alias fails at startup rather than
falling back to something unintended. Prompts are files in `prompts/`, loaded
at request time.

**Degradation.** The analyse call returns strict JSON. A failed call or an
unparseable response degrades that one axis, says so on the page, and leaves
the retrieval evidence standing. It never throws and never blanks a page.

## Running it

```bash
cp .env.local.example .env.local   # then fill in the four values
npm install

# build the index: one talks index, 3,436 docs, batches of 200
node --experimental-strip-types --env-file=.env.local scripts/load-elastic.ts
# add --bm25 to skip semantic_text and index BM25-only

npm run dev
```

`/` is the mentor. `/review` is the reviewer view.

Without `ELASTIC_CLOUD_ID` the app runs on the in-memory corpus and says so
in the header. Nothing else changes.

Environment: `LLM_BASE_URL`, `LLM_API_KEY`, `ELASTIC_CLOUD_ID`,
`ELASTIC_API_KEY`. All server-side. None of them reach the browser.

## The corpus

`data/corpus.jsonl`, 3,436 talks scraped from the public Sched schedules for
KubeCon North America, Europe and India and their co-located events, 2023 to
2026. Every record keeps its real `source_url`, so a cited card opens the
actual schedule page. Nothing in it is synthetic.

The two sample submissions in `app/review/samples.ts` were written by us for
the demo and are never mixed into the corpus.

## Notes on the index

The cluster is Elasticsearch Serverless 9.7.0, which manages replication
itself and rejects `index.number_of_replicas` with a 400, so that setting is
absent on purpose. The loader checks the bulk response body per document,
because bulk returns 200 while individual documents fail. Last run: 3,436
indexed, 0 failed, `_count` 3,436.

The loader also enforces its own fallback: if the first semantic batch
exceeds its time budget it rebuilds the index BM25-only and carries on,
rather than discovering a slow ingest pipeline at the end.

## AI assistance

This was built on hackathon day in roughly an hour of build time, with
Claude Opus 5 writing most of the code under direction, in Claude Code. The
commit history is the real record: each commit message says what was verified
live against the endpoint and the cluster, and what was wrong before it.

The corpus is not AI-generated. It was scraped from public Sched pages, and
the 111 Backstage talks are 111 real talks.

The specific things a human decided, rather than the model: that nothing
auto-approves, that the mentor refuses to write for the speaker, that
"AI-generated" is not a label this tool gets to apply, and that a
search-score-derived novelty number which reads as 98 for everything had to
be thrown away rather than shipped because it looked like a number.
