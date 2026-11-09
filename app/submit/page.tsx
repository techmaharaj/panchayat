"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MentorPanel } from "../MentorPanel";

const TRACKS = [
  "Platform Engineering",
  "Observability",
  "AI + ML",
  "Security",
  "Networking",
  "Operations + Performance",
  "Application Development",
  "Data Processing + Storage",
  "Cloud Native Novice",
  "SDLC",
];

const FORMATS = ["35 min session", "Lightning talk", "Tutorial", "Panel", "Workshop"];

const PROMPTS = [
  "Has this been covered before?",
  "Write my abstract for me",
  "What would make this stand out?",
  "Which track does this belong in?",
];

export default function SubmitPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [abstract, setAbstract] = useState("");
  const [track, setTrack] = useState("");
  const [format, setFormat] = useState(FORMATS[0]);
  const [name, setName] = useState("");
  const [employer, setEmployer] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; backend: string } | null>(null);

  const words = abstract.trim() ? abstract.trim().split(/\s+/).length : 0;
  const ready = title.trim() && abstract.trim().length >= 120 && track;

  function snapshot() {
    return [title && `Title: ${title}`, track && `Track: ${track}`, abstract && `Abstract: ${abstract}`]
      .filter(Boolean)
      .join("\n");
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          abstract,
          track,
          format,
          speaker: { name, employer, email, bio },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `the form returned ${res.status}`);
      setDone({ id: data.id, backend: data.backend });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <>
        <div className="topbar">
          <h1>Submitted</h1>
        </div>
        <div className="page">
          <div className="card" style={{ maxWidth: 620 }}>
            <div className="bd stack">
              <div className="banner ok">
                Your talk is in. Reference <b>{done.id}</b>, stored in {done.backend}.
              </div>
              <p className="muted" style={{ margin: 0 }}>
                It now sits in the committee&apos;s queue with an analysis attached, which a
                human reads and can overrule on every axis. Nothing was approved or rejected
                by a machine, and nothing will be.
              </p>
              <div className="row">
                <button onClick={() => router.push(`/review/${done.id}`)}>
                  See what the committee sees
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    setDone(null);
                    setTitle("");
                    setAbstract("");
                    setTrack("");
                  }}
                >
                  Submit another
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <h1>Submit a talk</h1>
        <span className="sep">/</span>
        <span className="muted">KubeCon Europe 2027, call for speakers</span>
        <div className="right">
          <span className="chip">
            <span className="led" />
            mentor is listening
          </span>
        </div>
      </div>

      <div className="page">
        <div className="tiles" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div className="tile accent">
            <div className="k">Abstract</div>
            <div className="v">{words}</div>
            <div className="c">
              {abstract.trim().length < 120
                ? `${120 - abstract.trim().length} more characters needed`
                : "long enough to review"}
            </div>
          </div>
          <div className="tile">
            <div className="k">Track</div>
            <div className="v sm">{track || "not picked"}</div>
            <div className="c">the mentor can tell you which fits</div>
          </div>
          <div className="tile">
            <div className="k">Format</div>
            <div className="v sm">{format}</div>
            <div className="c">how long you want on stage</div>
          </div>
          <div className="tile">
            <div className="k">Ready to send</div>
            <div className="v sm">{ready ? "Yes" : "Not yet"}</div>
            <div className="c">title, abstract and track are required</div>
          </div>
        </div>

        <div className="withside">
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) submit();
            }}
          >
            <div className="hd">
              <h2>Your submission</h2>
            </div>
            <div className="bd">
              <label className="field">
                <span className="lbl">
                  Title<span className="hint">required</span>
                </span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What a reviewer sees first"
                />
              </label>

              <div className="two">
                <label className="field">
                  <span className="lbl">
                    Track<span className="hint">required</span>
                  </span>
                  <select value={track} onChange={(e) => setTrack(e.target.value)}>
                    <option value="">Pick a track</option>
                    {TRACKS.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span className="lbl">Session format</span>
                  <select value={format} onChange={(e) => setFormat(e.target.value)}>
                    {FORMATS.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="field">
                <span className="lbl">
                  Abstract
                  <span className="hint">
                    {words} words · what did you do, what broke, what did you measure
                  </span>
                </span>
                <textarea
                  rows={11}
                  value={abstract}
                  onChange={(e) => setAbstract(e.target.value)}
                  placeholder="Write it yourself. The mentor beside you will not do it for you, and that is deliberate."
                />
              </label>

              <div className="two">
                <label className="field">
                  <span className="lbl">Your name</span>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="field">
                  <span className="lbl">Employer</span>
                  <input
                    type="text"
                    value={employer}
                    onChange={(e) => setEmployer(e.target.value)}
                  />
                </label>
              </div>

              <label className="field">
                <span className="lbl">
                  Email<span className="hint">never shown to reviewers</span>
                </span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>

              <label className="field">
                <span className="lbl">
                  Speaker bio
                  <span className="hint">what makes you the person who can tell this</span>
                </span>
                <textarea rows={4} value={bio} onChange={(e) => setBio(e.target.value)} />
              </label>

              {error && <div className="banner err" style={{ marginBottom: 14 }}>{error}</div>}

              <div className="row">
                <button type="submit" disabled={!ready || busy}>
                  {busy ? "Reading your submission…" : "Submit to the committee"}
                </button>
                <span className="tiny">
                  Submitting runs the analysis once. A human reads it either way.
                </span>
              </div>
            </div>
          </form>

          <div className="side">
            <MentorPanel
              heading="Mentor"
              intro="Stuck on the abstract, or wondering whether this has been done? Ask. The mentor can see your draft, searches 3,436 prior talks before it claims anything, and will not write a word of it for you."
              prompts={PROMPTS}
              context={snapshot}
              maxHeight="46vh"
            />
          </div>
        </div>
      </div>
    </>
  );
}
