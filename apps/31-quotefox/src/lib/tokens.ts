/**
 * Signed proposal-link tokens.
 *
 * A homeowner never logs in: the `/p/<token>` URL in the email is the credential.
 * That is a deliberate trade — asking someone to create an account before they can
 * read a bid is how a bid loses to the contractor who just sent a PDF — and it is
 * made safe by keeping the token narrow and revocable:
 *
 *  - the payload holds only the proposal id and a `jti`; no names, no addresses, no
 *    amounts, so a link in a forwarded email leaks nothing on its own;
 *  - the `jti` is stored on the proposal row, so re-sending mints a new one and the
 *    old URL stops working (rotate-on-resend), and withdrawing kills it outright;
 *  - 30-day expiry, matching the proposal's own validity.
 */

import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { proposals, type Proposal } from "@/db/schema";
import { env } from "@/lib/env";

export const PROPOSAL_TTL_DAYS = 30;

export interface ProposalTokenPayload {
  proposalId: string;
  jti: string;
}

export type TokenVerification =
  | { ok: true; payload: ProposalTokenPayload; proposal: Proposal }
  | { ok: false; reason: "expired" | "invalid" | "revoked" | "withdrawn" };

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.proposalTokenSecret);
}

export function newTokenId(): string {
  return randomBytes(16).toString("hex");
}

/** Mint a link for a proposal. The jti must already be on the row. */
export async function mintProposalToken(proposalId: string, jti: string): Promise<string> {
  return new SignJWT({ proposalId })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${PROPOSAL_TTL_DAYS}d`)
    .sign(secretKey());
}

/**
 * Verify a link and load its proposal. Never throws: the page renders a friendly
 * state for every failure, because the person holding a bad link is a customer.
 */
export async function verifyProposalToken(token: string): Promise<TokenVerification> {
  let proposalId: string;
  let jti: string;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    proposalId = String(payload.proposalId ?? "");
    jti = String(payload.jti ?? "");
    if (!proposalId || !jti) return { ok: false, reason: "invalid" };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    return { ok: false, reason: code === "ERR_JWT_EXPIRED" ? "expired" : "invalid" };
  }

  const db = getDb();
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId));
  if (!proposal) return { ok: false, reason: "invalid" };
  // A rotated jti means this is an older link for the same proposal.
  if (proposal.tokenId !== jti) return { ok: false, reason: "revoked" };
  if (proposal.status === "withdrawn") return { ok: false, reason: "withdrawn" };
  if (proposal.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, payload: { proposalId, jti }, proposal };
}

export function proposalUrl(token: string): string {
  return `${env.appUrl}/p/${token}`;
}
