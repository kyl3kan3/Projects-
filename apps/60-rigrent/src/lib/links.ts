/**
 * src/lib/links.ts
 *
 * The signed customer link — how somebody renting 40 chairs reads their quote,
 * signs it and authorises a deposit without ever having an account.
 *
 * A link is a JWT signed with LINK_TOKEN_SECRET carrying the order id. The
 * sha256 of the token is stored on the order, and `/q/[token]` resolves the
 * order **by that hash**, never by an id carried in the URL. Two consequences,
 * both wanted:
 *
 *  - The database never holds a usable credential. A stolen dump does not sign
 *    anybody's contract.
 *  - Re-sending a quote mints a new token and invalidates the old one, so a
 *    forwarded link stops working the moment the shop re-issues.
 */

import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

/** 60 days: long enough for an event booked a season out, short enough to expire. */
const TTL = "60d";

function key(): Uint8Array {
  return new TextEncoder().encode(env.linkTokenSecret);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function mintQuoteToken(orderId: string): Promise<{ token: string; hash: string }> {
  const token = await new SignJWT({ orderId, purpose: "quote" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(key());
  return { token, hash: hashToken(token) };
}

export async function verifyQuoteToken(token: string): Promise<{ orderId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.purpose !== "quote") return null;
    const orderId = payload.orderId;
    if (typeof orderId !== "string" || !orderId) return null;
    return { orderId };
  } catch {
    return null;
  }
}

export function quoteLinkUrl(token: string): string {
  return `${env.appUrl}/q/${token}`;
}
