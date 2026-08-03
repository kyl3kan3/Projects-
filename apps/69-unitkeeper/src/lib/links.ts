/**
 * Signed tenant links — how a storage tenant signs a lease and pays without ever
 * having an account.
 *
 * A link is a JWT signed with LINK_TOKEN_SECRET carrying the tenancy id and one
 * purpose. Purpose matters: a move-in link that could also be used to view a
 * receipt a year later is a link that never expires, and a pay link that could
 * re-sign the lease is a forged signature waiting to happen.
 *
 *  - `movein`  — read and sign the lease, save a payment method. 14 days.
 *  - `pay`     — balance, payment, receipts. A year, because it goes in every
 *                receipt email and has to keep working for the whole tenancy.
 *
 * The rule that matters: a token is a bearer credential. Every route that takes
 * one resolves the row **by** the token and uses only what that row points at —
 * never a tenancy id from the query string.
 */

import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

export type LinkPurpose = "movein" | "pay";

const TTL: Record<LinkPurpose, string> = {
  movein: "14d",
  pay: "365d",
};

function key(): Uint8Array {
  return new TextEncoder().encode(env.linkTokenSecret);
}

export async function mintTenantToken(
  tenancyId: string,
  purpose: LinkPurpose,
): Promise<string> {
  return new SignJWT({ tenancyId, purpose })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TTL[purpose])
    .sign(key());
}

export async function verifyTenantToken(
  token: string,
): Promise<{ tenancyId: string; purpose: LinkPurpose } | null> {
  try {
    const { payload } = await jwtVerify(token, key());
    const purpose = payload.purpose;
    if (purpose !== "movein" && purpose !== "pay") return null;
    const tenancyId = payload.tenancyId;
    if (typeof tenancyId !== "string" || !tenancyId) return null;
    return { tenancyId, purpose };
  } catch {
    return null;
  }
}

export function tenantLinkUrl(token: string): string {
  return `${env.appUrl}/t/${token}`;
}
