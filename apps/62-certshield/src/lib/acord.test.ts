/**
 * The ACORD grammar's tests. Two layers:
 *
 *  - the grammar against text, one field varied at a time;
 *  - the whole intake path, against a real PDF built by lib/acord-sample.ts and
 *    read back through lib/pdf-text.ts. That second layer is what proves the
 *    extractor sees what a PDF reader sees, rather than what a fixture string says.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractFromText,
  holderMatches,
  lowConfidenceFields,
  needsReview,
  parseAcordDate,
  rowConfidence,
} from "./acord";
import {
  buildSampleAcordPdf,
  compliantSample,
  deficientSample,
  sampleAcordText,
  type SampleAcord,
} from "./acord-sample";
import { extractPdfText } from "./pdf-text";
import { evaluate } from "./compliance";
import type { RequirementLine } from "@/db/schema";

const THRESHOLD = 80;

const line = (kind: RequirementLine["coverage"], label: string, minCents: number) => ({
  coverage: kind,
  label,
  minCents,
});

const STANDARD_VENDOR: RequirementLine[] = [
  line("gl_each_occurrence", "GL each occurrence", 100_000_000),
  line("gl_aggregate", "GL aggregate", 200_000_000),
  line("wc_each_accident", "Workers' comp each accident", 100_000_000),
];

/* -------------------------------------------------------------------- dates */

test("ACORD dates parse from every printed form, and a 2-digit year is downgraded", () => {
  assert.deepEqual(parseAcordDate("01/01/2027"), { iso: "2027-01-01", confidence: 94 });
  assert.deepEqual(parseAcordDate("1/5/2027"), { iso: "2027-01-05", confidence: 94 });
  assert.deepEqual(parseAcordDate("2027-01-01"), { iso: "2027-01-01", confidence: 94 });
  const weak = parseAcordDate("01/01/27");
  assert.equal(weak.iso, "2027-01-01");
  assert.ok(weak.confidence < THRESHOLD, "an assumed century must fall below the review bar");
  assert.deepEqual(parseAcordDate("13/45/2027"), { iso: null, confidence: 0 });
  assert.deepEqual(parseAcordDate(null), { iso: null, confidence: 0 });
  assert.deepEqual(parseAcordDate("next Tuesday"), { iso: null, confidence: 0 });
});

/* ------------------------------------------------------- grammar over text */

test("a clean ACORD yields every line, and clears the review threshold", () => {
  const cert = extractFromText(sampleAcordText(compliantSample()));
  assert.equal(cert.carrier, "Grayline Mutual Casualty Company");
  assert.equal(cert.producer, "Harbor & Main Insurance Agency");
  assert.equal(cert.holder, "Harbor Ridge Management LLC");
  assert.deepEqual(
    cert.lines.map((l) => l.kind),
    ["gl_each_occurrence", "gl_aggregate", "auto_combined", "umbrella_each", "wc_each_accident"],
  );
  assert.equal(needsReview(cert, THRESHOLD), false);
  assert.deepEqual(lowConfidenceFields(cert, THRESHOLD), []);
});

test("limits land as integer cents against their printed labels", () => {
  const cert = extractFromText(sampleAcordText(compliantSample()));
  const byKind = Object.fromEntries(cert.lines.map((l) => [l.kind, l.limitCents]));
  assert.equal(byKind.gl_each_occurrence, 100_000_000);
  assert.equal(byKind.gl_aggregate, 200_000_000);
  assert.equal(byKind.auto_combined, 100_000_000);
  assert.equal(byKind.umbrella_each, 400_000_000);
  assert.equal(byKind.wc_each_accident, 100_000_000);
});

test("policy numbers, dates and checkboxes come off the row they belong to", () => {
  const cert = extractFromText(sampleAcordText(compliantSample()));
  const gl = cert.lines.find((l) => l.kind === "gl_each_occurrence")!;
  const wc = cert.lines.find((l) => l.kind === "wc_each_accident")!;
  assert.equal(gl.policyNumber, "GL-4471-22");
  assert.equal(wc.policyNumber, "WC-5512-08");
  assert.equal(gl.effectiveOn, "2026-01-01");
  assert.equal(gl.expiresOn, "2027-01-01");
  assert.equal(gl.additionalInsured, true);
  assert.equal(gl.waiverOfSubrogation, true);
  assert.equal(wc.additionalInsured, false);
});

