import assert from "node:assert/strict";
import { test } from "node:test";
import { chaseMessage, type ChaseContext } from "./chase-copy";
import type { ChaseKind } from "@/db/schema";

const CTX: ChaseContext = {
  orgName: "Harbor Ridge Management",
  vendorName: "Kestrel Roofing LLC",
  propertyName: "Bayview Terrace",
  uploadUrl: "https://certshield.app/v/tok_abc123",
  expiresOn: "2026-09-02",
  daysToExpiry: 7,
  deficiencies: [
    {
      line: "GL each occurrence",
      reason: "GL each occurrence $500,000 is below the required $1,000,000.",
    },
    {
      line: "Certificate holder",
      reason: 'The certificate holder reads "Bayview LLC", not Harbor Ridge Management.',
    },
  ],
  signature: "Dana Whitlock, Compliance",
};

const ALL: ChaseKind[] = [
  "renewal_t30",
  "renewal_t14",
  "renewal_t7",
  "renewal_t1",
  "lapsed",
  "deficiency",
];

test("every rung names the vendor, the property and the upload link", () => {
  for (const kind of ALL) {
    const m = chaseMessage(kind, CTX);
    assert.ok(m.subject.includes("Kestrel Roofing LLC"), `${kind} subject`);
    assert.ok(m.text.includes("Bayview Terrace"), `${kind} property`);
    assert.ok(m.text.includes(CTX.uploadUrl), `${kind} link`);
    assert.ok(m.text.includes("Dana Whitlock, Compliance"), `${kind} signature`);
  }
});

test("no rung leaks an emoji or an unresolved template hole", () => {
  for (const kind of ALL) {
    const m = chaseMessage(kind, CTX);
    const body = `${m.subject}\n${m.text}`;
    assert.equal(/\p{Extended_Pictographic}/u.test(body), false, `${kind} emoji`);
    assert.equal(/\{\{|\}\}|undefined|null|NaN/.test(body), false, `${kind} hole: ${body}`);
  }
});

test("the deficiency letter quotes the engine's sentences verbatim", () => {
  const m = chaseMessage("deficiency", CTX);
  for (const d of CTX.deficiencies) {
    assert.ok(m.text.includes(d.reason), `missing: ${d.reason}`);
  }
});

test("the lapse notice also carries the named reasons", () => {
  const m = chaseMessage("lapsed", { ...CTX, daysToExpiry: -3, expiresOn: "2026-07-31" });
  assert.ok(m.text.includes("expired Jul 31, 2026"));
  assert.ok(m.text.includes("GL each occurrence $500,000 is below the required $1,000,000."));
});

test("renewal rungs do not list deficiencies — there are none to list", () => {
  const clean = { ...CTX, deficiencies: [] };
  const m = chaseMessage("renewal_t14", clean);
  assert.equal(m.text.includes("What is wrong, exactly"), false);
});

test("tone escalates: only the last two rungs mention holding work", () => {
  assert.equal(chaseMessage("renewal_t30", CTX).text.includes("held"), false);
  assert.equal(chaseMessage("renewal_t14", CTX).text.includes("held"), false);
  assert.ok(chaseMessage("renewal_t7", CTX).text.includes("hold work orders"));
  assert.ok(chaseMessage("renewal_t1", CTX).text.includes("work orders are held"));
  assert.ok(chaseMessage("lapsed", CTX).text.includes("work orders are held"));
});

test("an unknown expiry degrades to a readable sentence, not to 'null'", () => {
  const m = chaseMessage("deficiency", { ...CTX, expiresOn: null, daysToExpiry: null });
  assert.equal(m.text.includes("null"), false);
  assert.ok(m.subject.length > 20);
});
