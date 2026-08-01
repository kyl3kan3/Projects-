/**
 * Signed-token access for the no-login sub portal.
 *
 * The contract the rest of the portal depends on:
 *
 *  1. A portal link carries a **jose-signed JWT** whose only claims are the
 *     invitation id, the package id, and a generation counter. It is signed with
 *     `PORTAL_TOKEN_SECRET`, which is separate from `AUTH_SECRET`: rotating that key
 *     invalidates every outstanding bid link without logging out a single estimator.
 *  2. The database stores only **SHA-256 of the token**. A database dump is not a set
 *     of live bid links, and a token cannot be reconstructed from a row.
 *  3. Verification requires *both* a valid signature **and** a row whose `token_hash`
 *     matches **and** whose id equals the `inv` claim. Even with the signing key, a
 *     forged token has no matching hash and is rejected.
 *  4. **The token is deterministic** for a given (invitation, generation). This is
 *     deliberate and was learned the hard way: a sub keeps the *first* email. If a
 *     reminder or a re-invite minted a fresh random token, the link in that first
 *     email would silently stop working — which is the one failure that would end the
 *     product, because the sub's next move is to give up and email a PDF. Every
 *     re-mint therefore reproduces the same token, and the only thing that changes it
 *     is an explicit rotation.
 *  5. **Expiry lives in the database**, not in an `exp` claim, for the same reason:
 *     extending the bid date has to extend the link the sub already has, and baking
 *     the deadline into the signature would break it instead. `token_expires_at` is
 *     checked on every verify, and there is no code path that accepts a token without
 *     reading that row.
 *  6. Revocation is a column, checked on every request — a revoked link dies
 *     immediately, without waiting for expiry.
 *
 * The ids this returns are read out of the **invitation row**, never out of the URL
 * and never out of the token payload alone. That is the whole basis of bid
 * confidentiality: see src/lib/portal.ts, the only consumer.
 */

import { SignJWT, jwtVerify } from "jose";
import { createHash } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { invitations, tradePackages, type Invitation } from "@/db/schema";
import { env } from "@/lib/env";
import { TOKEN_GRACE_DAYS } from "@/lib/schedule";

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.portalTokenSecret);
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export interface PortalScope {
  invitationId: string;
  tradePackageId: string;
  companyId: string;
  subCompanyId: string;
  subContactId: string;
  invitation: Invitation;
}

export type TokenRejection = "invalid" | "expired" | "revoked" | "unknown";

export type TokenResult =
  | { ok: true; scope: PortalScope }
  | { ok: false; reason: TokenRejection };

/** Expiry for a link on a package due at `bidDueAt`. */
export function tokenExpiryFor(bidDueAt: Date): Date {
  return new Date(bidDueAt.getTime() + TOKEN_GRACE_DAYS * 86_400_000);
}

/**
 * Mint the link for one invitation at a given generation.
 *
 * Deterministic: same inputs, same token, same hash. Callers that re-mint (reminder
 * emails, Q&A broadcasts, a second press of Send) get the link the sub already has.
 */
export async function mintPortalToken(input: {
  invitationId: string;
  tradePackageId: string;
  generation?: number;
}): Promise<{ token: string; tokenHash: string }> {
  const token = await new SignJWT({
    inv: input.invitationId,
    pkg: input.tradePackageId,
    gen: input.generation ?? 0,
  })
    .setProtectedHeader({ alg: "HS256" })
    .sign(secretKey());
  return { token, tokenHash: hashToken(token) };
}

/** The link for an invitation row as it currently stands. */
export async function tokenForInvitation(invitation: Invitation): Promise<string> {
  const { token } = await mintPortalToken({
    invitationId: invitation.id,
    tradePackageId: invitation.tradePackageId,
    generation: invitation.tokenGeneration,
  });
  return token;
}

export function portalUrl(token: string): string {
  return `${env.appUrl}/bid/${token}`;
}

/**
 * Verify a token and return the invitation scope.
 *
 * Every id in the returned scope comes from the invitation **row**. A caller that
 * ignores the token payload entirely is still correct — which is the point.
 */
