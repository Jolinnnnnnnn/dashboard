import { z } from "zod";

import { checkRateLimit } from "@/lib/agent/ratelimit";
import { type AgentEvent, runAgent } from "@/lib/agent/run";

// Node.js runtime (edge isn't supported with cacheComponents). Agent answers take ~5-20s.
export const maxDuration = 60;

const Body = z.object({
  question: z.string().trim().min(1).max(500),
  context: z.string().max(60).optional(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(8).default([]),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  const visitor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limited = await checkRateLimit(visitor);
  if (limited) return Response.json({ error: limited }, { status: 429 });

  const { question, context, history } = parsed.data;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runAgent(history, question, context, emit, request.signal);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
