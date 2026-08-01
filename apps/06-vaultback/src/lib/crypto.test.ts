import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PassThrough, Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import {
  CryptoError,
  Sha256Tap,
  createDecryptStream,
  createEncryptStream,
  decryptCredential,
  encryptCredential,
  generateDataKey,
  masterKeyId,
  shortChecksum,
  unwrapDataKey,
} from "@/lib/crypto";

const MASTER = "11223344556677889900aabbccddeeff00112233445566778899aabbccddeeff";
const OTHER = "ffeeddccbbaa00998877665544332211ffeeddccbbaa00998877665544332211";

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test("a data key is unwrappable by its master key and nothing else", () => {
  const key = generateDataKey(MASTER);
  assert.equal(key.plaintext.length, 32);
  assert.deepEqual(unwrapDataKey(key.wrapped, MASTER), key.plaintext);
  assert.throws(() => unwrapDataKey(key.wrapped, OTHER), CryptoError);
});

test("every snapshot gets its own data key", () => {
  const a = generateDataKey(MASTER);
  const b = generateDataKey(MASTER);
  assert.notEqual(a.plaintext.toString("hex"), b.plaintext.toString("hex"));
  // ...and the same key id, so rotation can find which master wrapped what.
  assert.equal(a.keyId, b.keyId);
  assert.equal(a.keyId, masterKeyId(MASTER));
  assert.notEqual(masterKeyId(MASTER), masterKeyId(OTHER));
  // The key id is a fingerprint, not the key.
  assert.ok(!a.keyId.includes(MASTER.slice(0, 16)));
});

test("a bad master key is rejected with an actionable message", () => {
  assert.throws(() => generateDataKey("too-short"), /64 hex characters/);
  assert.throws(() => generateDataKey(""), /openssl rand -hex 32/);
});

test("credentials round-trip and fail closed on the wrong key", () => {
  const secret = "postgres://user:p@ss;word@db.abcd.supabase.co:5432/postgres?sslmode=require";
  const sealed = encryptCredential(secret, OTHER);
  assert.equal(decryptCredential(sealed, OTHER), secret);
  assert.throws(() => decryptCredential(sealed, MASTER), CryptoError);
  // The ciphertext must not contain the plaintext.
  assert.ok(!sealed.toString("latin1").includes("supabase"));
});

test("tampering with a credential envelope is detected", () => {
  const sealed = encryptCredential("postgres://a:b@c/d", OTHER);
  const tampered = Buffer.from(sealed);
  tampered[tampered.length - 20] ^= 0x01;
  assert.throws(() => decryptCredential(tampered, OTHER), /Authentication failed/);
});

test("a non-VaultBack envelope is refused rather than misread", () => {
  assert.throws(() => decryptCredential(Buffer.from("not an envelope at all"), OTHER), CryptoError);
  assert.throws(() => decryptCredential(Buffer.alloc(4), OTHER), /too short/);
});

test("the stream cipher round-trips through gzip, like the real pipeline", async () => {
  const key = randomBytes(32);
  // Big enough to cross several internal chunk boundaries.
  const plain = Buffer.from(
    Array.from({ length: 5000 }, (_, i) => `INSERT INTO t VALUES (${i}, 'row ${i}');\n`).join(""),
  );

  const encrypted = new PassThrough();
  const encryptDone = pipeline(
    Readable.from([plain]),
    createGzip(),
    createEncryptStream(key),
    encrypted,
  );
  const [ciphertext] = await Promise.all([collect(encrypted), encryptDone]);

  assert.equal(ciphertext.subarray(0, 3).toString(), "VB1");
  assert.ok(ciphertext.length < plain.length, "gzip should have compressed repetitive SQL");
  assert.ok(!ciphertext.toString("latin1").includes("INSERT INTO"));

  const out = new PassThrough();
  const decryptDone = pipeline(
    Readable.from([ciphertext]),
    createDecryptStream(key),
    createGunzip(),
    out,
  );
  const [restored] = await Promise.all([collect(out), decryptDone]);
  assert.equal(restored.toString(), plain.toString());
});

test("a truncated ciphertext stream fails instead of restoring half a database", async () => {
  const key = randomBytes(32);
  const encrypted = new PassThrough();
  const done = pipeline(Readable.from([Buffer.from("CREATE TABLE t (id int);\n".repeat(500))]), createEncryptStream(key), encrypted);
  const [ciphertext] = await Promise.all([collect(encrypted), done]);

  // Chop off the end-of-stream marker and the auth tag.
  const truncated = ciphertext.subarray(0, ciphertext.length - 40);
  await assert.rejects(
    () => collect(Readable.from([truncated]).pipe(createDecryptStream(key))),
    /truncated/,
  );
});

test("a single flipped byte in the middle of a stream is caught", async () => {
  const key = randomBytes(32);
  const encrypted = new PassThrough();
  const done = pipeline(Readable.from([Buffer.from("SELECT 1;\n".repeat(2000))]), createEncryptStream(key), encrypted);
  const [ciphertext] = await Promise.all([collect(encrypted), done]);

  const tampered = Buffer.from(ciphertext);
  tampered[Math.floor(tampered.length / 2)] ^= 0xff;
  await assert.rejects(
    () => collect(Readable.from([tampered]).pipe(createDecryptStream(key))),
    /Authentication failed/,
  );
});

test("an empty ciphertext stream is an error, not an empty restore", async () => {
  const key = randomBytes(32);
  await assert.rejects(
    () => collect(Readable.from([Buffer.alloc(0)]).pipe(createDecryptStream(key))),
    /Empty ciphertext/,
  );
});

test("Sha256Tap hashes and counts everything passing through", async () => {
  const tap = new Sha256Tap();
  const out = new PassThrough();
  await pipeline(Readable.from([Buffer.from("abc"), Buffer.from("def")]), tap, out);
  await collect(out);
  assert.equal(tap.bytes, 6);
  // sha256("abcdef")
  assert.equal(
    tap.digest(),
    "bef57ec7f53a6d40beb640a780a639c83bc29ac8a9816f1fc6c5c6dcd93c4721",
  );
});

test("checksums are shown truncated but recognisably", () => {
  assert.equal(shortChecksum("9f3c11223344556677889900aabbccddeeff00112233445566778899aabba41d"), "sha256:9f3c…a41d");
  assert.equal(shortChecksum("abc"), "sha256:abc");
});
