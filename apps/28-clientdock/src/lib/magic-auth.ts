/**
 * Magic-link client access. No client ever has a password, and no client ever
 * has an account — README's "adoption lives or dies here".
 *
 * The security contract, which the rest of the portal code depends on:
 *
 *  1. A magic token is 32 random bytes, base64url. Only its SHA-256 is stored, so
 *     a database dump cannot be replayed as portal access.
 *  2. A token is scoped to exactly one (portal, contact) pair, expires, is
 *     single-use, and is revocable.
 *  3. Consuming a token sets a cookie named for *that portal alone*, holding a
 *     JWT whose `portalId` claim must match the portal being read. There is no
 *     ambient "client is logged in" state: access is always to one portal.
 *  4. `getPortalSession(portalId)` is the only way to obtain a portal identity,
 *     and it returns the portal id from the *signed* payload. Every query in
 *     src/lib/portal-access.ts filters on that value, never on a URL segment.
 */

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "node:crypto";
import { addDays } from "date-fns";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  contacts,
  magicTokens,
  portalViews,
  portals,
  type Contact,
  type Portal,
} from "@/db/schema";
import { env } from "@/lib/env";

/** How long an invitation link stays usable. */
export const TOKEN_TTL_DAYS = 14;
/** How long the scoped portal session lasts before another magic link is needed. */
export const PORTAL_SESSION_DAYS = 60;

export class MagicLinkError extends Error {}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.authSecret);
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** One cookie per portal: a session is access to a single portal, by construction. */
export function portalCookieName(portalId: string): string {
  return `cd_portal_${portalId}`;
}

export interface PortalSession {
  portalId: string;
  contactId: string;
}

/* ------------------------------------------------------------ minting --- */

/**
 * Mint an invitation link for one contact on one portal.
 *
 * The caller is responsible for having established that the portal belongs to the
 * agency doing the inviting — `inviteContact` in src/lib/portals.ts is the only
 * intended caller and does exactly that. The contact is re-checked here against
 * the portal's own client, so a mismatched pair can never produce a token even if
 * a future caller forgets.
 */
export async function createMagicToken(input: {
  portalId: string;
  contactId: string;
  ttlDays?: number;
}): Promise<{ token: string; tokenId: string; expiresAt: Date }> {
  const db = getDb();
  const [portal] = await db.select().from(portals).where(eq(portals.id, input.portalId));
  if (!portal) throw new MagicLinkError("That portal no longer exists");
  if (portal.isTemplate) throw new MagicLinkError("Templates have no clients to invite");

  const [contact] = await db.select().from(contacts).where(eq(contacts.id, input.contactId));
  if (!contact) throw new MagicLinkError("That contact no longer exists");
  if (!portal.clientId || contact.clientId !== portal.clientId) {
    throw new MagicLinkError("That contact belongs to a different client");
  }

  const raw = randomBytes(32).toString("base64url");
  const expiresAt = addDays(new Date(), input.ttlDays ?? TOKEN_TTL_DAYS);
  const [row] = await db
    .insert(magicTokens)
    .values({
      portalId: portal.id,
      contactId: contact.id,
      tokenHash: hashToken(raw),
      expiresAt,
    })
    .returning({ id: magicTokens.id });
  return { token: raw, tokenId: row.id, expiresAt };
}

export function magicLinkUrl(base: string, token: string): string {
  return `${base.replace(/\/+$/, "")}/portal/${token}`;
}

/* ---------------------------------------------------------- consuming --- */

export interface ConsumedToken {
  portal: Portal;
  contact: Contact;
}

/**
 * Redeem a token and open a scoped session. Single use: the row is stamped
 * `used_at` in the same statement that claims it, so two simultaneous clicks
 * cannot both succeed.
 */
export async function consumeMagicToken(raw: string): Promise<ConsumedToken> {
  const db = getDb();
  const now = new Date();
  const claimed = await db
    .update(magicTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(magicTokens.tokenHash, hashToken(raw)),
        isNull(magicTokens.usedAt),
        isNull(magicTokens.revokedAt),
        gt(magicTokens.expiresAt, now),
      ),
    )
    .returning();

  const token = claimed[0];
  if (!token) {
    throw new MagicLinkError("That link has expired or has already been used");
  }

  const [portal] = await db.select().from(portals).where(eq(portals.id, token.portalId));
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, token.contactId));
  if (!portal || !contact) throw new MagicLinkError("That portal is no longer available");
  if (portal.status === "archived") throw new MagicLinkError("That portal has been closed");

  await setPortalSession({ portalId: portal.id, contactId: contact.id });
  return { portal, contact };
}

export async function setPortalSession(session: PortalSession): Promise<void> {
  const maxAge = PORTAL_SESSION_DAYS * 86_400;
  const jwt = await new SignJWT({ ...session, scope: "portal" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(secretKey());
  const jar = await cookies();
  jar.set(portalCookieName(session.portalId), jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

/**
 * The signed identity for one portal, or null.
 *
 * `portalId` is passed in (resolved from the slug) and compared against the
 * claim; the value returned is the one from the *token*. A caller that ignores
 * the argument and trusts the return value is still safe.
 */
export async function getPortalSession(portalId: string): Promise<PortalSession | null> {
  const jar = await cookies();
  const raw = jar.get(portalCookieName(portalId))?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, secretKey());
    if (payload.scope !== "portal") return null;
    if (payload.portalId !== portalId) return null;
    return { portalId: payload.portalId as string, contactId: payload.contactId as string };
  } catch {
    return null;
  }
}

export async function clearPortalSession(portalId: string): Promise<void> {
  const jar = await cookies();
  jar.delete(portalCookieName(portalId));
}

/* ----------------------------------------------------------- lifecycle --- */

/** Revoke every unused token for a contact — used when access is withdrawn. */
export async function revokeTokensForContact(portalId: string, contactId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .update(magicTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(magicTokens.portalId, portalId),
        eq(magicTokens.contactId, contactId),
        isNull(magicTokens.usedAt),
        isNull(magicTokens.revokedAt),
      ),
    )
    .returning({ id: magicTokens.id });
  return rows.length;
}

export async function latestTokenFor(portalId: string, contactId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(magicTokens)
    .where(and(eq(magicTokens.portalId, portalId), eq(magicTokens.contactId, contactId)))
    .orderBy(desc(magicTokens.createdAt))
    .limit(1);
  return row ?? null;
}

/* ------------------------------------------------------------ analytics --- */

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Log a portal view. Every client view is counted so the agency can prove
 * adoption ("Meridian viewed the portal 4x this week") — ARCHITECTURE.md flow 1.
 * Never called for the agency's own view-as preview: that would be the agency
 * measuring itself.
 */
export async function logPortalView(session: PortalSession): Promise<void> {
  const db = getDb();
  const day = startOfUtcDay(new Date());
  await db
    .insert(portalViews)
    .values({ portalId: session.portalId, contactId: session.contactId, day, views: 1 })
    .onConflictDoUpdate({
      target: [portalViews.portalId, portalViews.contactId, portalViews.day],
      set: { views: sql`${portalViews.views} + 1` },
    });
  await db
    .update(portals)
    .set({ lastViewedAt: new Date() })
    .where(eq(portals.id, session.portalId));
}
