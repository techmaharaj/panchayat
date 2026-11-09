"use client";

import { useRef, useState } from "react";
import type { Neighbour } from "@/lib/retrieval/types";
import { TalkCards } from "./TalkCards";

export type Item =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; label: string; summary: string | null; citations: Neighbour[] }
  | { kind: "error"; text: string };

/**
 * The mentor, usable on its own page or docked beside the submission form.
 * It is the same agent and the same tools either way: it coaches, it cites,
 * and it will not write the speaker's abstract.
 */
export function MentorPanel({
  prompts,
  context,
  heading,
  intro,
  maxHeight,
}: {
  prompts: string[];
  /** Optional snapshot of the form, so the mentor can see the draft. */
  context?: () => string;
  heading: string;
  intro: string;
  maxHeight?: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [backend, setBackend] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  function scroll() {
    requestAnimationFrame(() => {
      const el = logRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;

    const prior = items
      .filter((i) => i.kind === "user" || i.kind === "assistant")
      .map((i) => ({ role: i.kind as "user" | "assistant", content: (i as { text: string }).text }));

    const snapshot = context?.().trim();
    const outgoing =
      snapshot && !prior.length
        ? `${clean}\n\n[The draft on their form right now, for your reference only. Do not rewrite it.]\n${snapshot}`
        : clean;

    setItems((p) => [...p, { kind: "user", text: clean }]);
    setInput("");
    setBusy(true);
    scroll();

    try {
      const res = await fetch("/api/mentor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [...prior, { role: "user", content: outgoing }] }),
      });
      if (!res.ok || !res.body) throw new Error(`the mentor returned ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let ev: Record<string, unknown>;
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }

          if (ev.type === "backend") setBackend(String(ev.name));
          else if (ev.type === "token") {
            const t = String(ev.text);
            setItems((p) => {
              const last = p[p.length - 1];
              if (last?.kind === "assistant")
                return [...p.slice(0, -1), { kind: "assistant", text: last.text + t }];
              return [...p, { kind: "assistant", text: t }];
            });
          } else if (ev.type === "tool_start") {
            setItems((p) => [...p, { kind: "tool", label: String(ev.label), summary: null, citations: [] }]);
          } else if (ev.type === "tool_end") {
            if (ev.degraded) setDegraded(true);
            if (ev.backend) setBackend(String(ev.backend));
            setItems((p) => {
              const back = [...p].reverse().findIndex((i) => i.kind === "tool" && i.summary === null);
              if (back === -1) return p;
              const at = p.length - 1 - back;
              const next = [...p];
              next[at] = {
                kind: "tool",
                label: (p[at] as { label: string }).label,
                summary: String(ev.summary),
                citations: (ev.citations as Neighbour[]) ?? [],
              };
              return next;
            });
          } else if (ev.type === "error") {
            setItems((p) => [...p, { kind: "error", text: String(ev.message) }]);
          }
          scroll();
        }
      }
    } catch (err) {
      setItems((p) => [...p, { kind: "error", text: (err as Error).message }]);
    } finally {
      setBusy(false);
      scroll();
    }
  }

  return (
    <div className="card">
      <div className="hd">
        <h2>{heading}</h2>
        <span style={{ marginLeft: "auto" }} className={`chip${degraded ? " degraded" : ""}`}>
          <span className="led" />
          {backend ?? "ready"}
        </span>
      </div>

      <div className="chatlog" ref={logRef} style={maxHeight ? { maxHeight } : undefined}>
        {!items.length && <p className="muted" style={{ margin: 0 }}>{intro}</p>}

        {items.map((item, i) => {
          if (item.kind === "user") return <div className="bubble user" key={i}>{item.text}</div>;
          if (item.kind === "assistant")
            return (
              <div className="bubble bot" key={i}>
                <div className="who">Mentor</div>
                {item.text}
              </div>
            );
          if (item.kind === "tool")
            return (
              <div key={i} style={{ display: "grid", gap: 7 }}>
                <span className={`toolpill${item.summary === null ? " running" : ""}`}>
                  <span className="led" />
                  {item.summary ?? `${item.label}…`}
                </span>
                <TalkCards talks={item.citations} limit={4} />
              </div>
            );
          return <div className="banner err" key={i}>{item.text}</div>;
        })}
      </div>

      {!items.length && (
        <div className="prompts">
          {prompts.map((p) => (
            <button key={p} onClick={() => send(p)} disabled={busy}>
              {p}
            </button>
          ))}
        </div>
      )}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          rows={1}
          value={input}
          placeholder="Ask the mentor…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <button type="submit" disabled={busy || !input.trim()}>
          {busy ? "…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
