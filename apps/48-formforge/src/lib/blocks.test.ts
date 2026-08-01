/**
 * The block system: structural rules a packet must satisfy before it can be
 * published, and the CSV column contract downstream systems depend on.
 *
 * The consent-before-signature rules are the load-bearing ones. A signature block
 * that sits above the text it signs, or points at text that is not in the packet,
 * produces a signature that attests to nothing — and that is exactly the defect a
 * builder UI makes easy to create by dragging a card two rows up.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  blockFields,
  consentParagraphs,
  csvColumns,
  formCsvColumns,
  renderConsentText,
  renderVersionText,
  sections,
  validateBlockAnswers,
  validateForm,
} from "@/lib/blocks";
import { TEMPLATES, templateByKey } from "@/lib/templates";
import type { FormBlock } from "@/db/schema";

const consent = (key = "consent_a"): FormBlock => ({
  key,
  kind: "consent",
  config: {
    heading: "Consent to treatment",
    requireScroll: true,
    body: "I am asking for psychotherapy services for myself and I understand its limits.",
  },
});

const signature = (key = "sign_a", consentKey = "consent_a"): FormBlock => ({
  key,
  kind: "signature",
  config: {
    heading: "Sign",
    disclosure: "By typing my name I am signing this document electronically and agree to its terms.",
    allowDrawn: true,
    consentBlockKey: consentKey,
  },
});

const demographics = (key = "demographics"): FormBlock => ({
  key,
  kind: "demographics",
  config: {
    heading: "About you",
    fields: [
      { key: "first_name", required: true },
      { key: "last_name", required: true },
      { key: "email", required: true },
      { key: "phone", required: false },
    ],
  },
});

describe("validateForm", () => {
  it("accepts a consent followed by its signature", () => {
    assert.deepEqual(validateForm([demographics(), consent(), signature()]), []);
  });

  it("refuses an empty packet", () => {
    assert.match(validateForm([])[0], /at least one block/);
  });

  it("refuses a signature that comes before the text it signs", () => {
    const problems = validateForm([signature(), consent()]);
    assert.ok(problems.some((p) => /comes before the consent text/.test(p)), problems.join(" | "));
  });

  it("refuses a signature pointing at a consent block that is not in the packet", () => {
    const problems = validateForm([consent(), signature("sign_a", "consent_missing")]);
    assert.ok(problems.some((p) => /not in this packet/.test(p)), problems.join(" | "));
  });

  it("refuses consent text with nothing recording agreement to it", () => {
    const problems = validateForm([consent()]);
    assert.ok(problems.some((p) => /no signature block/.test(p)), problems.join(" | "));
  });

  it("refuses two demographics blocks", () => {
    const problems = validateForm([demographics("d1"), demographics("d2"), consent(), signature()]);
    assert.ok(problems.some((p) => /only have one demographics/.test(p)), problems.join(" | "));
  });

  it("refuses duplicate block keys and keys that are not slug-shaped", () => {
    const dup = validateForm([demographics("same"), demographics("same")]);
    assert.ok(dup.some((p) => /share the key/.test(p)));
    const bad = validateForm([{ ...demographics(), key: "About You" }]);
    assert.ok(bad.some((p) => /lowercase letters/.test(p)));
  });

  it("refuses consent text too short to be consent to anything", () => {
    const thin: FormBlock = { key: "c", kind: "consent", config: { heading: "H", body: "ok" } };
    const problems = validateForm([thin, signature("s", "c")]);
    assert.ok(problems.some((p) => /real consent text/.test(p)), problems.join(" | "));
  });
});

describe("every gallery template publishes cleanly", () => {
  for (const template of TEMPLATES) {
    it(`${template.key} validates`, () => {
      assert.deepEqual(validateForm(template.blocks), [], template.title);
    });
  }

  it("finds a template by key and nothing by a wrong one", () => {
    assert.ok(templateByKey("behavioral_health_v1"));
    assert.equal(templateByKey("nope"), null);
  });

  it("the behavioral-health packet has both screeners and two consents", () => {
    const blocks = templateByKey("behavioral_health_v1")!.blocks;
    assert.equal(blocks.filter((b) => b.kind === "screener").length, 2);
    assert.equal(blocks.filter((b) => b.kind === "consent").length, 2);
    assert.equal(blocks.filter((b) => b.kind === "signature").length, 2);
  });
});

describe("sections", () => {
  it("puts a consent and its signature on the same screen — never sign an unseen text", () => {
    const result = sections([demographics(), consent(), signature()]);
    assert.equal(result.length, 2);
    assert.deepEqual(result[1].blocks.map((b) => b.key), ["consent_a", "sign_a"]);
    assert.equal(result[1].title, "Consent to treatment");
  });

  it("does not pair a signature with an unrelated consent block", () => {
    const result = sections([consent("consent_a"), signature("sign_b", "consent_b")]);
    assert.equal(result.length, 2);
  });

  it("gives every other block its own screen", () => {
    const result = sections([demographics(), { key: "phq9", kind: "screener", config: { instrument: "phq9" } }]);
    assert.equal(result.length, 2);
    assert.equal(result[1].title, "PHQ-9");
  });
});

describe("CSV columns — the EHR-lite contract", () => {
  it("names a column per field as blockKey.field", () => {
    assert.deepEqual(csvColumns(demographics()), [
      "demographics.first_name",
      "demographics.last_name",
      "demographics.email",
      "demographics.phone",
    ]);
  });

  it("exports a screener as total, severity and flag — never item answers", () => {
    const block: FormBlock = { key: "phq9", kind: "screener", config: { instrument: "phq9" } };
    assert.deepEqual(csvColumns(block), ["phq9.total", "phq9.severity", "phq9.flagged"]);
    // The items exist as fields for the patient, but not as export columns.
    assert.equal(blockFields(block).length, 9);
  });

  it("exports a signature as the signing time and the document hash", () => {
    assert.deepEqual(csvColumns(signature()), ["sign_a.signed_at", "sign_a.document_hash"]);
  });

  it("gives consent text no columns of its own", () => {
    assert.deepEqual(csvColumns(consent()), []);
  });

  it("keeps the behavioral-health packet's columns stable", () => {
    // This assertion is the contract. Changing it is a versioned event for every
    // practice that has built an import against the CSV — not a refactor.
    const columns = formCsvColumns(templateByKey("behavioral_health_v1")!.blocks);
    assert.deepEqual(columns, [
      "demographics.first_name",
      "demographics.last_name",
      "demographics.preferred_name",
      "demographics.dob",
      "demographics.pronouns",
      "demographics.phone",
      "demographics.email",
      "demographics.address",
      "demographics.emergency_name",
      "demographics.emergency_phone",
      "demographics.emergency_relationship",
      "insurance.self_pay",
      "insurance.carrier",
      "insurance.member_id",
      "insurance.group_number",
      "insurance.subscriber_name",
      "insurance.subscriber_relationship",
      "insurance_card.file",
      "history.presenting_concern",
      "history.duration",
      "history.prior_therapy",
      "history.prior_therapy_detail",
      "history.medications",
      "history.medical_conditions",
      "history.primary_care",
      "phq9.total",
      "phq9.severity",
      "phq9.flagged",
      "gad7.total",
      "gad7.severity",
      "gad7.flagged",
      "sign_treatment.signed_at",
      "sign_treatment.document_hash",
      "sign_privacy.signed_at",
      "sign_privacy.document_hash",
    ]);
  });
});

describe("answer validation", () => {
  const block = demographics();

  it("requires the required fields and lets the optional ones be blank", () => {
    const problems = validateBlockAnswers(block, {});
    assert.equal(problems.length, 3);
    assert.ok(problems.every((p) => !/Mobile phone/.test(p)));
  });

  it("checks email, phone and date shapes", () => {
    const problems = validateBlockAnswers(block, {
      "demographics.first_name": "Dana",
      "demographics.last_name": "Okonkwo",
      "demographics.email": "dana at example",
      "demographics.phone": "not a phone",
    });
    assert.ok(problems.some((p) => /valid email/.test(p)));
    assert.ok(problems.some((p) => /valid phone/.test(p)));
  });

  it("treats whitespace as blank, so a space bar does not satisfy a required field", () => {
    const problems = validateBlockAnswers(block, {
      "demographics.first_name": "   ",
      "demographics.last_name": "Okonkwo",
      "demographics.email": "dana@example.com",
    });
    assert.ok(problems.some((p) => /First name/.test(p)));
  });

  it("accepts a yes/no answer only as yes or no", () => {
    const insurance: FormBlock = {
      key: "insurance",
      kind: "insurance",
      config: { heading: "Insurance", fields: [{ key: "self_pay", required: true }] },
    };
    assert.deepEqual(validateBlockAnswers(insurance, { "insurance.self_pay": "yes" }), []);
    assert.equal(validateBlockAnswers(insurance, { "insurance.self_pay": "maybe" }).length, 1);
  });

  it("bounds screener answers to the 0-3 scale", () => {
    const block9: FormBlock = { key: "phq9", kind: "screener", config: { instrument: "phq9" } };
    const answers = Object.fromEntries(
      Array.from({ length: 9 }, (_, i) => [`phq9.i${i + 1}`, "1"]),
    );
    assert.deepEqual(validateBlockAnswers(block9, answers), []);
    assert.equal(validateBlockAnswers(block9, { ...answers, "phq9.i4": "7" }).length, 1);
  });
});

describe("consent rendering", () => {
  it("renders a canonical heading + body, normalised", () => {
    const text = renderConsentText({
      key: "c",
      kind: "consent",
      config: { heading: " Consent ", body: "Line one.\r\n\r\nLine two.   \n" },
    });
    assert.equal(text, "Consent\n\nLine one.\n\nLine two.");
  });

  it("splits the body into paragraphs for a phone screen", () => {
    const paragraphs = consentParagraphs(consent());
    assert.equal(paragraphs.length, 1);
    assert.match(paragraphs[0], /^I am asking/);
  });

  it("hashes a version over its title, number and every block", () => {
    const a = renderVersionText("Intake", 1, [consent(), signature()]);
    const b = renderVersionText("Intake", 2, [consent(), signature()]);
    assert.notEqual(a, b);
    assert.match(a, /VERSION: 1/);
    assert.match(a, /DISCLOSURE: By typing my name/);
    assert.match(a, /SIGNS: consent_a/);
  });
});
