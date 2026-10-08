// Anonymous visitor ID (cookie) for the demo workspace sandbox. Not a login: it only separates
// one visitor's claims and notes from another's.
import "server-only";

const COOKIE = "signal_vid";
const ID = /^[a-f0-9-]{36}$/;

export function visitorId(request: Request): string | null {
  const match = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return match && ID.test(match[1]) ? match[1] : null;
}

/** Returns the visitor ID, creating one (with its Set-Cookie header) if the request has none. */
export function ensureVisitor(request: Request): { id: string; setCookie?: string } {
  const existing = visitorId(request);
  if (existing) return { id: existing };
  const id = crypto.randomUUID();
  return { id, setCookie: `${COOKIE}=${id}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax; Secure` };
}
