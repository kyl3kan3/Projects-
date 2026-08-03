/**
 * src/lib/tokens.ts
 *
 * Client-facing links. Clients never get an account — client accounts are where
 * booking conversion dies — so every touch that lets somebody act on their own
 * appointment carries a signed, expiring token that authorises exactly one thing.
 *
 * Three audiences, all HS256 via jose on `LINK_TOKEN_SECRET`:
 *
 *   `manage`         /a/[token]  — reschedule or cancel one appointment.
 *   `nudge_booking`  /b/[handle]?n=[token] — one-tap rebooking, service pre-filled.
 *   `waitlist_claim` /w/[token]  — claim a freed slot. First tap wins.
 *
 * A hash of each token is stored on its row, never the token itself. That means one
 * link can be revoked (reschedule mints a new one and the old hash stops matching)
 * without rotating the secret, and a database dump does not hand out bearer
 * credentials to other people's appointments.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

const ISSUER = "chairflow";

export type TokenKind = "manage" | "nudge_booking" | "waitlist_claim";

function key(): Uint8Array {
  return new TextEncoder().encode(env.linkTokenSecret);
}

/** Manage links must outlive the appointment they point at, but not by much. */
const TTL_SECONDS: Record<TokenKind, number> = {
  manage: 60 * 60 * 24 * 120,
  nudge_booking: 60 * 60 * 24 * 30,
  waitlist_claim: 60 * 60 * 2,
};

export async function mintToken(
  kind: TokenKind,
  subjectId: string,
  extra: Record<string, string> = {},
): Promise<{ token: string; hash: string }> {
  const token = await new SignJWT({ ...extra })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(kind)
    .setSubject(subjectId)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS[kind]}s`)
    .sign(key());
  return { token, hash: tokenHash(token) };
}

export interface VerifiedToken {
  subjectId: string;
  claims: Record<string, unknown>;
  hash: string;
}

/**
 * Verify signature, issuer, audience and expiry. Returns null on any failure —
 * callers render a calm "this link has expired" page rather than a stack trace,
 * because the person holding a stale link did nothing wrong.
 */
export async function verifyToken(
  kind: TokenKind,
  token: string,
): Promise<VerifiedToken | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: ISSUER, audience: kind });
    if (typeof payload.sub !== "string") return null;
    return { subjectId: payload.sub, claims: payload, hash: tokenHash(token) };
  } catch {
    return null;
  }
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Constant-time comparison against the hash stored on the row.
 *
 * A signature check alone proves the token was minted by us; this proves it is still
 * the *current* link for that row, which is what makes rescheduling revoke the old
 * one and what makes a waitlist claim single-use.
 */
export function hashMatches(a: string | null, b: string | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function manageUrl(appUrl: string, token: string): string {
  return `${appUrl}/a/${token}`;
}

export function claimUrl(appUrl: string, token: string): string {
  return `${appUrl}/w/${token}`;
}

export function nudgeBookingUrl(appUrl: string, handle: string, token: string): string {
  return `${appUrl}/b/${handle}?n=${token}`;
}

export function bookingUrl(appUrl: string, handle: string): string {
  return `${appUrl}/b/${handle}`;
}
