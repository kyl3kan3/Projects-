/**
 * Signature evidence.
 *
 * The hash test is the one that matters: it is the only thing standing between
 * "the stored consent text was altered after signing" and nobody noticing. The
 * fixture recomputes the hash independently, from the printed components, which is
 * exactly what an auditor with a PDF would do.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import {
  canonicalDocument,
  documentHash,
  evidenceSummary,
  stampDateUtc,
  validateSignatureInput,
  verifySignature,
} from "@/lib/signature";
import type { SignatureRecord } from "@/db/schema";

const CONSENT = "Consent to treatment\n\nI am asking for psychotherapy services for myself.";
const DISCLOSURE = "By typing my name below I am signing this document electronically.";

const parts = { formTitle: "Behavioral health intake packet", formVersion: 2, consentText: CONSENT, disclosure: DISCLOSURE };

function record(overrides: Partial<SignatureRecord> = {}): SignatureRecord {
  return {
    id: "sig-1",
    practiceId: "p1",
    intakeId: "i1",
    blockKey: "sign_treatment",
    kind: "typed",
    signaturePayloadEnc: Buffer.alloc(0),
    signedNameEnc: Buffer.alloc(0),
    signedText: CONSENT,
    disclosureText: DISCLOSURE,
    disclosureAcceptedAt: new Date("2026-07-04T14:01:50Z"),
    documentHash: documentHash(parts),
    formVersionId: "v2",
    formTitle: parts.formTitle,
    formVersion: 2,
    signedAt: new Date("2026-07-04T14:02:11Z"),
    ip: "73.92.1.8",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    createdAt: new Date("2026-07-04T14:02:11Z"),
    ...overrides,
  } as SignatureRecord;
}

describe("documentHash", () => {
  it("is reproducible by hand from the printed components", () => {
    const byHand = createHash("sha256")
      .update(
        [
          "FORM: Behavioral health intake packet",
          "VERSION: 2",
          "",
          CONSENT,
          "",
          `DISCLOSURE: ${DISCLOSURE}`,
        ].join("\n"),
        "utf8",
      )
      .digest("hex");
    assert.equal(documentHash(parts), byHand);
  });

  it("changes when the version number changes, even with identical text", () => {
    assert.notEqual(documentHash(parts), documentHash({ ...parts, formVersion: 3 }));
  });

  it("changes when the consent text changes by one word", () => {
    assert.notEqual(
      documentHash(parts),
      documentHash({ ...parts, consentText: `${CONSENT} And also this.` }),
    );
  });

  it("changes when the disclosure changes", () => {
    assert.notEqual(documentHash(parts), documentHash({ ...parts, disclosure: "I agree." }));
  });

  it("is insensitive to line-ending style and surrounding whitespace only", () => {
    assert.equal(
      documentHash(parts),
      documentHash({ ...parts, consentText: `\n${CONSENT.replace(/\n/g, "\r\n")}\n  ` }),
    );
  });

  it("includes the form title, so two forms with the same consent differ", () => {
    assert.notEqual(documentHash(parts), documentHash({ ...parts, formTitle: "PT intake packet" }));
    assert.match(canonicalDocument(parts), /^FORM: Behavioral health intake packet\n/);
  });
});

describe("verifySignature", () => {
  it("passes on an untouched record", () => {
    assert.equal(verifySignature(record()).ok, true);
  });

  it("fails when the stored consent text was edited after the fact", () => {
    const tampered = record({ signedText: `${CONSENT}\n\nAnd I waive all rights.` });
    const result = verifySignature(tampered);
    assert.equal(result.ok, false);
    assert.notEqual(result.computed, tampered.documentHash);
  });

  it("fails when the hash was edited instead of the text", () => {
    assert.equal(verifySignature(record({ documentHash: "0".repeat(64) })).ok, false);
  });

  it("fails when the version number was bumped on the record", () => {
    assert.equal(verifySignature(record({ formVersion: 9 })).ok, false);
  });

  it("does not read the form, so a published version changing cannot break it", () => {
    // Nothing in verifySignature takes a form or a version row. This assertion is
    // the arity of the function: it can only see the record's own copies.
    assert.equal(verifySignature.length, 1);
  });
});

describe("evidenceSummary", () => {
  it("renders DESIGN.md's mono stamp line", () => {
    const summary = evidenceSummary(record(), "Dana Okonkwo");
    assert.match(summary.monoLine, /^SIGNED · JUL 4 2026 · 14:02 UTC · SHA-256 [0-9A-F]{4}…[0-9A-F]{4}$/);
  });

  it("states signer, method, time, IP, device, disclosure and hash", () => {
    const text = evidenceSummary(record(), "Dana Okonkwo").lines.join("\n");
    assert.match(text, /Signed by: Dana Okonkwo/);
    assert.match(text, /Method: typed name/);
    assert.match(text, /Signed at: 2026-07-04T14:02:11\.000Z/);
    assert.match(text, /IP address: 73\.92\.1\.8/);
    assert.match(text, /Device: Mozilla\/5\.0/);
    assert.match(text, /Consent to sign: "By typing my name/);
    assert.match(text, /Document SHA-256: [0-9a-f]{64}/);
    assert.match(text, /still hashes to the recorded value/);
  });

  it("says MISMATCH loudly when the record no longer verifies", () => {
    const text = evidenceSummary(record({ signedText: "edited" }), "Dana Okonkwo").lines.join("\n");
    assert.match(text, /MISMATCH/);
    assert.equal(evidenceSummary(record({ signedText: "edited" }), "Dana").verified, false);
  });

  it("says so when no IP or user agent was recorded rather than printing null", () => {
    const text = evidenceSummary(record({ ip: null, userAgent: null }), "Dana").lines.join("\n");
    assert.match(text, /IP address: not recorded/);
    assert.match(text, /Device: not recorded/);
  });

  it("describes a drawn mark as drawn", () => {
    const text = evidenceSummary(record({ kind: "drawn" }), "Dana").lines.join("\n");
    assert.match(text, /Method: drawn on device/);
  });
});

describe("stampDateUtc", () => {
  it("stamps in UTC — evidence is not timezone-relative", () => {
    assert.equal(stampDateUtc(new Date("2026-01-01T00:05:00Z")), "JAN 1 2026 · 00:05 UTC");
    assert.equal(stampDateUtc(new Date("2026-12-31T23:59:00Z")), "DEC 31 2026 · 23:59 UTC");
  });
});

describe("validateSignatureInput", () => {
  const base = {
    kind: "typed" as const,
    payload: "Dana Okonkwo",
    signedName: "Dana Okonkwo",
    disclosureAccepted: true,
    allowDrawn: true,
  };

  it("accepts a typed full name with the disclosure ticked", () => {
    assert.deepEqual(validateSignatureInput(base), []);
  });

  it("refuses to sign without the consent-to-sign disclosure", () => {
    const problems = validateSignatureInput({ ...base, disclosureAccepted: false });
    assert.ok(problems.some((p) => /Tick the box/.test(p)));
  });

  it("requires a first and last name — evidence needs an attributable signer", () => {
    assert.ok(validateSignatureInput({ ...base, signedName: "Dana" }).some((p) => /first and last/.test(p)));
    assert.ok(validateSignatureInput({ ...base, signedName: "D" }).length >= 1);
  });

  it("rejects a tap as a drawn signature", () => {
    const problems = validateSignatureInput({ ...base, kind: "drawn", payload: "M10 10" });
    assert.ok(problems.some((p) => /Draw your signature/.test(p)));
  });

  it("accepts a real drawn path", () => {
    const path = "M12.0 40.0 L20.5 22.1 L31.9 48.3 L44.2 18.8 L58.0 41.0 L70.4 25.5";
    assert.deepEqual(validateSignatureInput({ ...base, kind: "drawn", payload: path }), []);
  });

  it("refuses a drawn signature when the block only accepts typed", () => {
    const path = "M12.0 40.0 L20.5 22.1 L31.9 48.3 L44.2 18.8 L58.0 41.0 L70.4 25.5";
    const problems = validateSignatureInput({ ...base, kind: "drawn", payload: path, allowDrawn: false });
    assert.ok(problems.some((p) => /typed signature only/.test(p)));
  });
});