export async function verifyPortalToken(raw: string): Promise<TokenResult> {
  if (!raw || raw.length > 4096) return { ok: false, reason: "invalid" };

  let invitationId: string;
  try {
    const { payload } = await jwtVerify(raw, secretKey());
    if (typeof payload.inv !== "string") return { ok: false, reason: "invalid" };
    invitationId = payload.inv;
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const db = getDb();
  // Both conditions, always: the signature said which invitation, and the stored hash
  // has to agree. Neither alone is enough — this is what stops a token forged with a
  // leaked signing key, and what makes rotation instant.
  const [invitation] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, invitationId), eq(invitations.tokenHash, hashToken(raw))));

  if (!invitation) return { ok: false, reason: "unknown" };
  if (invitation.revokedAt) return { ok: false, reason: "revoked" };
  if (invitation.tokenExpiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };

  return {
    ok: true,
    scope: {
      invitationId: invitation.id,
      tradePackageId: invitation.tradePackageId,
      companyId: invitation.companyId,
      subCompanyId: invitation.subCompanyId,
      subContactId: invitation.subContactId,
      invitation,
    },
  };
}

/**
 * Issue a genuinely new link and kill the old one, by bumping the generation. Used by
 * "copy a fresh link" — the case where a GC has decided the previous link should stop
 * working (forwarded to the wrong company, say).
 */
export async function rotatePortalToken(
  invitationId: string,
  companyId: string,
  expiresAt?: Date,
): Promise<string | null> {
  const db = getDb();
  const [invitation] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, invitationId), eq(invitations.companyId, companyId)));
  if (!invitation) return null;

  const generation = invitation.tokenGeneration + 1;
  const minted = await mintPortalToken({
    invitationId: invitation.id,
    tradePackageId: invitation.tradePackageId,
    generation,
  });
  await db
    .update(invitations)
    .set({
      tokenHash: minted.tokenHash,
      tokenGeneration: generation,
      tokenExpiresAt: expiresAt ?? invitation.tokenExpiresAt,
      revokedAt: null,
    })
    .where(eq(invitations.id, invitation.id));
  return minted.token;
}

/** Kill a link now. Company-scoped: an id alone is never enough. */
export async function revokePortalToken(invitationId: string, companyId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(invitations.id, invitationId),
        eq(invitations.companyId, companyId),
        isNull(invitations.revokedAt),
      ),
    )
    .returning({ id: invitations.id });
  return rows.length > 0;
}

/**
 * Move every outstanding link on a project to a new deadline.
 *
 * Called when the bid date changes. Because expiry is a column rather than a claim,
 * the link already sitting in each sub's inbox keeps working and simply lasts longer
 * (or less long) — nobody has to be re-emailed, and nobody is locked out by an
 * extension that was meant to help them.
 */
export async function retimeProjectTokens(
  companyId: string,
  projectId: string,
  bidDueAt: Date,
): Promise<number> {
  const db = getDb();
  const pkgs = await db
    .select({ id: tradePackages.id })
    .from(tradePackages)
    .where(and(eq(tradePackages.companyId, companyId), eq(tradePackages.projectId, projectId)));
  if (pkgs.length === 0) return 0;

  const rows = await db
    .update(invitations)
    .set({ tokenExpiresAt: tokenExpiryFor(bidDueAt) })
    .where(
      and(
        eq(invitations.companyId, companyId),
        inArray(
          invitations.tradePackageId,
          pkgs.map((p) => p.id),
        ),
      ),
    )
    .returning({ id: invitations.id });
  return rows.length;
}

export const TOKEN_REJECTION_COPY: Record<TokenRejection, string> = {
  expired: "This bid link has expired. Ask the general contractor for a fresh link.",
  revoked: "This bid link has been withdrawn. Contact the general contractor.",
  unknown: "This bid link is no longer valid. Ask the general contractor for a fresh link.",
  invalid: "This bid link is not valid. Check that you copied the whole link.",
};
