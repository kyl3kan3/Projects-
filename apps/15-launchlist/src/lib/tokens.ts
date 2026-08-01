/**
 * Capability tokens for people on a waitlist. They have no account, so every
 * link mailed to them has to carry its own authority:
 *
 *   verify token   — one use, stored on the row, cleared when spent.
 *   unsubscribe    — derived, stateless HMAC of the signup id. Can't be
 *                    enumerated, never expires (an unsubscribe link in a
 *                    two-year-old email must still work), and needs no column.
 *
 * The share code is *not* a secret: it is meant to be posted publicly. It grants
 * read access to that person's own position page and nothing else, which is why
 * the position page shows a masked email and no list-wide data.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

function sign(value: string, secret: string, purpose: string): string {
  return createHmac("sha256", secret).update(`${purpose}:${value}`).digest("base64url").slice(0, 32);
}

/** `{id}.{mac}` — self-contained, verifiable, and safe in a URL. */
export function makeSignedToken(id: string, secret: string, purpose: string): string {
  return `${id}.${sign(id, secret, purpose)}`;
}

export function readSignedToken(
  token: string | null | undefined,
  secret: string,
  purpose: string,
): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = sign(id, secret, purpose);
  if (mac.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return id;
}

export const UNSUBSCRIBE_PURPOSE = "unsubscribe";

export function unsubscribeToken(signupId: string, secret: string): string {
  return makeSignedToken(signupId, secret, UNSUBSCRIBE_PURPOSE);
}

export function readUnsubscribeToken(token: string | null | undefined, secret: string): string | null {
  return readSignedToken(token, secret, UNSUBSCRIBE_PURPOSE);
}

/** HMAC signature header for outbound webhooks: `sha256=<hex>`. */
export function webhookSignature(payload: string, secret: string, timestamp: number): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `sha256=${mac}`;
}