test("a blank ADDL INSD column is null at zero confidence — never assumed", () => {
  const spec = compliantSample();
  spec.policies[0] = { ...spec.policies[0], addlInsured: "" };
  const cert = extractFromText(sampleAcordText(spec));
  const gl = cert.lines.find((l) => l.kind === "gl_each_occurrence")!;
  assert.equal(gl.additionalInsured, null);
  assert.equal(gl.fieldConfidence.additionalInsured, 0);
  assert.equal(needsReview(cert, THRESHOLD), true);
  assert.ok(
    lowConfidenceFields(cert, THRESHOLD).some((f) => f.field === "additionalInsured"),
    "the reviewer must be told which field",
  );
});

test("a missing expiry date produces a row with a null expiry, not a dropped line", () => {
  const spec = compliantSample();
  spec.policies[0] = { ...spec.policies[0], expiresOn: null };
  const cert = extractFromText(sampleAcordText(spec));
  const gl = cert.lines.find((l) => l.kind === "gl_each_occurrence")!;
  assert.equal(gl.expiresOn, null);
  assert.equal(gl.fieldConfidence.expiresOn, 0);
  assert.equal(needsReview(cert, THRESHOLD), true);
});

test("a policy row with no limit still produces a row the engine can fail", () => {
  const spec = compliantSample();
  spec.policies = [{ ...spec.policies[0], limits: [] }];
  const cert = extractFromText(sampleAcordText(spec));
  assert.equal(cert.lines.length, 1);
  assert.equal(cert.lines[0].kind, "gl_each_occurrence");
  assert.equal(cert.lines[0].limitCents, null);
  assert.equal(rowConfidence(cert.lines[0]), 0);
});

test("a two-digit year sends the certificate to review", () => {
  const spec = compliantSample();
  spec.policies = spec.policies.map((p) => ({ ...p, twoDigitYear: true }));
  const cert = extractFromText(sampleAcordText(spec));
  assert.equal(cert.lines[0].expiresOn, "2027-01-01");
  assert.equal(needsReview(cert, THRESHOLD), true);
});

test("dollar amounts in the description are not read as limits", () => {
  const spec = compliantSample({
    description:
      "Blanket additional insured per form CG2010. Contract value $250,000. Waiver of subrogation applies.",
  });
  const cert = extractFromText(sampleAcordText(spec));
  assert.equal(cert.lines.length, 5);
  assert.ok(!cert.lines.some((l) => l.limitCents === 25_000_000));
});

test("the description box's own words do not invent a coverage row", () => {
  // Found in the demo portfolio: "General liability per occurrence" in the
  // description-of-operations box opened a fifth policy block whose every field was
  // absent, which dragged a perfectly readable certificate into the review queue.
  const spec = compliantSample({
    description: "General liability per occurrence. No additional insured endorsement attached.",
  });
  const cert = extractFromText(sampleAcordText(spec));
  assert.deepEqual(
    cert.lines.map((l) => l.kind),
    ["gl_each_occurrence", "gl_aggregate", "auto_combined", "umbrella_each", "wc_each_accident"],
  );
  assert.equal(needsReview(cert, THRESHOLD), false);
});

test("the form's own title line does not close the coverage table", () => {
  // "ACORD 25 (2016/03)" is the first line of the form and also its footer. Treating
  // it as the end of the table dropped every policy row on the page.
  const cert = extractFromText(sampleAcordText(compliantSample()));
  assert.equal(cert.lines.length, 5);
});

test("garbage in yields nothing out — never a plausible-looking guess", () => {
  const cert = extractFromText("Dear Ms Alvarez,\n\nPlease find the invoice attached.\n\nThanks.");
  assert.deepEqual(cert.lines, []);
  assert.equal(cert.carrier, null);
  assert.equal(cert.holder, null);
  assert.equal(needsReview(cert, THRESHOLD), true);
});

