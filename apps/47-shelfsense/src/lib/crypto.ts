/**
 * At-rest encryption for Shopify offline access tokens, plus constant-time
 * comparison.
 *
 * A stolen Shopify token reads a merchant's entire order history and inventory,
 * so it never sits in the database in plaintext. The key is derived from
 * AUTH_SECRET, which means rotating AUTH_SECRET invalidates stored tokens and
 * merchants reinstall — the safe failure direction.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { env } from "@/lib/env";

function encryptionKey(): Buffer {
  // Fixed salt: the key must be derivable from AUTH_SECRET alone, and the secret
  // already carries the entropy.
  return scryptSync(env.authSecret, "shelfsense-token-v1", 32);
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

/** Constant-time comparison of two digests of any length. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
