/**
 * Field encryption for the two columns that describe a child's health and the
 * adults who may collect them: `players.medical_notes_enc` and
 * `players.emergency_contacts_enc`.
 *
 * AES-256-GCM with a random 12-byte nonce per write, stored as
 * `v1.<nonce>.<tag>.<ciphertext>` in base64url. GCM rather than CBC because we
 * want tampering to fail loudly, and a per-row nonce because two children with
 * the same allergy must not produce the same ciphertext.
 *
 * This is not a substitute for access control — a database read is not the threat
 * model that matters most here, a mis-scoped query is (see lib/rosters.ts, where
 * coach-scoped reads never select these columns at all). It is the layer that
 * makes a leaked backup or a support engineer's `select *` useless.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

function key(): Buffer {
  const raw = env.medicalFieldKey;
  // Accept a base64 32-byte key directly; hash anything else to 32 bytes so a
  // developer's passphrase in .env.local still works rather than crashing.
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) return decoded;
  return createHash("sha256").update(raw).digest();
}

export function encryptField(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined) return null;
  const trimmed = plaintext.trim();
  if (!trimmed) return null;
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), nonce);
  const enc = Buffer.concat([cipher.update(trimmed, "utf8"), cipher.final()]);
  return [
    "v1",
    nonce.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    enc.toString("base64url"),
  ].join(".");
}

/**
 * Decrypt, or return null when the value cannot be trusted. A medical note that
 * fails its auth tag must read as "no note on file" and be visibly missing, not
 * as a confident wrong answer.
 */
export function decryptField(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(parts[1], "base64url"),
    );
    decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[3], "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

export function encryptContacts(contacts: readonly EmergencyContact[]): string | null {
  const clean = contacts.filter((c) => c.name.trim() && c.phone.trim());
  if (clean.length === 0) return null;
  return encryptField(JSON.stringify(clean));
}

export function decryptContacts(stored: string | null | undefined): EmergencyContact[] {
  const raw = decryptField(stored);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as EmergencyContact[]) : [];
  } catch {
    return [];
  }
}
