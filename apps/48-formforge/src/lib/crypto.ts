/**
 * src/lib/crypto.ts
 *
 * Field-level PHI encryption: AES-256-GCM under a per-practice data key (DEK),
 * with the DEK itself stored only in wrapped form on `practices.dek_wrapped`.
 *
 * The hierarchy is one level deep and deliberately boring:
 *
 *   FIELD_ENCRYPTION_MASTER_KEY  (env / KMS)
 *        wraps ->  practice DEK  (32 random bytes, one per practice)
 *                    encrypts ->  answers, patient identifiers, signatures,
 *                                 upload filenames and file bytes
 *
 * A plaintext DEK exists only in process memory. What persists is the wrapped
 * copy, so a database dump yields nothing readable, and one practice's DEK opens
 * exactly one practice's records — cross-tenant decryption fails at the cipher,
 * not at a WHERE clause.
 *
 * `wrapDek`/`unwrapDek` are the entire KMS seam: swapping the env master key for
 * AWS KMS GenerateDataKey/Decrypt replaces those two functions and nothing else.
 *
 * Envelope layout, all of it:  "FF1" | version(1) | IV(12) | body | GCM tag(16)
 *
 * Nothing here logs plaintext, keys, or IVs, and every failure path collapses to
 * one message — a padding/tag oracle is not a debugging aid.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const MAGIC = Buffer.from("FF1");
const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const HEADER = MAGIC.length + 1 + IV_BYTES;

export class CryptoError extends Error {}

function keyFromHex(hex: string, label: string): Buffer {
  const cleaned = hex.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(cleaned)) {
    throw new CryptoError(
      `${label} must be 64 hex characters (32 bytes). Generate one with: openssl rand -hex 32`,
    );
  }
  return Buffer.from(cleaned, "hex");
}

/* --------------------------------------------------------- raw envelopes --- */

export function seal(plaintext: Buffer, key: Buffer): Buffer {
  if (key.length !== KEY_BYTES) throw new CryptoError("A data key must be 32 bytes");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([MAGIC, Buffer.from([VERSION]), iv, body, cipher.getAuthTag()]);
}

export function open(sealed: Buffer, key: Buffer): Buffer {
  if (key.length !== KEY_BYTES) throw new CryptoError("A data key must be 32 bytes");
  if (sealed.length < HEADER + TAG_BYTES) {
    throw new CryptoError("Ciphertext is too short to be a FormForge envelope");
  }
  if (!timingSafeEqual(sealed.subarray(0, MAGIC.length), MAGIC)) {
    throw new CryptoError("Not a FormForge envelope");
  }
  if (sealed[MAGIC.length] !== VERSION) {
    throw new CryptoError(`Unsupported envelope version ${sealed[MAGIC.length]}`);
  }
  const iv = sealed.subarray(MAGIC.length + 1, HEADER);
  const tag = sealed.subarray(sealed.length - TAG_BYTES);
  const body = sealed.subarray(HEADER, sealed.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    // GCM authentication failed: the bytes were altered, or the key is wrong.
    // One message for both, deliberately.
    throw new CryptoError("Authentication failed: ciphertext or key is wrong");
  }
}

/* ---------------------------------------------------------- practice DEKs --- */

export interface WrappedDek {
  /** Safe to persist. */
  wrapped: Buffer;
  /** Which master key wrapped it, so rotation knows which rows it can read. */
  keyId: string;
  /** Held in memory only. */
  plaintext: Buffer;
}

/** A short, stable fingerprint of a master key — never the key itself. */
export function masterKeyId(masterKeyHex: string): string {
  const key = keyFromHex(masterKeyHex, "FIELD_ENCRYPTION_MASTER_KEY");
  return `ff1:${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
}

/** Mint a fresh 32-byte DEK for a new practice and wrap it for storage. */
export function generatePracticeDek(masterKeyHex: string): WrappedDek {
  const master = keyFromHex(masterKeyHex, "FIELD_ENCRYPTION_MASTER_KEY");
  const plaintext = randomBytes(KEY_BYTES);
  return { plaintext, wrapped: seal(plaintext, master), keyId: masterKeyId(masterKeyHex) };
}

export function unwrapDek(wrapped: Buffer, masterKeyHex: string): Buffer {
  const master = keyFromHex(masterKeyHex, "FIELD_ENCRYPTION_MASTER_KEY");
  const dek = open(wrapped, master);
  if (dek.length !== KEY_BYTES) throw new CryptoError("Unwrapped data key has the wrong length");
  return dek;
}

/**
 * Key-rotation runbook helper: re-wrap an existing DEK under a new master key.
 * Every ciphertext stays valid because the DEK does not change — which is the
 * point of a two-level hierarchy.
 */
export function rewrapDek(
  wrapped: Buffer,
  oldMasterKeyHex: string,
  newMasterKeyHex: string,
): { wrapped: Buffer; keyId: string } {
  const dek = unwrapDek(wrapped, oldMasterKeyHex);
  const newMaster = keyFromHex(newMasterKeyHex, "FIELD_ENCRYPTION_MASTER_KEY");
  return { wrapped: seal(dek, newMaster), keyId: masterKeyId(newMasterKeyHex) };
}

/* ------------------------------------------------------------- PHI fields --- */

/**
 * Encrypt one field value under a practice DEK.
 *
 * Reads go through `lib/phi.ts` rather than a `decryptField` sibling here, so
 * that no read path can skip the audit event. `open()` is exported for the one
 * caller that needs raw bytes (upload download) and for the tests.
 */
export function encryptField(dek: Buffer, plaintext: string): Buffer {
  return seal(Buffer.from(plaintext, "utf8"), dek);
}

/** Encrypt file bytes (uploads) under a practice DEK. */
export function encryptBytes(dek: Buffer, bytes: Buffer): Buffer {
  return seal(bytes, dek);
}

/* ----------------------------------------------------------------- tokens --- */

/**
 * Patient link tokens: 128 bits of entropy, base64url. The raw token exists only
 * inside the emailed/texted link; the database stores its HMAC, so a stolen
 * dump cannot be replayed into a packet.
 */
export function generateIntakeToken(): string {
  return randomBytes(16).toString("base64url");
}

export function hashIntakeToken(rawToken: string, secret: string): string {
  return createHmac("sha256", secret).update(rawToken, "utf8").digest("hex");
}

/**
 * Blind index over a patient's name, so the directory can dedupe and look up
 * without decrypting every row. Keyed, so it is not a rainbow-table target, and
 * one-way, so it is not a second copy of the name.
 */
export function patientNameKey(firstName: string, lastName: string, secret: string): string {
  const normalised = `${lastName.trim().toLowerCase()}|${firstName.trim().toLowerCase()}`;
  return createHmac("sha256", secret).update(normalised, "utf8").digest("hex");
}

/* ------------------------------------------------------------------ hashes --- */

/** SHA-256 hex of a UTF-8 string. Used for document hashes and version hashes. */
export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
