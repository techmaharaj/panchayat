"use client";

import { useState } from "react";
import type { Neighbour } from "@/lib/retrieval/types";
import { TalkCards } from "../TalkCards";
import { SAMPLES, type Sample } from "./samples";

interface Analysis {
  differs_paragraph: string;
  specificity: "high" | "medium" | "low";
  specificity_evidence: string[];
  sales_evidence: string[];
  suggested_track: string;
  degraded: boolean;
  dropped_quotes: number;
}

interface Result {
  backend: string;
  retrieval_degraded: boolean;
  neighbours: Neighbour[];
  scores: {
    overlap: number;
    novelty: number;
    nearest_title: string | null;
    mean_top3: number;
    composite: number;
  };
  weights: Record<string, number>;
  analysis: Analysis;
}

/** Wrap every validated quote where it actually appears in the abstract. */
function Highlighted({ text, quotes }: { text: string; quotes: string[] }) {
  if (!quotes.length) return <>{text}</>;
  const spans: { start: number; end: number }[] = [];
  for (const q of quotes) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(q, from);
      if (at === -1) break;
      spans.push({ start: at, end: at + q.length });
      from = at + q.length;
    }
  }
  spans.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }
  const out: React.ReactNode[] = [];
  let cursor = 0;
  merged.forEach((s, i) => {
    if (s.start > cursor) out.push(text.slice(cursor, s.start));
    out.push(<mark key={i}>{text.slice(s.start, s.end)}</mark>);
    cursor = s.end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return <>{out}</>;
}

export default function ReviewPage() {
  const [sample, setSample] = useState<Sample | null>(null);
  const [title, setTitle] = useState("");
  const [abstract, setAbstract] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<string | null>(null);

  function pick(s: Sample) {
    setSample(s);
    setTitle(s.title);
    setAbstract(s.abstract);
    setResult(null);
    setDecision(null);
    setError(null);
  }

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    setDecision(null);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, abstract }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `the review route returned ${res.status}`);
      setResult(data as Result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const a = result?.analysis;
  // A first-time speaker has no prior talk in the corpus. Nobody matches
  // the neighbours by name here, so we read it off the sample's own flag.
  const firstTime =
    sample && !result?.neighbours.some((n) => n.speakers?.some((sp) => sp.name === sample.speaker.name));

  return (
    <div className="shell">
      <header className="top">
        <h1>Panchayat</h1>
        <span className="tag">Reviewer view</span>
        <nav>
          <a href="/">Mentor</a>
        </nav>
      </header>

      <div className="row" style={{ marginBottom: 14 }}>
        <span className={`backend${result?.retrieval_degraded ? " degraded" : ""}`}>
          retrieval: {result?.backend ?? "not called yet"}
        </span>
        <label className="note row" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
          />
          Anonymise the speaker
        </label>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h2>Submission</h2>
        <div className="starters" style={{ marginTop: 0, marginBottom: 12 }}>
          {SAMPLES.map((s) => (
            <button key={s.id} onClick={() => pick(s)}>
              {s.label} sample
            </button>
          ))}
        </div>
        <input
          className="text"
          style={{ width: "100%", marginBottom: 8 }}
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          rows={7}
          style={{ width: "100%" }}
          placeholder="Paste an abstract"
          value={abstract}
          onChange={(e) => setAbstract(e.target.value)}
        />
        {sample && (
          <p className="note" style={{ marginBottom: 0 }}>
            Speaker:{" "}
            {anonymous ? (
              <em>hidden while reviewing</em>
            ) : (
              <>
                {sample.speaker.name}, {sample.speaker.employer}
              </>
            )}
            {firstTime && " · no prior talk in the corpus"}
          </p>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <button onClick={run} disabled={busy || abstract.trim().length < 60}>
            {busy ? "Reading..." : "Read this submission"}
          </button>
          <span className="note">One retrieval query, one model call.</span>
        </div>
      </div>

      {error && <div className="err">{error}</div>}

      {result && a && (
        <div className="grid2">
          <div className="panel">
            <h2>How it differs</h2>
            <p style={{ marginTop: 0 }}>{a.differs_paragraph}</p>
            {a.suggested_track && (
              <p className="note" style={{ marginBottom: 0 }}>
                Looks closest to: {a.suggested_track}
              </p>
            )}
            {a.degraded && (
              <p className="note" style={{ marginBottom: 0 }}>
                The language pass did not return usable JSON, so this axis is degraded. The
                retrieval numbers stand on their own.
              </p>
            )}
          </div>

          <div className="panel">
            <h2>Retrieval</h2>
            <div className="metric">
              <span>Overlap with prior talks</span>
              <b>{result.scores.overlap}</b>
            </div>
            <div className="metric">
              <span>Novelty</span>
              <b>{result.scores.novelty}</b>
            </div>
            <div className="metric">
              <span>Mean over the top three</span>
              <b>{result.scores.mean_top3}</b>
            </div>
            <div className="metric">
              <span>Specificity</span>
              <b>{a.specificity}</b>
            </div>
            <div className="metric">
              <span>Sort score</span>
              <b>{result.scores.composite}</b>
            </div>
            {result.scores.nearest_title && (
              <p className="note" style={{ margin: "10px 0 0" }}>
                Overlap is measured against &ldquo;{result.scores.nearest_title}&rdquo;: how much
                of this abstract&apos;s distinctive vocabulary already appears there. Rare words
                count for more than common ones.
              </p>
            )}
            <p className="note" style={{ marginBottom: 0 }}>
              A sort order for a queue, not a verdict. Weights come from config, so a chair
              can retune them.
            </p>
          </div>

          <div className="panel">
            <h2>Specificity, in its own words</h2>
            <p className="note" style={{ marginTop: 0 }}>
              {a.specificity_evidence.length
                ? "Highlighted below, each one checked as a verbatim quote from the abstract."
                : "Nothing in this abstract was specific enough to quote. That is the finding."}
              {a.dropped_quotes > 0 &&
                ` ${a.dropped_quotes} quote${a.dropped_quotes > 1 ? "s were" : " was"} dropped for not matching the text exactly.`}
            </p>
            <div className="quote" style={{ whiteSpace: "pre-wrap" }}>
              <Highlighted
                text={abstract}
                quotes={[...a.specificity_evidence, ...a.sales_evidence]}
              />
            </div>
            {a.sales_evidence.length > 0 && (
              <>
                <p className="note" style={{ marginBottom: 4 }}>
                  Reads as vendor copy. Worth a closer look, not a conclusion:
                </p>
                {a.sales_evidence.map((q) => (
                  <div className="quote" key={q}>
                    &ldquo;{q}&rdquo;
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="panel">
            <h2>Similar prior talks</h2>
            <TalkCards talks={result.neighbours} />
          </div>

          <div className="panel">
            <h2>Your decision</h2>
            <p className="note" style={{ marginTop: 0 }}>
              Nothing above decided anything. The tool is the clerk, the council decides.
            </p>
            <div className="row">
              {["Approve", "Reject", "Needs discussion"].map((v) => (
                <button key={v} className="ghost" onClick={() => setDecision(v)}>
                  {v}
                </button>
              ))}
            </div>
            {decision && (
              <p className="note" style={{ marginBottom: 0 }}>
                Recorded: <b>{decision}</b>, by a human, with the speaker{" "}
                {anonymous ? "hidden" : "visible"}.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
