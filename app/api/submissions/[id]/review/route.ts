import { getSubmission, saveReview, type ReviewRecord } from "@/lib/store/submissions";

export const runtime = "nodejs";

interface Body {
  reviewer?: string;
  verdict?: string;
  axes?: { key: string; value: number }[];
  comment?: string;
  anonymised?: boolean;
}

const VERDICTS = new Set(["approve", "reject", "needs_discussion"]);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const verdict = String(body.verdict ?? "");
  if (!VERDICTS.has(verdict)) {
    return Response.json({ error: "Pick approve, reject or needs discussion." }, { status: 400 });
  }
  if (!(await getSubmission(id))) return Response.json({ error: "not found" }, { status: 404 });

  const review: ReviewRecord = {
    reviewer: (body.reviewer ?? "").trim() || "unnamed reviewer",
    verdict: verdict as ReviewRecord["verdict"],
    axes: Array.isArray(body.axes)
      ? body.axes
          .filter((a) => typeof a?.key === "string" && Number.isFinite(a?.value))
          .map((a) => ({ key: a.key, value: Math.max(0, Math.min(100, Math.round(a.value))) }))
      : [],
    comment: (body.comment ?? "").trim(),
    anonymised: Boolean(body.anonymised),
    decided_at: new Date().toISOString(),
  };

  // A human wrote this. Nothing above produced it and nothing below acts on it.
  await saveReview(id, review);
  return Response.json({ ok: true, review });
}
