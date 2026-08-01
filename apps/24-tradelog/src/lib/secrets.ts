/**
 * Encryption for stored broker credentials.
 *
 * An IBKR Flex token is read-only, but it reads a customer's entire trading
 * history — treat it like a password. AES-256-GCM with a random IV per value and
 * the tag stored alongside, keyed by SYNC_CREDS_ENCRYPTION_KEY (32 bytes of hex).
 * Encryption is refused outright when the key is missing rather than falling back
 * to plaintext.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";

function key(): Buffer {
  const hex = env.syncCredsKey;
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    throw new Error("SYNC_CREDS_ENCRYPTION_KEY must be 32 bytes of hex (openssl rand -hex 32)");
  }
  return buf;
}

/** "iv:tag:ciphertext", all base64url. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString("base64url")).join(":");
}

export function decryptSecret(stored: string): string {
  const [ivPart, tagPart, dataPart] = stored.split(":");
  if (!ivPart || !tagPart || !dataPart) throw new Error("Stored secret is malformed");
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Show a credential without showing it: "…8f21". */
export function maskSecret(plaintext: string): string {
  return plaintext.length <= 4 ? "••••" : `…${plaintext.slice(-4)}`;
}
