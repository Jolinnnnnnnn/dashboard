import { getSearchIndex } from "@/lib/data";

// Static JSON for the jump-to search: prerendered at build time (no request data), cached by the CDN.
export function GET() {
  return Response.json(getSearchIndex());
}
