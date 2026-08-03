/**
 * src/lib/tokens.ts
 *
 * Party portal links. Parties never log in — the token IS the credential, so it
 * is treated like one:
 *
 *  - It is an HMAC-SHA256 of the party id under `LINK_TOKEN_SECRET`, base64url:
 *    43 characters, unguessable without the secret, and *re-derivable server
 *    side*. That last property is what lets a reminder email carry the party's
 *    own link weeks after it was first created.
 *  - Only SHA-256 of the token is stored (`parties.portal_token_hash`), so a
 *    database dump alone does not hand someone a working link into every
 *    transaction on file — the secret is needed too.
 *  - Lookup is by that hash, which is a unique index: one query, no scan.
 *  - Revoking clears the column and the link stops resolving immediately.
 *
 * The documented tradeoff: because the token is derived rather than random,
 * re-issuing a revoked party's link produces the same address again. The
 * coordinator is told this in the UI. Making every link on the deployment
 * unusable means rotating `LINK_TOKEN_SECRET`, which is the intended blunt
 * instrument.
 */

import { createHash, createHmac } from "node:crypto";
import { env } from "@/lib/env";

/** The party's link token. Same input, same token — by design. */
export function derivePartyToken(partyId: string): string {
  return createHmac("sha256", env.linkTokenSecret).update(`party:${partyId}`).digest("base64url");
}

export function hashPartyToken(token: string): string {
  return createHash("sha256").update(`${env.linkTokenSecret}:${token}`).digest("hex");
}

/** What goes in the column when a party's portal is switched on. */
export function partyTokenHash(partyId: string): string {
  return hashPartyToken(derivePartyToken(partyId));
}

/** base64url of 32 bytes: 43 characters, no padding. */
export function looksLikeToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function portalUrl(token: string): string {
  return `${env.appUrl}/p/${token}`;
}

export function portalUrlForParty(partyId: string): string {
  return portalUrl(derivePartyToken(partyId));
}
