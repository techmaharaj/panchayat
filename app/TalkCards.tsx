"use client";

import type { Neighbour } from "@/lib/retrieval/types";

export function TalkCards({ talks, limit }: { talks: Neighbour[]; limit?: number }) {
  if (!talks.length) return null;
  const shown = limit ? talks.slice(0, limit) : talks;
  return (
    <div className="talkcards">
      {shown.map((t) => (
        <a key={t.id} className="talkcard" href={t.source_url} target="_blank" rel="noreferrer">
          <div className="t">{t.title}</div>
          <div className="m">
            {t.conference} {t.edition} {t.year}
            {t.track ? ` · ${t.track}` : ""}
            {t.speakers?.length
              ? ` · ${t.speakers.map((s) => s.name).slice(0, 2).join(", ")}`
              : ""}
          </div>
        </a>
      ))}
    </div>
  );
}
