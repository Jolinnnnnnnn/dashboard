import { z } from "zod";

import { checkWriteLimit } from "@/lib/agent/ratelimit";
import { allTaskIds } from "@/lib/data";
import { ensureVisitor, visitorId } from "@/lib/visitor";
import { MAX_NOTE_LENGTH, getAllClaims, getTaskWorkspace, updateWorkspace } from "@/lib/workspace";

// Demo team workspace: claims and notes, sandboxed per visitor for 24 hours (see lib/workspace.ts).

const TASK_IDS = new Set(allTaskIds());
const TaskId = z.string().refine((id) => TASK_IDS.has(id), "Unknown task");

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["claim", "unclaim"]), task: TaskId }),
  z.object({ action: z.literal("note"), task: TaskId, text: z.string().trim().min(1).max(MAX_NOTE_LENGTH) }),
]);

export async function GET(request: Request) {
  const task = new URL(request.url).searchParams.get("task");
  const visitor = visitorId(request);
  if (!task) return Response.json({ claims: await getAllClaims(visitor) }, { headers: { "Cache-Control": "no-store" } });
  if (!TASK_IDS.has(task)) return Response.json({ error: "Unknown task" }, { status: 404 });
  return Response.json(await getTaskWorkspace(visitor, task), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const parsed = Action.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });

  const { id, setCookie } = ensureVisitor(request);
  const headers: HeadersInit = setCookie ? { "Set-Cookie": setCookie } : {};
  const limited = await checkWriteLimit(id);
  if (limited) return Response.json({ error: limited }, { status: 429, headers });

  const error = await updateWorkspace(id, parsed.data);
  if (error) return Response.json({ error }, { status: 409, headers });
  return Response.json(await getTaskWorkspace(id, parsed.data.task), { headers });
}
