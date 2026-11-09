import { runMentor } from "@/lib/mentor/agent";
import { backendName } from "@/lib/retrieval";

export const runtime = "nodejs";
export const maxDuration = 120;

interface Body {
  messages?: { role: "user" | "assistant"; content: string }[];
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const history = (body.messages ?? []).filter(
    (m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
  );
  if (!history.length) return new Response("no messages", { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      try {
        send({ type: "backend", name: backendName() });
        for await (const ev of runMentor(history)) send(ev);
      } catch (err) {
        send({ type: "error", message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
