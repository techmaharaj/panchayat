import OpenAI from "openai";
import { resolveModel } from "@/lib/config";

/**
 * The single door to model access. Every call site names a purpose, never a
 * model id, and nothing outside this file knows what is behind the endpoint.
 */
let client: OpenAI | null = null;

function llm(): OpenAI {
  if (client) return client;
  const baseURL = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  if (!baseURL) throw new Error("LLM_BASE_URL is not set");
  if (!apiKey) throw new Error("LLM_API_KEY is not set");
  client = new OpenAI({ baseURL, apiKey });
  return client;
}

type Messages = OpenAI.Chat.Completions.ChatCompletionMessageParam[];
type Tools = OpenAI.Chat.Completions.ChatCompletionTool[];

export function chatStream(purpose: string, messages: Messages, tools?: Tools) {
  const { model, spec } = resolveModel(purpose);
  return llm().chat.completions.create({
    model,
    messages,
    temperature: spec.temperature,
    stream: true,
    ...(tools && tools.length ? { tools } : {}),
  });
}

export async function chat(purpose: string, messages: Messages, tools?: Tools) {
  const { model, spec } = resolveModel(purpose);
  return llm().chat.completions.create({
    model,
    messages,
    temperature: spec.temperature,
    stream: false,
    ...(tools && tools.length ? { tools } : {}),
  });
}

export function maxToolCalls(purpose: string): number {
  const { spec } = resolveModel(purpose);
  return spec.max_tool_calls_per_turn ?? 4;
}
