/**
 * The encryption guarantees, stated as failures.
 *
 * A test that only proves "encrypt then decrypt returns the input" proves almost
 * nothing — a function that returns its argument passes it. What matters is that
 * the wrong key fails, a single flipped byte fails, and one practice's key cannot
 * open another's record. Those are the tests below.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CryptoError,
  encryptBytes,
  encryptField,
  generateIntakeToken,
  generatePracticeDek,
  hashIntakeToken,
  masterKeyId,
  open,
  patientNameKey,
  rewrapDek,
  seal,
  sha256Hex,
  unwrapDek,
} from "@/lib/crypto";
import { shortHash } from "@/lib/format";

const MASTER = "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0";
const OTHER_MASTER = "ffeeddccbbaa00998877665544332211ffeeddccbbaa00998877665544332211";

describe("practice data keys", () => {
  it("wraps a 32-byte key that only its master key can unwrap", () => {
    const dek = generatePracticeDek(MASTER);
    assert.equal(dek.plaintext.length, 32);
    assert.deepEqual(unwrapDek(dek.wrapped, MASTER), dek.plaintext);
    assert.throws(() => unwrapDek(dek.wrapped, OTHER_MASTER), CryptoError);
  });

  it("gives every practice a different key under the same master", () => {
    const a = generatePracticeDek(MASTER);
    const b = generatePracticeDek(MASTER);
    assert.notEqual(a.plaintext.toString("hex"), b.plaintext.toString("hex"));
    // Same master, so rotation can find every row it wrapped.
    assert.equal(a.keyId, b.keyId);
    assert.equal(a.keyId, masterKeyId(MASTER));
    assert.notEqual(masterKeyId(MASTER), masterKeyId(OTHER_MASTER));
  });

  it("publishes a fingerprint, not the key", () => {
    const id = masterKeyId(MASTER);
    assert.ok(!id.includes(MASTER.slice(0, 16)));
    assert.match(id, /^ff1:[0-9a-f]{16}$/);
  });

  it("refuses a master key that is not 32 hex bytes, with an actionable message", () => {
    assert.throws(() => generatePracticeDek("hunter2"), /64 hex characters/);
    assert.throws(() => generatePracticeDek(""), /openssl rand -hex 32/);
  });

  it("re-wraps under a new master without invalidating any ciphertext", () => {
    const dek = generatePracticeDek(MASTER);
    const sealed = encryptField(dek.plaintext, "Dana Okonkwo");
    const rotated = rewrapDek(dek.wrapped, MASTER, OTHER_MASTER);
    const recovered = unwrapDek(rotated.wrapped, OTHER_MASTER);
    // The data key is the same, so every existing envelope still opens.
    assert.equal(open(sealed, recovered).toString("utf8"), "Dana Okonkwo");
    assert.equal(rotated.keyId, masterKeyId(OTHER_MASTER));
    assert.throws(() => unwrapDek(rotated.wrapped, MASTER), CryptoError);
  });
});

describe("field encryption", () => {
  const dek = generatePracticeDek(MASTER).plaintext;

  it("round-trips a field and never leaves the plaintext in the ciphertext", () => {
    const sealed = encryptField(dek, "Presenting concern: panic attacks since March");
    assert.equal(
      open(sealed, dek).toString("utf8"),
      "Presenting concern: panic attacks since March",
    );
    assert.ok(!sealed.toString("latin1").includes("panic"));
  });

  it("produces a different ciphertext every time (random IV)", () => {
    const a = encryptField(dek, "same value");
    const b = encryptField(dek, "same value");
    assert.notEqual(a.toString("hex"), b.toString("hex"));
    assert.equal(open(a, dek).toString("utf8"), open(b, dek).toString("utf8"));
  });

  it("fails authentication under the wrong key", () => {
    const otherDek = generatePracticeDek(MASTER).plaintext;
    const sealed = encryptField(dek, "1988-04-12");
    assert.throws(() => open(sealed, otherDek), /Authentication failed/);
  });

  it("fails authentication when a single byte is flipped", () => {
    const sealed = encryptField(dek, "Member ID 4471-22-8890");
    for (const offset of [4, 20, sealed.length - 20, sealed.length - 1]) {
      const tampered = Buffer.from(sealed);
      tampered[offset] ^= 0x01;
      assert.throws(
        () => open(tampered, dek),
        /Authentication failed|Not a FormForge envelope|Unsupported envelope version/,
        `flipping byte ${offset} should have been detected`,
      );
    }
  });

  it("refuses a truncated envelope rather than returning half a value", () => {
    const sealed = encryptField(dek, "a longer answer that spans several blocks of ciphertext");
    assert.throws(() => open(sealed.subarray(0, sealed.length - 4), dek), /Authentication failed/);
    assert.throws(() => open(sealed.subarray(0, 8), dek), /too short/);
  });

  it("refuses bytes that are not a FormForge envelope at all", () => {
    assert.throws(() => open(Buffer.from("plain text pretending to be ciphertext"), dek), CryptoError);
  });

  it("round-trips binary file bytes as well as text", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0x7f]);
    const sealed = encryptBytes(dek, png);
    assert.deepEqual(open(sealed, dek), png);
  });

  it("refuses a key of the wrong length instead of silently padding it", () => {
    assert.throws(() => seal(Buffer.from("x"), Buffer.alloc(16)), /must be 32 bytes/);
  });
});

describe("intake tokens", () => {
  it("mints 128 bits of entropy and never repeats", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateIntakeToken()));
    assert.equal(tokens.size, 500);
    // base64url of 16 bytes is 22 characters, no padding.
    assert.match(generateIntakeToken(), /^[A-Za-z0-9_-]{22}$/);
  });

  it("hashes deterministically under one secret and differently under another", () => {
    const token = generateIntakeToken();
    assert.equal(hashIntakeToken(token, "secret-a"), hashIntakeToken(token, "secret-a"));
    assert.notEqual(hashIntakeToken(token, "secret-a"), hashIntakeToken(token, "secret-b"));
    // The hash must not contain the token: it is stored where the token is not.
    assert.ok(!hashIntakeToken(token, "secret-a").includes(token));
  });
});

describe("patient blind index", () => {
  it("is stable across capitalisation and padding, so a patient is one row", () => {
    const a = patientNameKey("Dana", "Okonkwo", "s");
    const b = patientNameKey("  dana ", "OKONKWO", "s");
    assert.equal(a, b);
  });

  it("separates different people and different practices' secrets", () => {
    assert.notEqual(patientNameKey("Dana", "Okonkwo", "s"), patientNameKey("Dana", "Okonko", "s"));
    assert.notEqual(patientNameKey("Dana", "Okonkwo", "s"), patientNameKey("Dana", "Okonkwo", "t"));
  });

  it("does not embed the name it indexes", () => {
    const key = patientNameKey("Dana", "Okonkwo", "s");
    assert.ok(!key.toLowerCase().includes("okonkwo"));
    assert.match(key, /^[0-9a-f]{64}$/);
  });
});

describe("hashes on screen", () => {
  it("truncates to DESIGN.md's twelve-character stamp form", () => {
    const hash = sha256Hex("consent text");
    assert.match(shortHash(hash), /^[0-9A-F]{4}…[0-9A-F]{4}$/);
  });
});
