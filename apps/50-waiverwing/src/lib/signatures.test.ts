/**
 * Evidence helpers. The hash check is the load-bearing one: it is the only thing
 * standing between "the stored waiver text was altered" and nobody noticing.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import {
  channelLabel,
  displayName,
  evidenceSummary,
  normalizeEmail,
  normalizePhone,
  stampDate,
  verifySignatureEvidence,
} from "@/lib/signatures";
import type { Signature } from "@/db/schema";

const TEXT = "WAIVER: Granite Works climbing waiver\nVERSION: 1\n\nSECTION: Risk\nBe careful.";

function sig(overrides: Partial<Signature> = {}): Signature {
  return {
    id: "sig-1",
    signedText: TEXT,
    textHash: createHash("sha256").update(TEXT, "utf8").digest("hex"),
    waiverTitle: "Granite Works climbing waiver",
    waiverVersion: 1,
    signerName: "Dana Torres",
    guardianRelationship: "Parent",
    signerAgeYears: 13,
    minorAtSigning: true,
    ageOfMajorityAtSigning: 18,
    resignAtMajority: true,
    signatureKind: "typed",
    signatureData: "Dana Torres",
    signedAt: new Date("2026-03-02T16:41:00Z"),
    expiresAt: new Date("2027-03-02T16:41:00Z"),
    expiryRule: "days_365",
    ip: "198.51.100.24",
    userAgent: "Mozilla/5.0 (iPhone)",
    channel: "kiosk",
    capturedAt: null,
    disclosureText: "I have read this waiver.",
    disclosureAcceptedAt: new Date("2026-03-02T16:40:50Z"),
    ...overrides,
  } as Signature;
}

describe("normalisation at write time", () => {
  it("lowercases and trims emails so search needs no read-time tricks", () => {
    assert.equal(normalizeEmail("  SAM@Example.com "), "sam@example.com");
    assert.equal(normalizeEmail(""), null);
    assert.equal(normalizeEmail(null), null);
  });

  it("reduces phones to digits so formatting never splits a person in two", () => {
    assert.equal(normalizePhone("(303) 555-0117"), "3035550117");
    assert.equal(normalizePhone("+1 303 555 0117"), "13035550117");
    assert.equal(normalizePhone("n/a"), null);
  });

  it("builds a display name without stray spaces", () => {
    assert.equal(displayName({ firstName: "Maya", lastName: "Torres" }), "Maya Torres");
  });
});

describe("verifySignatureEvidence", () => {
  it("passes when the stored hash matches the stored text", () => {
    assert.equal(verifySignatureEvidence(sig()).ok, true);
  });

  it("fails when the stored text has been altered after the fact", () => {
    const tampered = sig({ signedText: `${TEXT}\nAND ALSO THIS.` });
    const result = verifySignatureEvidence(tampered);
    assert.equal(result.ok, false);
    assert.notEqual(result.computed, tampered.textHash);
  });

  it("fails when the hash has been altered instead", () => {
    assert.equal(verifySignatureEvidence(sig({ textHash: "0".repeat(64) })).ok, false);
  });
});

describe("evidenceSummary", () => {
  it("renders DESIGN.md's mono evidence line", () => {
    const summary = evidenceSummary(sig(), "2012-04-09", "America/Denver");
    assert.match(summary.monoLine, /^SIGNED MAR 2 2026 · 09:41 · KIOSK · SHA-256 [0-9A-F]{4}…[0-9A-F]{4}$/);
  });

  it("states the guardian, the age at signing and the age of majority", () => {
    const text = evidenceSummary(sig(), "2012-04-09", "America/Denver").lines.join("\n");
    assert.match(text, /Signed by: Dana Torres — Parent of the participant/);
    assert.match(text, /was 13 years old at signing/);
    assert.match(text, /age of majority on this waiver was 18/);
    assert.match(text, /IP address: 198\.51\.100\.24/);
    assert.match(text, /hash matches the stored text/);
  });

  it("says so, loudly, when the evidence no longer verifies", () => {
    const text = evidenceSummary(sig({ signedText: "edited" }), null).lines.join("\n");
    assert.match(text, /MISMATCH — stored text has been altered/);
  });

  it("reports coverage ending at majority for a guardian-signed minor", () => {
    const text = evidenceSummary(sig({ expiresAt: null }), "2012-04-09", "America/Denver").lines.join("\n");
    assert.match(text, /Coverage ends: 2030-04-09.*reaches the age of majority/);
  });

  it("marks a signature that was captured offline and synced later", () => {
    const text = evidenceSummary(
      sig({ capturedAt: new Date("2026-03-02T16:30:00Z") }),
      "2012-04-09",
    ).lines.join("\n");
    assert.match(text, /captured offline, synced later/);
  });
});

describe("stamps and labels", () => {
  it("stamps a date in the venue's timezone, not the server's", () => {
    const at = new Date("2026-03-03T02:15:00Z"); // 19:15 on 2 March in Denver
    assert.equal(stampDate(at, "America/Denver"), "MAR 2 2026 · 19:15");
    assert.equal(stampDate(at, "UTC"), "MAR 3 2026 · 02:15");
  });

  it("labels each signing channel in mono form", () => {
    assert.equal(channelLabel("qr"), "QR");
    assert.equal(channelLabel("kiosk"), "KIOSK");
    assert.equal(channelLabel("link"), "LINK");
  });
});
