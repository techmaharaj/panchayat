import { Client } from "@elastic/elasticsearch";

export const TALKS_INDEX = "talks";

let client: Client | null = null;

export function elasticConfigured(): boolean {
  return Boolean(process.env.ELASTIC_CLOUD_ID && process.env.ELASTIC_API_KEY);
}

export function es(): Client {
  if (client) return client;
  const cloudId = process.env.ELASTIC_CLOUD_ID;
  const apiKey = process.env.ELASTIC_API_KEY;
  if (!cloudId || !apiKey) throw new Error("Elastic is not configured");
  client = new Client({
    cloud: { id: cloudId },
    auth: { apiKey },
    requestTimeout: 30000,
  });
  return client;
}
