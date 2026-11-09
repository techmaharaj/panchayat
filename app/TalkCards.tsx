"use client";

import type { Neighbour } from "@/lib/retrieval/types";

export function TalkCards({ talks }: { talks: Neighbour[] }) {
  if (!talks.length) return null;
  return (
    <div className="cards">
      {talks.map((t) => (
        <a key={t.id} className="card" href={t.source_url} target="_blank" rel="noreferrer">
          <div className="t">{t.title}</div>
          <div className="m">
            {t.conference} {t.edition} {t.year}
            {t.track ? ` · ${t.track}` : ""}
            {t.speakers?.length ? ` · ${t.speakers.map((s) => s.name).slice(0, 2).join(", ")}` : ""}
          </div>
        </a>
      ))}
    </div>
  );
}
