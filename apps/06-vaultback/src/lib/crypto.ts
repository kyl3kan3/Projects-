/**
 * Envelope encryption.
 *
 * Two independent key hierarchies, on purpose (ARCHITECTURE.md risk 3):
 *
 *   snapshots     per-snapshot AES-256-GCM data key  →  wrapped by BACKUP_MASTER_KEY
 *   credentials   connection strings, bucket keys    →  encrypted with CREDENTIALS_KEY
 *
 * A plaintext data key exists only in process memory for the life of one job.
 * What persists is the wrapped copy, so compromising the database yields
 * nothing without the master key, and compromising one snapshot's data key
 * yields exactly one snapshot.
 *
 * The wrap/unwrap pair is the entire KMS seam: swapping BACKUP_MASTER_KEY for
 * AWS KMS GenerateDataKey/Decrypt replaces `generateDataKey` and `unwrapDataKey`
 * and nothing else.
 *
 * Ciphertext layout (all of it): magic "VB1" | version | 12-byte IV | payload |
 * 16-byte GCM tag. Streams write the same header, then framed chunks, so a
 * multi-gigabyte dump never needs to be resident.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
  type DecipherGCM,
} from "node:crypto";
import { Transform, type TransformCallback } from "node:stream";

const MAGIC = Buffer.from("VB1");
const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

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

/* ------------------------------------------------------------ data keys --- */

export interface DataKey {
  /** Only ever held in memory. */
  plaintext: Buffer;
  /** Safe to persist. */
  wrapped: Buffer;
  /** Which master key wrapped it, so rotation can decrypt old snapshots. */
  keyId: string;
}

