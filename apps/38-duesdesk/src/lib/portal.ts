/**
 * Member portal tokens — the "grandma pays her dues without a password" path.
 *
 * Three token kinds, all jose-signed with PORTAL_TOKEN_SECRET (deliberately a
 * different secret from the board session cookie, because portal links sit in
 * inboxes forever):
 *
 *  - **portal** (90 days, rolling): identifies a member. Read balance, pay once,
 *    file a request, read their own issue timelines. Revocable: only a token
 *    carrying the jti stored on `members.portal_token_id` is accepted, so
 *    rotating that value retires every link at once and "revoke" is one UPDATE.
 *
 *    Minting **reuses** the stored jti unless the caller asks to rotate. That
 *    matters: every invoice and reminder email carries a link, and if each send
 *    rotated the id, the link in an email from three days ago would report
 *    "replaced" to a member who never asked for a new one. The board rotating a
 *    link is a deliberate act; a reminder going out is not.
 *  - **stepup** (15 minutes, single purpose): proves inbox control. Required
 *    before a payment method may be stored against the household — a forwarded
 *    portal link must never be enough to attach a bank account.
 *  - The step-up token is *not* a login: it carries the member id and nothing
 *    else, and it is verified fresh on the action that consumes it.
 */

import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { households, members, type Household, type Member } from "@/db/schema";
import { env } from "@/lib/env";

const PORTAL_TTL_DAYS = 90;
const STEPUP_TTL_MINUTES = 15;

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.portalTokenSecret);
}

export interface PortalClaims {
  memberId: string;
  householdId: string;
  associationId: string;
  jti: string;
}

/**
 * Mint a member's portal link.
 *
 * By default this reuses the member's existing token id, so links already in
 * their inbox keep working. Pass `rotate` when the board explicitly reissues, and
 * every earlier link stops working immediately.
 */
export async function mintPortalToken(
  memberId: string,
  options: { rotate?: boolean } = {},
): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ member: members, household: households })
    .from(members)
    .innerJoin(households, eq(members.householdId, households.id))
    .where(eq(members.id, memberId));
  if (!row) throw new Error("No such member");

  const reuse = !options.rotate && row.member.portalTokenId;
  const jti = reuse ? row.member.portalTokenId! : randomBytes(16).toString("hex");
  const token = await new SignJWT({
    memberId,
    householdId: row.household.id,
    associationId: row.household.associationId,
    kind: "portal",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${PORTAL_TTL_DAYS}d`)
    .sign(secretKey());

  if (!reuse) {
    await db
      .update(members)
      .set({ portalTokenId: jti, portalTokenIssuedAt: new Date() })
      .where(eq(members.id, memberId));
  }

  return token;
}

export function portalUrl(token: string): string {
  return `${env.appUrl}/pay/${token}`;
}

export async function revokePortalToken(memberId: string): Promise<void> {
  await getDb()
    .update(members)
    .set({ portalTokenId: null, portalTokenIssuedAt: null })
    .where(eq(members.id, memberId));
}

export type PortalFailure = "invalid" | "expired" | "revoked";

export interface PortalSession {
  member: Member;
  household: Household;
}

/**
 * Verify a portal token against both the signature and the stored token id.
 * Returns a discriminated result — an expired link must reach a screen that
 * offers a new one, never a dead end.
 */
export async function verifyPortalToken(
  token: string,
): Promise<{ ok: true; session: PortalSession } | { ok: false; reason: PortalFailure }> {
  let claims: PortalClaims;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.kind !== "portal" || !payload.jti) return { ok: false, reason: "invalid" };
    claims = {
      memberId: payload.memberId as string,
      householdId: payload.householdId as string,
      associationId: payload.associationId as string,
      jti: payload.jti,
    };
  } catch (err) {
    const code = (err as { code?: string }).code;
    return { ok: false, reason: code === "ERR_JWT_EXPIRED" ? "expired" : "invalid" };
  }

  const db = getDb();
  const [row] = await db
    .select({ member: members, household: households })
    .from(members)
    .innerJoin(households, eq(members.householdId, households.id))
    .where(and(eq(members.id, claims.memberId), eq(households.id, claims.householdId)));
  if (!row) return { ok: false, reason: "invalid" };
  if (!row.member.portalTokenId) return { ok: false, reason: "revoked" };
  if (row.member.portalTokenId !== claims.jti) return { ok: false, reason: "revoked" };

  return { ok: true, session: { member: row.member, household: row.household } };
}

/* ------------------------------------------------------------- step-up --- */

/** Mint the short-lived token emailed to the member before storing a card/bank. */
export async function mintStepUpToken(memberId: string): Promise<string> {
  return new SignJWT({ memberId, kind: "stepup" })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(randomBytes(12).toString("hex"))
    .setIssuedAt()
    .setExpirationTime(`${STEPUP_TTL_MINUTES}m`)
    .sign(secretKey());
}

/**
 * Verify a step-up token for exactly one member. Returns false for a token
 * minted for somebody else, a portal token used in its place, or an expired one.
 */
export async function verifyStepUpToken(token: string, memberId: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload.kind === "stepup" && payload.memberId === memberId;
  } catch {
    return false;
  }
}

export function stepUpUrl(portalToken: string, stepUpToken: string): string {
  return `${env.appUrl}/pay/${portalToken}/autopay?step=${encodeURIComponent(stepUpToken)}`;
}

export const PORTAL_TTL_DAYS_EXPORT = PORTAL_TTL_DAYS;
export const STEPUP_TTL_MINUTES_EXPORT = STEPUP_TTL_MINUTES;
