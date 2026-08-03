/**
 * Request-scoped helpers.
 *
 * The client IP and user agent go on every audit row, so they are read in one
 * place with one rule: the first hop of `x-forwarded-for` (what Vercel and most
 * proxies set), falling back to `x-real-ip`. Returning null rather than a guess
 * matters — "not recorded" is honest evidence in an audit log; an invented
 * address is not.
 */

import { headers } from "next/headers";

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  return h.get("x-real-ip") ?? null;
}

export async function userAgent(): Promise<string | null> {
  const h = await headers();
  const ua = h.get("user-agent");
  // Truncated: a 400-character UA string in an audit row is noise, and the
  // ledger is read on a 390px screen.
  return ua ? ua.slice(0, 160) : null;
}

export async function requestMeta(): Promise<{
  ip: string | null;
  userAgent: string | null;
}> {
  return { ip: await clientIp(), userAgent: await userAgent() };
}
