import { searchWithFallback } from "@/lib/retrieval";
import { analyse } from "@/lib/review/analyse";
import { retrievalScores, composite } from "@/lib/review/scores";

export const runtime = "nodejs";
export const maxDuration = 120;

interface Body {
  abstract?: string;
  title?: string;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const abstract = (body.abstract ?? "").trim();
  if (abstract.length < 60) {
    return Response.json({ error: "paste an abstract of at least 60 characters" }, { status: 400 });
  }
  const query = `${body.title ?? ""}\n${abstract}`.trim();

  const { result: neighbours, backend, degraded } = await searchWithFallback((s) =>
    s.searchSimilar(query, { k: 8 }),
  );

  const scores = retrievalScores(abstract, neighbours);
  const analysis = await analyse(abstract, neighbours);
  const { composite: score, weights } = composite(scores, analysis.specificity);

  return Response.json({
    backend,
    retrieval_degraded: degraded,
    neighbours,
    scores: { ...scores, composite: score },
    weights,
    analysis,
  });
}
