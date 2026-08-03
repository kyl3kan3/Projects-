/**
 * src/lib/tokens.ts
 *
 * Patient-facing links. Patients never get an account — every touch carries a
 * signed, expiring token that authorises exactly one thing for exactly one
 * patient.
 *
 * Two token audiences, both HS256 via jose and both keyed on
 * `BOOKING_TOKEN_SECRET`:
 *
 *   `book` — opens `/book/[token]`: request an appointment time.
 *   `stop` — opens `/stop/[token]`: unsubscribe from email. Never expires,
 *            because an unsubscribe link that has gone stale is a complaint.
 *
 * A hash of the token is stored on the touch (`touches.booking_token_hash`) so a
 * booking request can be tied back to the message that produced it without
 * keeping the bearer credential itself in the database.
 */

import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

const ISSUER = "recalldesk";

function key(): Uint8Array {
  return new TextEncoder().encode(env.bookingTokenSecret);
}

export interface BookingTokenPayload {
  patientId: string;
  locationId: string;
  touchId: string | null;
}

/** Booking links live as long as a reactivation campaign plausibly runs. */
const BOOKING_TTL_DAYS = 60;

export async function mintBookingToken(payload: BookingTokenPayload): Promise<string> {
  return new SignJWT({ p: payload.patientId, l: payload.locationId, t: payload.touchId ?? undefined })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience("book")
    .setIssuedAt()
    .setExpirationTime(`${BOOKING_TTL_DAYS}d`)
    .sign(key());
}

export async function verifyBookingToken(token: string): Promise<BookingTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: ISSUER, audience: "book" });
    const patientId = payload.p;
    const locationId = payload.l;
    if (typeof patientId !== "string" || typeof locationId !== "string") return null;
    return {
      patientId,
      locationId,
      touchId: typeof payload.t === "string" ? payload.t : null,
    };
  } catch {
    return null;
  }
}

export interface StopTokenPayload {
  patientId: string;
  channel: "email";
}

export async function mintStopToken(patientId: string): Promise<string> {
  return new SignJWT({ p: patientId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience("stop")
    .setIssuedAt()
    .sign(key());
}

export async function verifyStopToken(token: string): Promise<StopTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: ISSUER, audience: "stop" });
    return typeof payload.p === "string" ? { patientId: payload.p, channel: "email" } : null;
  } catch {
    return null;
  }
}

/** What gets stored on the touch — never the token itself. */
export function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 32);
}

export function bookingUrl(appUrl: string, token: string): string {
  return `${appUrl}/book/${token}`;
}

export function stopUrl(appUrl: string, token: string): string {
  return `${appUrl}/stop/${token}`;
}
