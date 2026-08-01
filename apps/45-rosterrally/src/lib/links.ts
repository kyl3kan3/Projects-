/**
 * Household links — the "parents never download an app" path.
 *
 * One durable signed token per family opens `/p/<token>`: their children's
 * schedule, the messages they were sent, what they owe, and the volunteer slots
 * they can claim. No password, because a password is the thing that stops a
 * parent using software at all.
 *
 * That makes the token the entire access-control boundary for data about
 * children, so it is deliberately narrow:
 *
 *  - Signed with `LINK_TOKEN_SECRET`, which is a **different** secret from the
 *    staff session cookie. A link sits in an inbox for a whole season.
 *  - Carries a `jti` that must match `households.link_token_id`. Rotating that
 *    column retires every link the family has; nulling it revokes access.
 *  - Carries the club id as well as the household id, and both are re-checked
 *    against the database on every resolve. A token cannot be replayed against
 *    another club's household even if the ids were guessed.
 *  - Resolves to a household id and nothing else. Every query that follows is
 *    scoped by that id — there is no code path on the parent surface that takes
 *    a household id from a URL or a form.
 */

import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { households, type Household } from "@/db/schema";
import { env } from "@/lib/env";

const TTL_DAYS = 400; // a season plus the shoulder either side of it

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.linkTokenSecret);
}

export interface LinkClaims {
  householdId: string;
  clubId: string;
  jti: string;
}

/**
 * Mint a family's link.
 *
 * Reuses the stored token id by default, so the link in a message from three
 * weeks ago keeps working. Every announcement carries a link; if each send
 * rotated the id, the previous email would break for a parent who never asked
 * for a new one. `rotate` is the deliberate act of revoking the old ones.
 */
export async function mintHouseholdToken(
  householdId: string,
  options: { rotate?: boolean } = {},
): Promise<string> {
  const db = getDb();
  const [row] = await db.select().from(households).where(eq(households.id, householdId));
  if (!row) throw new Error("No such household");

  const reuse = !options.rotate && row.linkTokenId;
  const jti = reuse ? row.linkTokenId! : randomBytes(16).toString("hex");
  const token = await new SignJWT({ householdId, clubId: row.clubId, kind: "household" })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${TTL_DAYS}d`)
    .sign(secretKey());

  if (!reuse) {
    await db.update(households).set({ linkTokenId: jti }).where(eq(households.id, householdId));
  }
  return token;
}

export function householdUrl(token: string): string {
  return `${env.appUrl}/p/${token}`;
}

export async function revokeHouseholdToken(householdId: string): Promise<void> {
  await getDb().update(households).set({ linkTokenId: null }).where(eq(households.id, householdId));
}

export type LinkFailure = "invalid" | "expired" | "revoked";

/**
 * Verify a household token against its signature, its stored id, and the club it
 * claims. Returns a discriminated result — an expired link must reach a screen
 * that offers a fresh one, never a dead end.
 */
export async function resolveHouseholdLink(
  token: string,
): Promise<{ ok: true; household: Household } | { ok: false; reason: LinkFailure }> {
  let claims: LinkClaims;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.kind !== "household" || !payload.jti) return { ok: false, reason: "invalid" };
    claims = {
      householdId: String(payload.householdId ?? ""),
      clubId: String(payload.clubId ?? ""),
      jti: payload.jti,
    };
  } catch (err) {
    const code = (err as { code?: string }).code;
    return { ok: false, reason: code === "ERR_JWT_EXPIRED" ? "expired" : "invalid" };
  }
  if (!claims.householdId || !claims.clubId) return { ok: false, reason: "invalid" };

  const [row] = await getDb()
    .select()
    .from(households)
    .where(and(eq(households.id, claims.householdId), eq(households.clubId, claims.clubId)));
  if (!row) return { ok: false, reason: "invalid" };
  if (!row.linkTokenId || row.linkTokenId !== claims.jti) return { ok: false, reason: "revoked" };
  return { ok: true, household: row };
}

/* ------------------------------------------------------------ team feeds --- */

/**
 * A calendar-feed token for one team. Separate from household tokens: a feed URL
 * ends up pasted into Google Calendar and shared around a team's parents, so it
 * must open a schedule and nothing else — no names, no contacts, no money.
 */
export async function mintTeamFeedToken(teamId: string): Promise<string> {
  return new SignJWT({ teamId, kind: "team_feed" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("400d")
    .sign(secretKey());
}

export async function resolveTeamFeedToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.kind !== "team_feed") return null;
    return String(payload.teamId ?? "") || null;
  } catch {
    return null;
  }
}
