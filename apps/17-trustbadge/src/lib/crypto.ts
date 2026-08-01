/**
 * Small crypto helpers: opaque public/secret tokens, and at-rest encryption for
 * Shopify offline access tokens.
 *
 * A stolen Shopify access token reads a merchant's whole order history, so it
 * never sits in the database in plaintext. The key is derived from AUTH_SECRET,
 * which means rotating AUTH_SECRET invalidates stored tokens — merchants
 * reinstall, which is the safe failure direction.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { env } from "@/lib/env";

/** Crockford-ish base32 alphabet: no vowels, no look-alikes, safe to read aloud. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** The widget's public store key: `pk_` + 24 url-safe chars. */
export function newPublicKey(): string {
  return `pk_${randomBytes(18).toString("base64url")}`;
}

/** A review-request submission token: unguessable, single-purpose. */
export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/** A human-readable discount code, e.g. `THANKS-7QK4M2`. */
export function newDiscountCode(prefix: string, length = 6): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  const clean = prefix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "THANKS";
  return `${clean}-${out}`;
}

/** Stable hash used to dedupe imported reviews. */
export function dedupeHash(parts: (string | null | undefined)[]): string {
  return createHash("sha256")
    .update(parts.map((p) => (p ?? "").trim().toLowerCase()).join("|"))
    .digest("hex")
    .slice(0, 32);
}

/** Constant-time comparison of two hex/base64 digests of any length. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function hmacSha256Base64(secret: string, payload: string | Buffer): string {
  return createHmac("sha256", secret).update(payload).digest("base64");
}

export function hmacSha256Hex(secret: string, payload: string | Buffer): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/* ------------------------------------------------------ at-rest encryption --- */

function encryptionKey(): Buffer {
  // Fixed salt: the key must be derivable from AUTH_SECRET alone, and the secret
  // already carries the entropy.
  return scryptSync(env.authSecret, "trustbadge-token-v1", 32);
}

/** AES-256-GCM, returned as `v1.<iv>.<tag>.<ciphertext>` in base64url. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ct.toString("base64url"),
  ].join(".");
}

/** Returns null for anything that does not decrypt — never throws at a caller. */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const [version, ivB64, tagB64, ctB64] = stored.split(".");
  if (version !== "v1" || !ivB64 || !tagB64 || !ctB64) return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivB64, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
