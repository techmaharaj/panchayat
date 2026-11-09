"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface Row {
  id: string;
  title: string;
  track: string;
  format: string;
  speaker: { name: string; employer: string };
  panch_score: number | null;
  analysed: boolean;
  axes: { key: string; label: string; ai: number }[];
  submitted_at: string;
  reviewed: boolean;
  verdict: string | null;
}

function band(n: number): string {
  if (n >= 65) return " hi";
  if (n < 40) return " lo";
  return "";
}

export default function QueuePage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [backend, setBackend] = useState<string>("");
  const [track, setTrack] = useState("All tracks");
  const [show, setShow] = useState<"all" | "todo" | "done">("all");
  const [anonymous, setAnonymous] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/submissions")
      .then((r) => r.json())
      .then((d) => {
        setRows(d.items ?? []);
        setBackend(d.backend ?? "");
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const tracks = useMemo(() => {
    const t = new Set((rows ?? []).map((r) => r.track).filter(Boolean));
    return ["All tracks", ...[...t].sort()];
  }, [rows]);

  const filtered = useMemo(() => {
    let out = rows ?? [];
    if (track !== "All tracks") out = out.filter((r) => r.track === track);
    if (show === "todo") out = out.filter((r) => !r.reviewed);
    if (show === "done") out = out.filter((r) => r.reviewed);
    return out;
  }, [rows, track, show]);

  const total = rows?.length ?? 0;
  const reviewed = (rows ?? []).filter((r) => r.reviewed).length;
  const scored = (rows ?? []).filter((r) => r.panch_score !== null);
  const mean = scored.length
    ? Math.round(scored.reduce((a, r) => a + (r.panch_score ?? 0), 0) / scored.length)
    : 0;
  const pct = total ? Math.round((100 * reviewed) / total) : 0;

  return (
    <>
      <div className="topbar">
        <h1>Review queue</h1>
        <span className="sep">/</span>
        <span className="muted">KubeCon Europe 2027</span>
        <div className="right">
          {backend && (
            <span className={`chip${backend.startsWith("in-memory") ? " degraded" : ""}`}>
              <span className="led" />
              {backend}
            </span>
          )}
          <label className="switch">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
            />
            Anonymous review
          </label>
        </div>
      </div>

      <div className="page">
        <div className="tiles" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))" }}>
          <div className="tile accent">
            <div className="k">In the queue</div>
            <div className="v">{total}</div>
            <div className="c">{total === 1 ? "submission" : "submissions"} received</div>
          </div>
          <div className="tile">
            <div className="k">Reviewed by a human</div>
            <div className="v">
              {reviewed}
              <span style={{ fontSize: 15, color: "var(--ink-3)", fontWeight: 500 }}> / {total}</span>
            </div>
            <div className="progress" style={{ marginTop: 8 }}>
              <div style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="tile">
            <div className="k">Mean Panch Score</div>
            <div className="v">{scored.length ? mean : "—"}</div>
            <div className="c">
              {scored.length
                ? `over the ${scored.length} analysed so far`
                : "nothing analysed yet"}
            </div>
          </div>
          <div className="tile">
            <div className="k">Compared against</div>
            <div className="v">3,436</div>
            <div className="c">prior talks, for originality</div>
          </div>
        </div>

        <div className="card">
          <div className="hd" style={{ flexWrap: "wrap" }}>
            <h2>Submissions</h2>
            <select
              value={track}
              onChange={(e) => setTrack(e.target.value)}
              style={{ width: "auto", minWidth: 190, padding: "5px 30px 5px 10px", fontSize: 13 }}
            >
              {tracks.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <div className="segmented">
              {(["all", "todo", "done"] as const).map((s) => (
                <button key={s} className={show === s ? "on" : ""} onClick={() => setShow(s)}>
                  {s === "all" ? "All" : s === "todo" ? "To review" : "Reviewed"}
                </button>
              ))}
            </div>
            <span className="tiny" style={{ marginLeft: "auto" }}>
              {filtered.length} shown
            </span>
          </div>

          {error && <div className="bd"><div className="banner err">{error}</div></div>}

          {rows === null && !error && (
            <div className="empty">
              <p>Loading the queue…</p>
            </div>
          )}

          {rows !== null && !filtered.length && (
            <div className="empty">
              <h3>Nothing here yet</h3>
              <p>
                {total
                  ? "No submission matches this filter."
                  : "Submit a talk and it lands in this queue with its analysis attached."}
              </p>
              <Link href="/submit">
                <button>Submit a talk</button>
              </Link>
            </div>
          )}

          {filtered.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table className="queue">
                <thead>
                  <tr>
                    <th>Talk</th>
                    <th>Track</th>
                    <th>Format</th>
                    <th className="num">Panch Score</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="ttl">{r.title}</div>
                        <div className="by">
                          {anonymous
                            ? `submission ${r.id}`
                            : `${r.speaker.name || "unnamed"}${r.speaker.employer ? `, ${r.speaker.employer}` : ""}`}
                        </div>
                      </td>
                      <td>
                        <span className="tag">{r.track}</span>
                      </td>
                      <td className="muted">{r.format || "—"}</td>
                      <td className="num">
                        {r.panch_score === null ? (
                          <span className="tiny">runs when opened</span>
                        ) : (
                          <span className={`score${band(r.panch_score)}`}>{r.panch_score}</span>
                        )}
                      </td>
                      <td>
                        {r.reviewed ? (
                          <span className={`tag ${r.verdict}`}>
                            {r.verdict === "needs_discussion" ? "needs discussion" : r.verdict}
                          </span>
                        ) : (
                          <span className="tiny">awaiting a human</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Link href={`/review/${r.id}`}>
                          <button className="secondary small">
                            {r.reviewed ? "Reopen" : "Review"}
                          </button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="tiny" style={{ marginTop: 14 }}>
          Analysis runs the first time someone opens a talk, not on submission, so nothing is
          spent on abstracts nobody reads. The Panch Score sorts this list and does nothing else. No submission is approved or
          rejected without a person pressing a button on its page.
        </p>
      </div>
    </>
  );
}