/* ---------------------------------------------------- through a real PDF */

test("the full intake path: PDF bytes → text → coverage rows → compliant verdict", async () => {
  const bytes = await buildSampleAcordPdf(compliantSample());
  const read = extractPdfText(bytes);
  assert.ok(read.streams > 0, "the PDF must yield readable text");
  assert.equal(read.partial, false);

  const cert = extractFromText(read.text);
  assert.equal(cert.holder, "Harbor Ridge Management LLC");
  assert.equal(needsReview(cert, THRESHOLD), false);

  const verdict = evaluate({
    template: { lines: STANDARD_VENDOR, flags: { additionalInsured: true, waiverOfSubrogation: true } },
    coverages: cert.lines,
    holder: {
      found: cert.holder,
      ok: holderMatches(cert.holder, "Harbor Ridge Management LLC"),
      expected: "Harbor Ridge Management LLC",
    },
    today: "2026-08-03",
  });
  assert.equal(verdict.status, "compliant");
  assert.deepEqual(verdict.deficiencies, []);
});

test("the deficient sample produces the exact sentences the product promises", async () => {
  const bytes = await buildSampleAcordPdf(deficientSample());
  const cert = extractFromText(extractPdfText(bytes).text);
  const verdict = evaluate({
    template: { lines: STANDARD_VENDOR, flags: { additionalInsured: true } },
    coverages: cert.lines,
    holder: {
      found: cert.holder,
      ok: holderMatches(cert.holder, "Harbor Ridge Management LLC"),
      expected: "Harbor Ridge Management LLC",
    },
    today: "2026-08-03",
  });
  assert.equal(verdict.status, "deficient");
  const reasons = verdict.deficiencies.map((d) => d.reason);
  assert.ok(
    reasons.includes("GL each occurrence $500,000 is below the required $1,000,000."),
    reasons.join(" | "),
  );
  assert.ok(
    reasons.includes("GL aggregate $1,000,000 is below the required $2,000,000."),
    reasons.join(" | "),
  );
  assert.ok(
    reasons.includes(
      "GL each occurrence does not grant additional-insured status, which this engagement requires.",
    ),
    reasons.join(" | "),
  );
  assert.equal(verdict.soonestExpiry, "2026-08-20");
  assert.equal(verdict.daysToExpiry, 17);
});

test("a PDF with no text at all is a failure, not an empty form", () => {
  const notAPdf = Buffer.from("%PDF-1.7\n% a scanned page with no text layer\n%%EOF\n");
  const read = extractPdfText(notAPdf);
  assert.equal(read.streams, 0);
  assert.equal(read.text, "");
});

/* ------------------------------------------------------------------ holder */

test("holder matching tolerates abbreviations but never invents a match", () => {
  assert.equal(holderMatches("Harbor Ridge Management LLC", "Harbor Ridge Management LLC"), true);
  assert.equal(holderMatches("Harbor Ridge Mgmt, LLC", "Harbor Ridge Management LLC"), true);
  assert.equal(holderMatches("HARBOR RIDGE MANAGEMENT L.L.C.", "Harbor Ridge Management LLC"), true);
  assert.equal(holderMatches("Meridian Property Group", "Harbor Ridge Management LLC"), false);
  assert.equal(holderMatches(null, "Harbor Ridge Management LLC"), null);
  assert.equal(holderMatches("Harbor Ridge Management LLC", null), null);
});

/* ------------------------------------------------------ multi-vendor sanity */

test("every sample preset round-trips through a PDF without losing a line", async () => {
  const specs: SampleAcord[] = [compliantSample(), deficientSample()];
  for (const spec of specs) {
    const bytes = await buildSampleAcordPdf(spec);
    const cert = extractFromText(extractPdfText(bytes).text);
    assert.equal(
      cert.lines.length >= spec.policies.length,
      true,
      `${spec.insured}: ${cert.lines.length} rows for ${spec.policies.length} policies`,
    );
    assert.ok(cert.lines.every((l) => l.policyNumber), `${spec.insured}: every row needs a policy`);
  }
});
