import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

export interface ModelSpec {
  alias: string;
  temperature: number;
  stream?: boolean;
  max_tool_calls_per_turn?: number;
}

export interface AppConfig {
  aliases: Record<string, string>;
  models: Record<string, ModelSpec>;
  retrieval: { k: number; rrf_rank_constant: number };
  weights: Record<string, number>;
}

let cached: AppConfig | null = null;

export function config(): AppConfig {
  if (cached) return cached;
  const raw = readFileSync(join(process.cwd(), "config", "models.yaml"), "utf8");
  cached = parse(raw) as AppConfig;
  return cached;
}

/**
 * Resolve a purpose ("mentor", "analyse") to a concrete model name.
 * A missing alias fails here rather than silently falling back.
 */
export function resolveModel(purpose: string): { model: string; spec: ModelSpec } {
  const cfg = config();
  const spec = cfg.models[purpose];
  if (!spec) throw new Error(`No model config for purpose "${purpose}"`);
  const model = cfg.aliases[spec.alias];
  if (!model) throw new Error(`Alias "${spec.alias}" is empty in config/models.yaml`);
  return { model, spec };
}
