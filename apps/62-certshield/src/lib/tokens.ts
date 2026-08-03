/**
 * src/lib/tokens.ts
 *
 * Vendor upload links.
 *
 * A vendor never has an account: the link *is* the credential. So it is treated
 * like one — 32 random bytes, base64url, and only its HMAC lands in the database.
 * A stolen database dump therefore cannot be replayed into a compliance file, and
 * the HMAC key (`LINK_TOKEN_SECRET`) is separate from the session secret so
 * rotating one does not log everyone out.
 *
 * The link does not expire. That is a product decision, not an oversight: an
 * agent's assistant will send it to the wrong person, forward it to the carrier,
 * and dig it out of a nine-month-old email — and every one of those should end with
 * the certificate landing. The link can only ever *add* evidence for one vendor;
 * it reads nothing else and changes nothing else. Rotating it is one click on the
 * vendor page.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { vendors, type Vendor } from "@/db/schema";
import { env } from "@/lib/env";

export function generateUploadToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashUploadToken(token: string, secret = env.linkTokenSecret): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

export function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function uploadUrl(token: string, appUrl = env.appUrl): string {
  return `${appUrl}/v/${token}`;
}

/** Mint (or re-mint) a vendor's link, returning the raw token exactly once. */
export async function issueUploadToken(vendorId: string): Promise<string> {
  const token = generateUploadToken();
  const db = getDb();
  await db
    .update(vendors)
    .set({ uploadTokenHash: hashUploadToken(token), updatedAt: new Date() })
    .where(eq(vendors.id, vendorId));
  return token;
}

/** Resolve a raw token to its vendor, or null. Inactive vendors still resolve —
 *  a late certificate for a paused vendor is still evidence worth keeping. */
export async function vendorForToken(token: string): Promise<Vendor | null> {
  if (!token || token.length < 16) return null;
  const db = getDb();
  const hash = hashUploadToken(token);
  const [vendor] = await db.select().from(vendors).where(eq(vendors.uploadTokenHash, hash));
  return vendor ?? null;
}
