/**
 * Signed links — how tenants, applicants and lease signers act without accounts.
 *
 * Three shapes of access, deliberately different:
 *
 *  - **Tenant portal** (`/t/{token}`): a durable, unguessable token stored on the
 *    tenancy row. It goes into every rent reminder and has to keep working for a
 *    year, so it is a random 32-byte secret checked against the database, not a
 *    JWT that expires mid-tenancy. Revoking it is a column update.
 *  - **Screening invite** (`/screen/{token}`) and **lease signing**
 *    (`/sign/{token}`): the same shape — a stored random token — because both
 *    are forwarded by email and must survive a slow applicant.
 *  - **File download / upload tickets**: short-lived signed JWTs, since these
 *    carry a capability rather than an identity.
 *
 * The rule that matters: a token is a bearer credential. Every route that takes
 * one must fetch the row *by* the token and use only what that row points at —
 * never a tenancy id from the query string.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

/** 32 bytes, base64url: 256 bits of unguessable. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Constant-time compare for the rare path that checks a token in memory. */
export function tokensMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function key(): Uint8Array {
  return new TextEncoder().encode(env.linkTokenSecret);
}

export type TicketPurpose = "upload" | "download";

export interface Ticket {
  purpose: TicketPurpose;
  /** The storage scope an upload ticket may write to. */
  scope?: string;
  /** The exact key a download ticket may read. */
  storageKey?: string;
  /** Who the ticket was minted for, for the audit trail. */
  subject: string;
  landlordId: string;
}

/**
 * Mint a capability. Uploads get 30 minutes (long enough for a bad connection to
 * finish a photo), downloads 5 (long enough to click).
 */
export async function signTicket(ticket: Ticket): Promise<string> {
  const ttl = ticket.purpose === "upload" ? "30m" : "5m";
  return new SignJWT({ ...ticket })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(key());
}

export async function verifyTicket(token: string): Promise<Ticket | null> {
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.purpose !== "upload" && payload.purpose !== "download") return null;
    return {
      purpose: payload.purpose,
      scope: typeof payload.scope === "string" ? payload.scope : undefined,
      storageKey: typeof payload.storageKey === "string" ? payload.storageKey : undefined,
      subject: String(payload.subject ?? ""),
      landlordId: String(payload.landlordId ?? ""),
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------- URLs --- */

export function tenantPortalUrl(portalToken: string): string {
  return `${env.appUrl}/t/${portalToken}`;
}

export function listingUrl(slug: string): string {
  return `${env.appUrl}/apply/${slug}`;
}

export function screeningInviteUrl(token: string): string {
  return `${env.appUrl}/screen/${token}`;
}

export function signingUrl(token: string): string {
  return `${env.appUrl}/sign/${token}`;
}
