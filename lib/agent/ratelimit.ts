// Rate limits for the public agent endpoint: per visitor and a global daily cap (a cost backstop
// on top of the Anthropic spend limit). Uses Upstash Redis when configured; otherwise an in-memory
// fallback, which is fine for local dev but resets per serverless instance, so set Upstash in production.
import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const PER_MINUTE = 6;
const PER_DAY = 30;
const GLOBAL_PER_DAY = 300;

type Check = (key: string) => Promise<{ success: boolean }>;

const WRITES_PER_MINUTE = 20;

function upstash(): { visitorMinute: Check; visitorDay: Check; global: Check; writes: Check } | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  const redis = Redis.fromEnv();
  const make = (tokens: number, window: `${number} ${"m" | "d"}`, prefix: string) => {
    const rl = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(tokens, window), prefix: `signal:${prefix}` });
    return (key: string) => rl.limit(key);
  };
  return {
    visitorMinute: make(PER_MINUTE, "1 m", "min"), visitorDay: make(PER_DAY, "1 d", "day"),
    global: make(GLOBAL_PER_DAY, "1 d", "global"), writes: make(WRITES_PER_MINUTE, "1 m", "writes"),
  };
}

const memory = new Map<string, number[]>();
function memoryCheck(limit: number, windowMs: number): Check {
  return async (key) => {
    const now = Date.now();
    const hits = (memory.get(key) ?? []).filter((t) => now - t < windowMs);
    if (hits.length >= limit) return { success: false };
    hits.push(now);
    memory.set(key, hits);
    return { success: true };
  };
}

const limits = upstash() ?? {
  visitorMinute: memoryCheck(PER_MINUTE, 60_000),
  visitorDay: memoryCheck(PER_DAY, 86_400_000),
  global: memoryCheck(GLOBAL_PER_DAY, 86_400_000),
  writes: memoryCheck(WRITES_PER_MINUTE, 60_000),
};

export const rateLimitBackend = process.env.UPSTASH_REDIS_REST_URL ? "upstash" : "memory";

/** Returns null if allowed, or a short reason if limited. */
export async function checkRateLimit(visitor: string): Promise<string | null> {
  if (!(await limits.visitorMinute(`m:${visitor}`)).success) return "Demo limit reached, try again in a minute.";
  if (!(await limits.visitorDay(`d:${visitor}`)).success) return "Daily demo limit reached for this visitor. Try again tomorrow.";
  if (!(await limits.global("all")).success) return "The demo has hit its daily question limit. Try again tomorrow.";
  return null;
}

/** Limit for workspace writes (claims and notes). Returns null if allowed. */
export async function checkWriteLimit(visitor: string): Promise<string | null> {
  return (await limits.writes(`w:${visitor}`)).success ? null : "Too many changes in a minute. Try again shortly.";
}
