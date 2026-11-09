import type OpenAI from "openai";
import { searchWithFallback } from "@/lib/retrieval";
import type { Neighbour } from "@/lib/retrieval";

export const mentorTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "count_topic",
      description:
        "Count how many of the 3,436 prior KubeCon talks are about a topic, broken down by year, with a few real examples. Use this for any claim about how much of something exists.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description:
              "A topic as it would appear in a talk title, e.g. 'Backstage', 'eBPF', 'platform engineering'. Keep it short.",
          },
        },
        required: ["topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_prior_talks",
      description:
        "Find prior KubeCon talks that resemble an idea or abstract. Use this to show the speaker what already exists and what angle is still open.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "A sentence describing the talk idea, in the speaker's own terms.",
          },
        },
        required: ["query"],
      },
    },
  },
];

export interface ToolRun {
  name: string;
  args: Record<string, unknown>;
  /** What the model is shown. */
  content: string;
  /** What the UI renders as cards. */
  citations: Neighbour[];
  backend: string;
  degraded: boolean;
}

function brief(n: Neighbour): Record<string, unknown> {
  return {
    title: n.title,
    year: n.year,
    edition: n.edition,
    conference: n.conference,
    track: n.track,
    speakers: (n.speakers ?? []).map((s) => s.name).slice(0, 3),
  };
}

export async function runMentorTool(
  name: string,
  rawArgs: string,
): Promise<ToolRun> {
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    args = {};
  }

  if (name === "count_topic") {
    const topic = String(args.topic ?? "").trim();
    if (!topic) {
      return {
        name,
        args,
        content: JSON.stringify({ error: "no topic given" }),
        citations: [],
        backend: "none",
        degraded: false,
      };
    }
    const { result, backend, degraded } = await searchWithFallback((s) =>
      s.countTopic(topic),
    );
    return {
      name,
      args,
      content: JSON.stringify({
        topic,
        total: result.total,
        by_year: result.byYear,
        corpus_size: 3436,
        examples: result.examples.map(brief),
      }),
      citations: result.examples,
      backend,
      degraded,
    };
  }

  if (name === "search_prior_talks") {
    const query = String(args.query ?? "").trim();
    if (!query) {
      return {
        name,
        args,
        content: JSON.stringify({ error: "no query given" }),
        citations: [],
        backend: "none",
        degraded: false,
      };
    }
    const { result, backend, degraded } = await searchWithFallback((s) =>
      s.searchSimilar(query, { k: 8 }),
    );
    return {
      name,
      args,
      content: JSON.stringify({
        query,
        found: result.length,
        talks: result.map(brief),
      }),
      citations: result,
      backend,
      degraded,
    };
  }

  return {
    name,
    args,
    content: JSON.stringify({ error: `unknown tool ${name}` }),
    citations: [],
    backend: "none",
    degraded: false,
  };
}
