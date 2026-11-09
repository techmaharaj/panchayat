import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/corpus.jsonl", "./config/models.yaml", "./prompts/**/*"],
  },
};

export default nextConfig;
