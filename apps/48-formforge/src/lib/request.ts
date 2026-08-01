/**
 * Request-scoped helpers.
 *
 * The client IP goes on audit rows and on signature records, so it is read in one
 * place with one rule: the first hop of `x-forwarded-for`, which is what Vercel and
 * most reverse proxies set, falling back to `x-real-ip`. Returning null rather than
 * a guess matters — "not recorded" is honest evidence, an invented address is not.
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
  return h.get("user-agent") ?? null;
}
