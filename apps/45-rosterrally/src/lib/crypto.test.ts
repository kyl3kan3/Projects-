/**
 * Field encryption for the two columns that describe a child's health and the
 * adults who may collect them.
 *
 * The property that matters most is the failure mode: a value that has been
 * tampered with, truncated, or encrypted under a different key must read as "no
 * note on file", never as a confident wrong answer and never as a crash on a
 * screen a coach is holding at a field.
 */

import assert from "node:assert/strict";
import test from "node:test";

// `env` reads through a getter on every call, so setting this before any test
// runs is enough — no dynamic import needed, and the suite stays independent of
// whatever `.env.local` happens to hold.
process.env.MEDICAL_FIELD_KEY ??= "bG9jYWxkZXZtZWRpY2Fsa2V5MDAwMDAwMDAwMDAwMDA=";

import { decryptContacts, decryptField, encryptContacts, encryptField } from "./crypto";

test("a medical note round-trips exactly, including punctuation and accents", () => {
  for (const note of [
    "Inhaler in kit bag",
    "Peanut allergy — epipen with coach; call mother first",
    "Type 1 diabetes. Snacks at half-time, 10:30 and 11:15.",
    "Uses a hearing aid (left ear)",
    "Céline needs her ventoline",
    "a".repeat(1_900),
  ]) {
    const stored = encryptField(note)!;
    assert.equal(decryptField(stored), note);
  }
});

test("nothing on file stays nothing on file", () => {
  assert.equal(encryptField(null), null);
  assert.equal(encryptField(undefined), null);
  assert.equal(encryptField(""), null);
  assert.equal(encryptField("   "), null);
  assert.equal(decryptField(null), null);
  assert.equal(decryptField(""), null);
});

test("the ciphertext does not leak the plaintext", () => {
  const stored = encryptField("Peanut allergy")!;
  assert.equal(stored.includes("Peanut"), false);
  assert.equal(stored.includes("allergy"), false);
  assert.ok(stored.startsWith("v1."));
  assert.equal(stored.split(".").length, 4);
});

test("two children with the same allergy do not produce the same ciphertext", () => {
  // A per-row nonce, so a database dump cannot be read by grouping equal values.
  const a = encryptField("Peanut allergy")!;
  const b = encryptField("Peanut allergy")!;
  assert.notEqual(a, b);
  assert.equal(decryptField(a), decryptField(b));
});

test("a tampered value reads as nothing on file, and never throws", () => {
  const stored = encryptField("Inhaler in kit bag")!;
  const [version, nonce, tag, body] = stored.split(".");
  const broken = [
    `${version}.${nonce}.${tag}.${body.slice(0, -4)}AAAA`, // ciphertext edited
    `${version}.${nonce}.AAAAAAAAAAAAAAAAAAAAAA.${body}`, // tag replaced
    `${version}.AAAAAAAAAAAAAAAA.${tag}.${body}`, // nonce replaced
    `v2.${nonce}.${tag}.${body}`, // unknown version
    `${nonce}.${tag}.${body}`, // truncated shape
    "not-even-close",
    "v1...",
  ];
  for (const value of broken) {
    assert.equal(decryptField(value), null, `should refuse: ${value.slice(0, 24)}`);
  }
});

test("emergency contacts round-trip as structured data", () => {
  const contacts = [
    { name: "Rosa Alvarez", phone: "+15550188", relationship: "Grandmother" },
    { name: "Yasmin Farouk", phone: "+15550126", relationship: "Aunt" },
  ];
  const stored = encryptContacts(contacts)!;
  assert.deepEqual(decryptContacts(stored), contacts);
  assert.equal(stored.includes("Rosa"), false);
});

test("half-filled contacts are dropped rather than stored as noise", () => {
  assert.equal(encryptContacts([]), null);
  assert.equal(encryptContacts([{ name: "", phone: "", relationship: "Aunt" }]), null);
  assert.equal(encryptContacts([{ name: "Rosa", phone: "", relationship: "Gran" }]), null);
  const partial = encryptContacts([
    { name: "Rosa Alvarez", phone: "+15550188", relationship: "Gran" },
    { name: "No Number", phone: "", relationship: "Uncle" },
  ])!;
  assert.deepEqual(decryptContacts(partial).map((c) => c.name), ["Rosa Alvarez"]);
});

test("contacts that cannot be decrypted or parsed come back as an empty list", () => {
  assert.deepEqual(decryptContacts(null), []);
  assert.deepEqual(decryptContacts("v1.AAAA.BBBB.CCCC"), []);
  // Valid ciphertext that is not a JSON array.
  assert.deepEqual(decryptContacts(encryptField("just a sentence")), []);
});
