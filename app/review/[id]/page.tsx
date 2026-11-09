"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Radar } from "../../Radar";
import { Stars } from "../../Stars";
import { TalkCards } from "../../TalkCards";
import type { Neighbour } from "@/lib/retrieval/types";

interface Axis {
  key: string;
  label: string;
  weight: number;
  ai: number;
  note: string;
}

interface Submission {
  id: string;
  title: string;
  abstract: string;
  track: string;
  format: string;
  speaker: { name: string; employer: string; bio: string };
  submitted_at: string;
  panch_score: number | null;
  analysed_at: string | null;
  axes: Axis[];
  differs_paragraph: string;
  specificity_evidence: string[];
  sales_evidence: string[];
  suggested_track: string;
  nearest_title: string | null;
  neighbours: Neighbour[];
  analysis_degraded: boolean;
  review: {
    reviewer: string;
    verdict: string;
    axes: { key: string; value: number }[];
    comment: string;
    decided_at: string;
  } | null;
}

interface QueueRow {
  id: string;
  title: string;
  track: string;
  panch_score: number | null;
  reviewed: boolean;
}

/** Wrap each validated quote where it actually appears in the abstract. */
function Highlighted({
  text,
  spec,
  pitch,
}: {
  text: string;
  spec: string[];
  pitch: string[];
}) {
  const spans: { start: number; end: number; kind: string }[] = [];
  const add = (quotes: string[], kind: string) => {
    for (const q of quotes) {
      let from = 0;
      for (;;) {
        const at = text.indexOf(q, from);
        if (at === -1) break;
        spans.push({ start: at, end: at + q.length, kind });
        from = at + q.length;
      }
    }
  };
  add(spec, "spec");
  add(pitch, "pitch");
  if (!spans.length) return <>{text}</>;

  spans.sort((a, b) => a.start - b.start);
  const merged: typeof spans = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }

  const out: React.ReactNode[] = [];
  let cursor = 0;
  merged.forEach((s, i) => {
    if (s.start > cursor) out.push(text.slice(cursor, s.start));
    out.push(
      <mark key={i} className={s.kind === "pitch" ? "pitch" : undefined}>
        {text.slice(s.start, s.end)}
      </mark>,
    );
    cursor = s.end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return <>{out}</>;
}

export default function ReviewDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [sub, setSub] = useState<Submission | null>(null);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [verdict, setVerdict] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/submissions/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("submission not found"))))
      .then((d: Submission) => {
        setSub(d);
        if (d.review) {
          setComment(d.review.comment);
          setReviewer(d.review.reviewer);
          setVerdict(d.review.verdict);
          setOverrides(Object.fromEntries(d.review.axes.map((a) => [a.key, a.value])));
        }
      })
      .catch((e) => setError((e as Error).message));
    fetch("/api/submissions")
      .then((r) => r.json())
      .then((d) => setQueue(d.items ?? []))
      .catch(() => {});
  }, [id]);

  const axes = useMemo(
    () =>
      (sub?.axes ?? []).map((a) => ({
        ...a,
        human: overrides[a.key],
      })),
    [sub, overrides],
  );

  // The same weighted mean the server computes, recomputed live so a reviewer
  // can move an axis and watch the score follow.
  const score = useMemo(() => {
    let total = 0;
    let weight = 0;
    for (const a of axes) {
      total += a.weight * (a.human ?? a.ai);
      weight += a.weight;
    }
    return weight ? Math.round(total / weight) : 0;
  }, [axes]);

  const moved = axes.some((a) => a.human !== undefined && a.human !== a.ai);

  async function submitReview() {
    if (!verdict) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/submissions/${id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reviewer,
          verdict,
          comment,
          anonymised: anonymous,
          axes: axes.map((a) => ({ key: a.key, value: a.human ?? a.ai })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `the review returned ${res.status}`);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !sub) {
    return (
      <>
        <div className="topbar">
          <h1>Not found</h1>
        </div>
        <div className="page">
          <div className="banner err">{error}</div>
          <p style={{ marginTop: 14 }}>
            <Link href="/review">← Back to the queue</Link>
          </p>
        </div>
      </>
    );
  }

  if (!sub) {
    return (
      <>
        <div className="topbar">
          <h1>Reading the submission…</h1>
        </div>
        <div className="page">
          <div className="empty">
            <h3>Analysing this talk</h3>
            <p>
              Nobody has opened it before, so it is being searched against 3,436 prior talks
              and read now. This runs once, then it is cached.
            </p>
            <span className="toolpill running">
              <span className="led" />
              searching the corpus and scoring five axes
            </span>
          </div>
        </div>
      </>
    );
  }

  const others = queue.filter((q) => q.id !== sub.id);
  const next = others.find((q) => !q.reviewed);
  const reviewedCount = queue.filter((q) => q.reviewed).length;
  const pct = queue.length ? Math.round((100 * reviewedCount) / queue.length) : 0;

  return (
    <>
      <div className="topbar">
        <Link href="/review" style={{ color: "var(--ink-2)" }}>
          Review queue
        </Link>
        <span className="sep">/</span>
        <h1 style={{ fontWeight: 600 }}>{sub.track}</h1>
        <div className="right" style={{ minWidth: 240 }}>
          <span className="tiny">
            {reviewedCount} of {queue.length} reviewed
          </span>
          <div className="progress" style={{ width: 110, flex: "none" }}>
            <div style={{ width: `${pct}%` }} />
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
            />
            Anonymous
          </label>
        </div>
      </div>

      <div className="page">
        <div className="pagehead">
          <h1>{sub.title}</h1>
          <p>
            {anonymous ? (
              <>Speaker hidden · submission {sub.id}</>
            ) : (
              <>
                {sub.speaker.name || "unnamed"}
                {sub.speaker.employer ? `, ${sub.speaker.employer}` : ""} · submission {sub.id}
              </>
            )}
            {sub.format ? ` · ${sub.format}` : ""}
          </p>
        </div>

        <div className="reviewgrid">
          {/* ---- the submission itself ---- */}
          <div className="col">
            <div className="card">
              <div className="hd">
                <h2>Abstract</h2>
                <span className="tiny" style={{ marginLeft: "auto" }}>
                  <mark>specific</mark> and <mark className="pitch">sales</mark> phrases are
                  verbatim quotes
                </span>
              </div>
              <div className="bd">
                <div className="abstractbody">
                  <Highlighted
                    text={sub.abstract}
                    spec={sub.specificity_evidence}
                    pitch={sub.sales_evidence}
                  />
                </div>
              </div>
            </div>

            <div className="card">
              <div className="hd">
                <h2>How it differs from what has run before</h2>
              </div>
              <div className="bd stack">
                <p style={{ margin: 0 }}>{sub.differs_paragraph}</p>
                {sub.suggested_track && sub.suggested_track !== sub.track && (
                  <div className="banner warn">
                    The analysis reads this as closer to <b>{sub.suggested_track}</b> than to{" "}
                    {sub.track}. Yours to judge.
                  </div>
                )}
                {sub.analysis_degraded && (
                  <div className="banner warn">
                    The language pass failed on this one, so Content, Relevance, Speaker and
                    Not a Product Pitch sit at a neutral 50. Originality is computed from the
                    corpus and still stands.
                  </div>
                )}
              </div>
            </div>

            {!anonymous && sub.speaker.bio && (
              <div className="card">
                <div className="hd">
                  <h2>Speaker</h2>
                </div>
                <div className="bd">
                  <dl className="kv">
                    <dt>Name</dt>
                    <dd>{sub.speaker.name || "—"}</dd>
                    <dt>Employer</dt>
                    <dd>{sub.speaker.employer || "—"}</dd>
                    <dt>Bio</dt>
                    <dd>{sub.speaker.bio}</dd>
                  </dl>
                </div>
              </div>
            )}

            <div className="card">
              <div className="hd">
                <h2>Nearest prior talks</h2>
                <span className="tiny" style={{ marginLeft: "auto" }}>
                  from 3,436 real talks
                </span>
              </div>
              <div className="bd">
                <TalkCards talks={sub.neighbours} limit={6} />
              </div>
            </div>
          </div>

          {/* ---- the scoring column ---- */}
          <div className="col">
            <div className="card">
              <div className="hd">
                <h2>Panch Score</h2>
                <span className="tiny" style={{ marginLeft: "auto" }}>
                  {moved ? "yours" : "as analysed"}
                </span>
              </div>
              <div className="bd stack" style={{ gap: 12 }}>
                <div className="spread">
                  <div className="bigscore">
                    <span className="v">{score}</span>
                    <span className="l">
                      of 100
                      {moved && sub.panch_score !== null && sub.panch_score !== score
                        ? ` · was ${sub.panch_score}`
                        : ""}
                    </span>
                  </div>
                  {moved && (
                    <button className="secondary small" onClick={() => setOverrides({})}>
                      Reset to analysed
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", justifyContent: "center" }}>
                  <Radar axes={axes} size={272} />
                </div>

                {moved && (
                  <p className="tiny" style={{ margin: 0, textAlign: "center" }}>
                    Dashed is the analysis. Solid is you.
                  </p>
                )}

                <div>
                  {axes.map((a) => {
                    const value = a.human ?? a.ai;
                    const changed = a.human !== undefined && a.human !== a.ai;
                    return (
                      <div className="axisrow" key={a.key}>
                        <div className="top">
                          <span className="nm">
                            {a.label} <span className="wt">{Math.round(a.weight * 100)}%</span>
                          </span>
                          <span className="vals">
                            {changed && <span className="ai">was {a.ai}</span>}
                            <span className={`hum${changed ? " moved" : ""}`}>{value}</span>
                          </span>
                        </div>
                        <div className="row" style={{ gap: 9, marginTop: 5 }}>
                          <Stars
                            value={value}
                            size={23}
                            onChange={(v) => setOverrides((o) => ({ ...o, [a.key]: v }))}
                          />
                          <span className="tiny">
                            {changed ? "your rating" : "click to change"}
                          </span>
                        </div>
                        {a.note && <div className="note">{a.note}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="hd">
                <h2>Your review</h2>
              </div>
              <div className="bd">
                <label className="field">
                  <span className="lbl">
                    Comment<span className="hint">the chair reads this</span>
                  </span>
                  <textarea
                    rows={4}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="What you saw that the analysis did not, or where you disagree with it."
                  />
                </label>

                <label className="field">
                  <span className="lbl">Your name</span>
                  <input
                    type="text"
                    value={reviewer}
                    onChange={(e) => setReviewer(e.target.value)}
                    placeholder="so the chair knows who said this"
                  />
                </label>

                <span className="lbl" style={{ display: "block", marginBottom: 6 }}>
                  Verdict
                </span>
                <div className="row" style={{ marginBottom: 14 }}>
                  {[
                    ["approve", "Approve"],
                    ["needs_discussion", "Needs discussion"],
                    ["reject", "Reject"],
                  ].map(([v, label]) => (
                    <button
                      key={v}
                      className={verdict === v ? "on" : "secondary"}
                      onClick={() => setVerdict(v)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {error && <div className="banner err" style={{ marginBottom: 12 }}>{error}</div>}

                {saved ? (
                  <div className="stack" style={{ gap: 10 }}>
                    <div className="banner ok">
                      Recorded as <b>{verdict === "needs_discussion" ? "needs discussion" : verdict}</b>{" "}
                      by {reviewer || "an unnamed reviewer"}, with the speaker{" "}
                      {anonymous ? "hidden" : "visible"}.
                    </div>
                    <div className="row">
                      {next && (
                        <button onClick={() => router.push(`/review/${next.id}`)}>
                          Next unreviewed →
                        </button>
                      )}
                      <button className="secondary" onClick={() => router.push("/review")}>
                        Back to the queue
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="row">
                    <button onClick={submitReview} disabled={!verdict || busy}>
                      {busy ? "Recording…" : "Submit review"}
                    </button>
                    <span className="tiny">
                      {!verdict ? "Pick a verdict first." : "A person decides, not a score."}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ---- what is next ---- */}
          <div className="col todocol">
            <div className="card sticky">
              <div className="hd">
                <h2>To do</h2>
                <span className="tiny" style={{ marginLeft: "auto" }}>
                  {others.filter((o) => !o.reviewed).length} left
                </span>
              </div>
              <div className="todo">
                {others.length === 0 && (
                  <div className="bd">
                    <p className="tiny" style={{ margin: 0 }}>
                      Nothing else in the queue yet.
                    </p>
                  </div>
                )}
                {others.slice(0, 12).map((q) => (
                  <Link key={q.id} href={`/review/${q.id}`} className={q.reviewed ? "done" : ""}>
                    {q.title}
                    <span className="m">
                      <span
                        className={`score${
                          q.panch_score === null
                            ? ""
                            : q.panch_score >= 65
                              ? " hi"
                              : q.panch_score < 40
                                ? " lo"
                                : ""
                        }`}
                        style={{ minWidth: 30, height: 20, fontSize: 11.5 }}
                      >
                        {q.panch_score ?? "·"}
                      </span>
                      {q.track}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
