import { listSubmissions, newId, saveSubmission, type Submission } from "@/lib/store/submissions";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function GET() {
  const { items, backend } = await listSubmissions();
  return Response.json({
    backend,
    items: items.map((s) => ({
      id: s.id,
      title: s.title,
      track: s.track,
      format: s.format,
      speaker: s.speaker,
      panch_score: s.panch_score,
      analysed: s.panch_score !== null,
      axes: s.axes,
      submitted_at: s.submitted_at,
      reviewed: Boolean(s.review),
      verdict: s.review?.verdict ?? null,
    })),
  });
}

interface Body {
  title?: string;
  abstract?: string;
  track?: string;
  format?: string;
  speaker?: { name?: string; employer?: string; bio?: string; email?: string };
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  const abstract = (body.abstract ?? "").trim();
  const track = (body.track ?? "").trim();
  if (!title) return Response.json({ error: "A title is required." }, { status: 400 });
  if (abstract.length < 120)
    return Response.json({ error: "The abstract needs at least 120 characters." }, { status: 400 });
  if (!track) return Response.json({ error: "Pick a track." }, { status: 400 });

  // The submission is stored straight away. Retrieval and the analyse call
  // happen the first time a reviewer opens it, so the speaker is not left
  // watching a spinner and the committee does not pay for 200 analyses
  // nobody reads.
  const submission: Submission = {
    id: newId(),
    title,
    abstract,
    track,
    format: (body.format ?? "").trim(),
    speaker: {
      name: (body.speaker?.name ?? "").trim(),
      employer: (body.speaker?.employer ?? "").trim(),
      bio: (body.speaker?.bio ?? "").trim(),
      email: (body.speaker?.email ?? "").trim(),
    },
    submitted_at: new Date().toISOString(),
    analysed_at: null,
    panch_score: null,
    axes: [],
    differs_paragraph: "",
    specificity_evidence: [],
    sales_evidence: [],
    suggested_track: "",
    nearest_title: null,
    neighbours: [],
    analysis_degraded: false,
    review: null,
  };

  const { backend } = await saveSubmission(submission);
  return Response.json({ id: submission.id, backend });
}
