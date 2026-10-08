// Demo team workspace: task claims and notes.
// Every visitor sees the seeded team activity (data/seed_workspace.json) plus their own changes,
// which are stored per visitor for 24 hours (Upstash Redis, or memory in local dev).
// No login: in production this would sit behind SSO with one shared workspace.
import "server-only";

import { Redis } from "@upstash/redis";

import seedJson from "@/data/seed_workspace.json";

export type Claim = { by: string; at: string; mine: boolean };
export type Note = { author: string; at: string; text: string; mine: boolean };
export type TaskWorkspace = { claim: Claim | null; notes: Note[] };

type Stored = { claims: Record<string, { at: string }>; notes: Record<string, { at: string; text: string }[]> };

export const YOU = "You";
const TTL_SECONDS = 86_400;
export const MAX_NOTE_LENGTH = 500;
const MAX_NOTES_PER_TASK = 20;

const seed = seedJson as unknown as {
  claims: Record<string, { by: string; at: string }>;
  notes: Record<string, { author: string; at: string; text: string }[]>;
};

const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN ? Redis.fromEnv() : null;
const memory = new Map<string, { value: Stored; expires: number }>();
const key = (visitor: string) => `signal:workspace:${visitor}`;
const empty = (): Stored => ({ claims: {}, notes: {} });

async function load(visitor: string): Promise<Stored> {
  if (redis) return (await redis.get<Stored>(key(visitor))) ?? empty();
  const hit = memory.get(visitor);
  return hit && hit.expires > Date.now() ? hit.value : empty();
}

async function save(visitor: string, value: Stored) {
  if (redis) await redis.set(key(visitor), value, { ex: TTL_SECONDS });
  else memory.set(visitor, { value, expires: Date.now() + TTL_SECONDS * 1000 });
}

function claimFor(task: string, mine: Stored): Claim | null {
  if (mine.claims[task]) return { by: YOU, at: mine.claims[task].at, mine: true };
  const s = seed.claims[task];
  return s ? { ...s, mine: false } : null;
}

export async function getTaskWorkspace(visitor: string | null, task: string): Promise<TaskWorkspace> {
  const mine = visitor ? await load(visitor) : empty();
  const notes: Note[] = [
    ...(seed.notes[task] ?? []).map((n) => ({ ...n, mine: false })),
    ...(mine.notes[task] ?? []).map((n) => ({ author: YOU, ...n, mine: true })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return { claim: claimFor(task, mine), notes };
}

/** All claims (seeded + this visitor's), for the queue and the agent. */
export async function getAllClaims(visitor: string | null): Promise<Record<string, Claim>> {
  const mine = visitor ? await load(visitor) : empty();
  const out: Record<string, Claim> = {};
  for (const task of new Set([...Object.keys(seed.claims), ...Object.keys(mine.claims)])) {
    const c = claimFor(task, mine);
    if (c) out[task] = c;
  }
  return out;
}

export type WorkspaceAction = { action: "claim" | "unclaim"; task: string } | { action: "note"; task: string; text: string };

/** Applies a change to this visitor's workspace. Returns an error message, or null on success. */
export async function updateWorkspace(visitor: string, a: WorkspaceAction): Promise<string | null> {
  const mine = await load(visitor);
  if (a.action === "claim") {
    if (seed.claims[a.task] && !mine.claims[a.task]) return `Already claimed by ${seed.claims[a.task].by}.`;
    mine.claims[a.task] = { at: new Date().toISOString() };
  } else if (a.action === "unclaim") {
    delete mine.claims[a.task];
  } else if (a.action === "note") {
    const list = mine.notes[a.task] ?? [];
    if (list.length >= MAX_NOTES_PER_TASK) return "Note limit reached for this task in the demo.";
    mine.notes[a.task] = [...list, { at: new Date().toISOString(), text: a.text }];
  }
  await save(visitor, mine);
  return null;
}
