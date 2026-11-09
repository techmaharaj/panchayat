"use client";

import { useRef, useState } from "react";
import type { Neighbour } from "@/lib/retrieval/types";
import { TalkCards } from "./TalkCards";

type Item =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; label: string; summary: string | null; citations: Neighbour[] }
  | { kind: "error"; text: string };

const STARTERS = [
  "I want to talk about Backstage",
  "Write my abstract for me",
  "Is observability too crowded for a first-time speaker?",
];

export default function MentorPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [backend, setBackend] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  function scroll() {
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
  }

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;

    const history = [
      ...items
        .filter((i) => i.kind === "user" || i.kind === "assistant")
        .map((i) => ({
          role: i.kind as "user" | "assistant",
          content: (i as { text: string }).text,
        })),
      { role: "user" as const, content: clean },
    ];

    setItems((prev) => [...prev, { kind: "user", text: clean }]);
    setInput("");
    setBusy(true);
    scroll();

    try {
      const res = await fetch("/api/mentor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok || !res.body) throw new Error(`the mentor route returned ${res.status}`);

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

          if (ev.type === "backend") {
            setBackend(String(ev.name));
          } else if (ev.type === "token") {
            const t = String(ev.text);
            setItems((prev) => {
              const last = prev[prev.length - 1];
              if (last?.kind === "assistant") {
                return [...prev.slice(0, -1), { kind: "assistant", text: last.text + t }];
              }
              return [...prev, { kind: "assistant", text: t }];
            });
          } else if (ev.type === "tool_start") {
            setItems((prev) => [
              ...prev,
              { kind: "tool", label: String(ev.label), summary: null, citations: [] },
            ]);
          } else if (ev.type === "tool_end") {
            if (ev.degraded) setDegraded(true);
            if (ev.backend) setBackend(String(ev.backend));
            setItems((prev) => {
              const idx = [...prev].reverse().findIndex(
                (i) => i.kind === "tool" && i.summary === null,
              );
              if (idx === -1) return prev;
              const at = prev.length - 1 - idx;
              const next = [...prev];
              next[at] = {
                kind: "tool",
                label: (prev[at] as { label: string }).label,
                summary: String(ev.summary),
                citations: (ev.citations as Neighbour[]) ?? [],
              };
              return next;
            });
          } else if (ev.type === "error") {
            setItems((prev) => [...prev, { kind: "error", text: String(ev.message) }]);
          }
          scroll();
        }
      }
    } catch (err) {
      setItems((prev) => [...prev, { kind: "error", text: (err as Error).message }]);
    } finally {
      setBusy(false);
      scroll();
    }
  }

  return (
    <div className="shell">
      <header className="top">
        <h1>Panchayat</h1>
        <span className="tag">CFP mentor, grounded in 3,436 real KubeCon talks</span>
        <nav>
          <a href="/review">Reviewer view</a>
        </nav>
      </header>

      <div className="row" style={{ marginBottom: 6 }}>
        <span className={`backend${degraded ? " degraded" : ""}`}>
          retrieval: {backend ?? "not called yet"}
        </span>
        <span className="note">Every count and every talk below comes from a tool call.</span>
      </div>

      {!items.length && (
        <>
          <p className="note" style={{ marginTop: 18 }}>
            You are a first-time speaker with nobody to ask. Start anywhere.
          </p>
          <div className="starters">
            {STARTERS.map((s) => (
              <button key={s} onClick={() => send(s)} disabled={busy}>
                {s}
              </button>
            ))}
          </div>
        </>
      )}

      {items.map((item, i) => {
        if (item.kind === "user") {
          return (
            <div className="msg user" key={i}>
              <div className="who">you</div>
              <div className="body">{item.text}</div>
            </div>
          );
        }
        if (item.kind === "assistant") {
          return (
            <div className="msg" key={i}>
              <div className="who">mentor</div>
              <div className="body">{item.text}</div>
            </div>
          );
        }
        if (item.kind === "tool") {
          return (
            <div key={i}>
              <div className={`tool${item.summary === null ? " running" : ""}`}>
                <span className="dot" />
                <span>{item.summary ?? `${item.label}...`}</span>
              </div>
              <TalkCards talks={item.citations} />
            </div>
          );
        }
        return (
          <div className="err" key={i}>
            {item.text}
          </div>
        );
      })}

      <div ref={endRef} />

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <div className="inner">
          <textarea
            rows={1}
            value={input}
            placeholder="What do you want to talk about?"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          <button type="submit" disabled={busy || !input.trim()}>
            {busy ? "..." : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
