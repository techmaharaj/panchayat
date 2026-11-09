"use client";

import Link from "next/link";
import { MentorPanel } from "./MentorPanel";

const PROMPTS = [
  "I want to talk about Backstage",
  "Write my abstract for me",
  "Is observability too crowded for a first-time speaker?",
  "I migrated 40 clusters off Istio. Is that a talk?",
];

export default function MentorPage() {
  return (
    <>
      <div className="topbar">
        <h1>Mentor</h1>
        <span className="sep">/</span>
        <span className="muted">for speakers who have nobody to ask</span>
        <div className="right">
          <Link href="/submit">
            <button className="secondary small">Go to the form →</button>
          </Link>
        </div>
      </div>

      <div className="page">
        <div className="tiles" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <div className="tile accent">
            <div className="k">Corpus</div>
            <div className="v">3,436</div>
            <div className="c">real talks, 2023 to 2026</div>
          </div>
          <div className="tile">
            <div className="k">Grounding</div>
            <div className="v sm">Every claim</div>
            <div className="c">comes from a search, never from memory</div>
          </div>
          <div className="tile">
            <div className="k">Citations</div>
            <div className="v sm">Real links</div>
            <div className="c">each card opens the actual schedule page</div>
          </div>
          <div className="tile">
            <div className="k">It will not</div>
            <div className="v sm">Write for you</div>
            <div className="c">ask it to and watch what happens</div>
          </div>
        </div>

        <div className="withside">
          <MentorPanel
            heading="Mentor"
            intro="You have an idea and nobody to ask whether it is worth submitting. Start anywhere. The mentor searches 3,436 prior talks before it says anything about the field, and it will ask what you actually did before it offers you an opinion."
            prompts={PROMPTS}
            maxHeight="58vh"
          />

          <div className="side stack">
            <div className="card">
              <div className="hd">
                <h2>How this works</h2>
              </div>
              <div className="bd stack" style={{ gap: 12 }}>
                <p className="muted" style={{ margin: 0 }}>
                  Two tools, nothing else. <b>Count a topic</b> across the corpus, and{" "}
                  <b>find prior talks</b> like an idea. You see each call as it runs.
                </p>
                <p className="muted" style={{ margin: 0 }}>
                  It will not write or rewrite your abstract, not even a sentence of it, and
                  not when the deadline is in an hour. An abstract in its words stops being
                  yours, and a reviewer can tell.
                </p>
                <p className="muted" style={{ margin: 0 }}>
                  When you are ready, the form is next door and the mentor comes with you.
                </p>
                <Link href="/submit">
                  <button style={{ width: "100%" }}>Start a submission</button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