/** Short, stable identifier for a master key — a fingerprint, not the key. */
export function masterKeyId(masterKeyHex: string): string {
  const key = keyFromHex(masterKeyHex, "BACKUP_MASTER_KEY");
  return `vb1:${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
}

export function generateDataKey(masterKeyHex: string): DataKey {
  const master = keyFromHex(masterKeyHex, "BACKUP_MASTER_KEY");
  const plaintext = randomBytes(KEY_BYTES);
  return {
    plaintext,
    wrapped: sealBuffer(plaintext, master),
    keyId: masterKeyId(masterKeyHex),
  };
}

export function unwrapDataKey(wrapped: Buffer, masterKeyHex: string): Buffer {
  const master = keyFromHex(masterKeyHex, "BACKUP_MASTER_KEY");
  const key = openBuffer(wrapped, master);
  if (key.length !== KEY_BYTES) throw new CryptoError("Unwrapped data key has the wrong length");
  return key;
}

/* ---------------------------------------------------------- credentials --- */

/** Encrypt a credential string for storage. Returns the whole VB1 envelope. */
export function encryptCredential(plaintext: string, keyHex: string): Buffer {
  return sealBuffer(Buffer.from(plaintext, "utf8"), keyFromHex(keyHex, "CREDENTIALS_KEY"));
}

export function decryptCredential(sealed: Buffer, keyHex: string): string {
  return openBuffer(sealed, keyFromHex(keyHex, "CREDENTIALS_KEY")).toString("utf8");
}

/* ------------------------------------------------------ buffer envelopes --- */

export function sealBuffer(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([MAGIC, Buffer.from([VERSION]), iv, body, cipher.getAuthTag()]);
}

export function openBuffer(sealed: Buffer, key: Buffer): Buffer {
  if (sealed.length < MAGIC.length + 1 + IV_BYTES + TAG_BYTES) {
    throw new CryptoError("Ciphertext is too short to be a VaultBack envelope");
  }
  if (!timingSafeEqual(sealed.subarray(0, MAGIC.length), MAGIC)) {
    throw new CryptoError("Not a VaultBack envelope");
  }
  if (sealed[MAGIC.length] !== VERSION) {
    throw new CryptoError(`Unsupported envelope version ${sealed[MAGIC.length]}`);
  }
  const ivStart = MAGIC.length + 1;
  const iv = sealed.subarray(ivStart, ivStart + IV_BYTES);
  const tag = sealed.subarray(sealed.length - TAG_BYTES);
  const body = sealed.subarray(ivStart + IV_BYTES, sealed.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    // GCM authentication failure — the bytes were altered or the key is wrong.
    throw new CryptoError("Authentication failed: ciphertext or key is wrong");
  }
}

/* --------------------------------------------------------------- streams --- */

/**
 * Streaming AES-256-GCM. Framing matters: GCM's tag only arrives at the end of
 * the stream, so the format is
 *
 *   MAGIC | VERSION | IV | [4-byte length | chunk]... | 4 zero bytes | TAG
 *
 * The zero-length frame is an explicit end-of-stream marker, which is what lets
 * the decrypting side refuse a truncated object instead of silently restoring
 * half a database.
 */
export function createEncryptStream(key: Buffer): Transform {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  let headerWritten = false;

  return new Transform({
    transform(chunk: Buffer, _enc, cb: TransformCallback) {
      if (!headerWritten) {
        this.push(Buffer.concat([MAGIC, Buffer.from([VERSION]), iv]));
        headerWritten = true;
      }
      const encrypted = cipher.update(chunk);
      if (encrypted.length) {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(encrypted.length);
        this.push(Buffer.concat([len, encrypted]));
      }
      cb();
    },
    flush(cb: TransformCallback) {
      if (!headerWritten) {
        this.push(Buffer.concat([MAGIC, Buffer.from([VERSION]), iv]));
        headerWritten = true;
      }
      const tail = cipher.final();
      if (tail.length) {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(tail.length);
        this.push(Buffer.concat([len, tail]));
      }
      this.push(Buffer.alloc(4)); // end-of-stream marker
      this.push(cipher.getAuthTag());
      cb();
    },
  });
}

export function createDecryptStream(key: Buffer): Transform {
  let buffered = Buffer.alloc(0);
  let decipher: DecipherGCM | null = null;
  let finished = false;

  return new Transform({
    transform(chunk: Buffer, _enc, cb: TransformCallback) {
      buffered = Buffer.concat([buffered, chunk]);

      if (!decipher) {
        const headerLen = MAGIC.length + 1 + IV_BYTES;
        if (buffered.length < headerLen) return cb();
        if (!buffered.subarray(0, MAGIC.length).equals(MAGIC)) {
          return cb(new CryptoError("Not a VaultBack envelope"));
        }
        if (buffered[MAGIC.length] !== VERSION) {
          return cb(new CryptoError(`Unsupported envelope version ${buffered[MAGIC.length]}`));
        }
        const iv = buffered.subarray(MAGIC.length + 1, headerLen);
        decipher = createDecipheriv("aes-256-gcm", key, iv) as DecipherGCM;
        buffered = buffered.subarray(headerLen);
      }

      for (;;) {
        if (finished) {
          if (buffered.length >= TAG_BYTES) {
            decipher.setAuthTag(buffered.subarray(0, TAG_BYTES));
            buffered = buffered.subarray(TAG_BYTES);
          }
          break;
        }
        if (buffered.length < 4) break;
        const len = buffered.readUInt32BE(0);
        if (len === 0) {
          finished = true;
          buffered = buffered.subarray(4);
          continue;
        }
        if (buffered.length < 4 + len) break;
        const frame = buffered.subarray(4, 4 + len);
        buffered = buffered.subarray(4 + len);
        try {
          this.push(decipher.update(frame));
        } catch (err) {
          return cb(err as Error);
        }
      }
      cb();
    },
    flush(cb: TransformCallback) {
      if (!decipher) return cb(new CryptoError("Empty ciphertext stream"));
      if (!finished) {
        // No end-of-stream frame: the object was truncated mid-upload. Refusing
        // here is the whole point — a half-restored database is worse than none.
        return cb(new CryptoError("Ciphertext stream is truncated"));
      }
      try {
        this.push(decipher.final());
        cb();
      } catch {
        cb(new CryptoError("Authentication failed: the snapshot has been altered"));
      }
    },
  });
}

/** A pass-through that accumulates the sha256 of everything flowing through it. */
export class Sha256Tap extends Transform {
  private readonly hash = createHash("sha256");
  bytes = 0;

  _transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback): void {
    this.hash.update(chunk);
    this.bytes += chunk.length;
    this.push(chunk);
    cb();
  }

  digest(): string {
    return this.hash.digest("hex");
  }
}

// Display formatting lives in checksum-display.ts so client components can use
// it without pulling node:crypto into the browser bundle.
export { shortChecksum } from "@/lib/checksum-display";
