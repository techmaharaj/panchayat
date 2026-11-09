import { readFileSync } from "node:fs";
import { join } from "node:path";
import type OpenAI from "openai";
import { chatStream, maxToolCalls } from "@/lib/llm/client";
import { mentorTools, runMentorTool } from "./tools";
import type { Neighbour } from "@/lib/retrieval";

type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

let systemPrompt: string | null = null;

function prompt(): string {
  systemPrompt ??= readFileSync(join(process.cwd(), "prompts", "mentor.md"), "utf8");
  return systemPrompt;
}

export type MentorEvent =
  | { type: "token"; text: string }
  | { type: "tool_start"; name: string; label: string }
  | { type: "tool_end"; name: string; summary: string; citations: Neighbour[]; backend: string; degraded: boolean }
  | { type: "done" }
  | { type: "error"; message: string };

interface ToolCallAcc {
  id: string;
  name: string;
  args: string;
}

function label(name: string, args: Record<string, unknown>): string {
  if (name === "count_topic") return `counting "${args.topic ?? ""}" across 3,436 past talks`;
  if (name === "search_prior_talks") return `searching 3,436 past talks`;
  return name;
}

/**
 * One turn of the mentor. Streams tokens, runs tools, loops until the model
 * stops calling them or hits the per-turn cap from config/models.yaml.
 */
export async function* runMentor(
  history: { role: "user" | "assistant"; content: string }[],
): AsyncGenerator<MentorEvent> {
  const messages: Msg[] = [
    { role: "system", content: prompt() },
    ...history.map((m) => ({ role: m.role, content: m.content }) as Msg),
  ];

  const cap = maxToolCalls("mentor");
  let used = 0;

  for (let round = 0; round <= cap; round += 1) {
    let stream;
    try {
      stream = await chatStream("mentor", messages, mentorTools);
    } catch (err) {
      yield { type: "error", message: `model call failed: ${(err as Error).message}` };
      return;
    }

    const calls = new Map<number, ToolCallAcc>();
    let text = "";
    let finish: string | null = null;

    try {
      for await (const chunk of stream) {
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta as {
          content?: string | null;
          tool_calls?: {
            index: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }[];
        };

        if (delta.content) {
          text += delta.content;
          yield { type: "token", text: delta.content };
        }

        for (const tc of delta.tool_calls ?? []) {
          const acc = calls.get(tc.index) ?? { id: "", name: "", args: "" };
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.name = tc.function.name;
          if (tc.function?.arguments) acc.args += tc.function.arguments;
          calls.set(tc.index, acc);
        }

        if (choice.finish_reason) finish = choice.finish_reason;
      }
    } catch (err) {
      yield { type: "error", message: `stream broke: ${(err as Error).message}` };
      return;
    }

    if (!calls.size) {
      if (!text.trim()) {
        yield { type: "error", message: "the model returned nothing" };
      }
      yield { type: "done" };
      return;
    }

    const toolCalls = [...calls.entries()].sort(([a], [b]) => a - b).map(([, v]) => v);

    messages.push({
      role: "assistant",
      content: text || null,
      tool_calls: toolCalls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: c.args || "{}" },
      })),
    } as Msg);

    for (const c of toolCalls) {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = c.args ? JSON.parse(c.args) : {};
      } catch {
        parsed = {};
      }
      yield { type: "tool_start", name: c.name, label: label(c.name, parsed) };

      const run = await runMentorTool(c.name, c.args);
      used += 1;

      let summary = "";
      try {
        const payload = JSON.parse(run.content) as { total?: number; found?: number };
        if (typeof payload.total === "number") {
          summary = `${payload.total} of 3,436 past talks match "${parsed.topic ?? ""}"`;
        } else if (typeof payload.found === "number") {
          summary = `${payload.found} similar talks found`;
        } else {
          summary = "no results";
        }
      } catch {
        summary = "no results";
      }

      yield {
        type: "tool_end",
        name: c.name,
        summary,
        citations: run.citations,
        backend: run.backend,
        degraded: run.degraded,
      };

      messages.push({ role: "tool", tool_call_id: c.id, content: run.content } as Msg);
    }

    if (used >= cap) {
      // Out of tool budget: let it answer from what it has, with no tools.
      try {
        const final = await chatStream("mentor", messages);
        for await (const chunk of final) {
          const t = chunk.choices?.[0]?.delta?.content;
          if (t) yield { type: "token", text: t };
        }
      } catch (err) {
        yield { type: "error", message: `final call failed: ${(err as Error).message}` };
      }
      yield { type: "done" };
      return;
    }

    void finish;
  }

  yield { type: "done" };
}
