import { searchWithFallback } from "@/lib/retrieval";
import { analyse } from "@/lib/review/analyse";
import { panchScore } from "@/lib/review/axes";
import { getSubmission, saveAnalysis, type Submission } from "@/lib/store/submissions";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * Analysis is lazy and runs once. A committee does not read 200 of these,
 * so nothing is spent until a reviewer actually opens a talk. The result is
 * written back, so the second open is instant and the queue picks up the
 * score.
 */
async function ensureAnalysed(sub: Submission): Promise<Submission> {
  if (sub.panch_score !== null) return sub;

  const { result: neighbours } = await searchWithFallback((s) =>
    s.searchSimilar(`${sub.title}\n${sub.abstract}`, { k: 8 }),
  );

  const analysis = await analyse(
    {
      title: sub.title,
      abstract: sub.abstract,
      track: sub.track,
      format: sub.format,
      speaker_bio: sub.speaker.bio,
      speaker_name: sub.speaker.name,
      speaker_employer: sub.speaker.employer,
    },
    neighbours,
  );

  const patch: Partial<Submission> = {
    analysed_at: new Date().toISOString(),
    panch_score: panchScore(analysis.axes),
    axes: analysis.axes,
    differs_paragraph: analysis.differs_paragraph,
    specificity_evidence: analysis.specificity_evidence,
    sales_evidence: analysis.sales_evidence,
    suggested_track: analysis.suggested_track,
    nearest_title: analysis.nearest_title,
    neighbours,
    analysis_degraded: analysis.degraded,
  };

  await saveAnalysis(sub.id, patch);
  return { ...sub, ...patch };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sub = await getSubmission(id);
  if (!sub) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(await ensureAnalysed(sub));
}
