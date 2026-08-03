/**
 * The compliance engine's test suite — the centrepiece.
 *
 * Every deficiency sentence is asserted **verbatim**, because the sentence is what
 * a coordinator forwards to an insurance agent. A reworded sentence is a product
 * change, and it should break a test.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluate, blocksWork, verdictSummary, type CoverageFacts } from "./compliance";
import type { RequirementLine } from "@/db/schema";

const TODAY = "2026-08-03";

const GL: RequirementLine = {
  coverage: "gl_each_occurrence",
  label: "GL each occurrence",
  minCents: 100_000_000, // $1,000,000
};
const AGG: RequirementLine = {
  coverage: "gl_aggregate",
  label: "GL aggregate",
  minCents: 200_000_000,
};
const AUTO: RequirementLine = {
  coverage: "auto_combined",
  label: "Auto combined single limit",
  minCents: 100_000_000,
};
const WC: RequirementLine = {
  coverage: "wc_each_accident",
  label: "Workers' comp each accident",
  minCents: 50_000_000,
};

function cov(over: Partial<CoverageFacts> & { kind: CoverageFacts["kind"] }): CoverageFacts {
  return {
    limitCents: 100_000_000,
    effectiveOn: "2026-01-01",
    expiresOn: "2027-01-01",
    additionalInsured: true,
    waiverOfSubrogation: true,
    ...over,
  };
}

/* ----------------------------------------------------------------- happy path */

test("all lines met, more than 30 days out → compliant with no deficiencies", () => {
  const v = evaluate({
    template: { lines: [GL, AGG], flags: {} },
    coverages: [
      cov({ kind: "gl_each_occurrence" }),
      cov({ kind: "gl_aggregate", limitCents: 200_000_000 }),
    ],
    today: TODAY,
  });
  assert.equal(v.status, "compliant");
  assert.deepEqual(v.deficiencies, []);
  assert.equal(v.soonestExpiry, "2027-01-01");
  assert.equal(v.daysToExpiry, 151);
  assert.equal(blocksWork(v.status), false);
  assert.equal(verdictSummary(v), "Compliant through Jan 1, 2027");
});

test("a limit exactly at the minimum is compliant", () => {
  const v = evaluate({
    template: { lines: [GL], flags: {} },
    coverages: [cov({ kind: "gl_each_occurrence", limitCents: 100_000_000 })],
    today: TODAY,
  });
  assert.equal(v.status, "compliant");
});

/* ------------------------------------------------------------------- missing */

test("no certificate at all → missing, with the named reason", () => {
  const v = evaluate({ template: { lines: [GL], flags: {} }, coverages: null, today: TODAY });
  assert.equal(v.status, "missing");
  assert.deepEqual(v.deficiencies, [
    { line: "Certificate", reason: "No certificate of insurance is on file for this engagement." },
  ]);
  assert.equal(v.soonestExpiry, null);
  assert.equal(blocksWork(v.status), true);
});

test("a required line absent from the certificate is named, not silently passed", () => {
  const v = evaluate({
    template: { lines: [GL, AUTO], flags: {} },
    coverages: [cov({ kind: "gl_each_occurrence" })],
    today: TODAY,
  });
  assert.equal(v.status, "deficient");
  assert.deepEqual(v.deficiencies, [
    {
      line: "Auto combined single limit",
      reason: "Auto combined single limit is not evidenced on this certificate.",
    },
  ]);
});

test("an empty certificate (parse produced no lines) fails every required line", () => {
  const v = evaluate({
    template: { lines: [GL, WC], flags: {} },
    coverages: [],
    today: TODAY,
  });
  assert.equal(v.status, "deficient");
  assert.equal(v.deficiencies.length, 2);
  assert.equal(v.soonestExpiry, null);
});

test("a template with no lines refuses to certify anything", () => {
  const v = evaluate({ template: { lines: [], flags: {} }, coverages: [], today: TODAY });
  assert.equal(v.status, "deficient");
  assert.match(v.deficiencies[0].reason, /lists no coverage lines/);
});

/* -------------------------------------------------------------------- limits */

test("a short limit renders the README's exact sentence shape", () => {
  const v = evaluate({
    template: { lines: [GL], flags: {} },
    coverages: [cov({ kind: "gl_each_occurrence", limitCents: 50_000_000 })],
    today: TODAY,
  });
  assert.equal(v.status, "deficient");
  assert.deepEqual(v.deficiencies, [
    {
      line: "GL each occurrence",
      reason: "GL each occurrence $500,000 is below the required $1,000,000.",
    },
  ]);
});

test("a line with no limit at all names the requirement it failed to meet", () => {
  const v = evaluate({
    template: { lines: [GL], flags: {} },
    coverages: [cov({ kind: "gl_each_occurrence", limitCents: null })],
    today: TODAY,
  });
  assert.deepEqual(v.deficiencies, [
    {
      line: "GL each occurrence",
      reason: "GL each occurrence carries no limit on this certificate; $1,000,000 is required.",
    },
  ]);
});

test("an umbrella does not stack onto a short underlying line", () => {
  const v = evaluate({
    template: { lines: [GL], flags: {} },
    coverages: [
      cov({ kind: "gl_each_occurrence", limitCents: 50_000_000 }),
      cov({ kind: "umbrella_each", limitCents: 400_000_000 }),
    ],
    today: TODAY,
  });
  assert.equal(v.status, "deficient");
  assert.match(v.deficiencies[0].reason, /\$500,000 is below the required \$1,000,000/);
});

/* --------------------------------------------------------------------- dates */

test("expiry in the past → expired, with the number of days named", () => {
  const v = evaluate({
    template: { lines: [GL], flags: {} },
    coverages: [cov({ kind: "gl_each_occurrence", expiresOn: "2026-07-15" })],
    today: TODAY,
  });
  assert.equal(v.status, "expired");
  assert.deepEqual(v.deficiencies, [
    {
      line: "GL each occurrence",
      reason: "GL each occurrence expired on Jul 15, 2026, 19 days ago.",
    },
  ]);
});

test("expiry today is not yet expired", () => {
  const v = evaluate({
    template: { lines: [GL], flags: {} },
    coverages: [cov({ kind: "gl_each_occurrence", expiresOn: TODAY })],
    today: TODAY,
  });
  assert.equal(v.status, "expiring");
  assert.equal(v.daysToExpiry, 0);
});

test("expiry inside 30 days → expiring, and still not blocking work", () => {
  const v = evaluate({
    template: { lines: [GL], flags: {} },
    coverages: [cov({ kind: "gl_each_occurrence", expiresOn: "2026-08-20" })],
    today: TODAY,
  });
  assert.equal(v.status, "expiring");
  assert.equal(v.daysToExpiry, 17);
  assert.deepEqual(v.deficiencies, []);
  assert.equal(blocksWork(v.status), false);
  assert.equal(verdictSummary(v), "Expires in 17 days on Aug 20, 2026");
});

test("day 31 is compliant, day 30 is expiring — the window boundary", () => {
  const at = (expiresOn: string) =>
    evaluate({
      template: { lines: [GL], flags: {} },
      coverages: [cov({ kind: "gl_each_occurrence", expiresOn })],
      today: TODAY,
    }).status;
  assert.equal(at("2026-09-02"), "expiring"); // 30 days
  assert.equal(at("2026-09-03"), "compliant"); // 31 days
});

test("a policy not yet effective is deficient, naming the start date", () => {
  const v = evaluate({
    template: { lines: [GL], flags: {} },
    coverages: [cov({ kind: "gl_each_occurrence", effectiveOn: "2026-09-01" })],
    today: TODAY,
  });
  assert.equal(v.status, "deficient");
  assert.deepEqual(v.deficiencies, [
    {
      line: "GL each occurrence",
      reason: "GL each occurrence does not take effect until Sep 1, 2026.",
    },
  ]);
});

test("a missing expiry date is a named deficiency, not an assumed pass", () => {
  const v = evaluate({
    template: { lines: [GL], flags: {} },
    coverages: [cov({ kind: "gl_each_occurrence", expiresOn: null })],
    today: TODAY,
  });
  assert.equal(v.status, "deficient");
  assert.deepEqual(v.deficiencies, [
    { line: "GL each occurrence", reason: "GL each occurrence carries no expiry date on this certificate." },
  ]);
  assert.equal(v.soonestExpiry, null);
});

test("soonest expiry across lines drives the cycle, not the first line", () => {
  const v = evaluate({
    template: { lines: [GL, AUTO], flags: {} },
    coverages: [
      cov({ kind: "gl_each_occurrence", expiresOn: "2027-03-01" }),
      cov({ kind: "auto_combined", expiresOn: "2026-11-30" }),
    ],
    today: TODAY,
  });
  assert.equal(v.soonestExpiry, "2026-11-30");
});

test("a renewed row beside the expiring one wins the match", () => {
  const v = evaluate({
    template: { lines: [GL], flags: {} },
    coverages: [
      cov({ kind: "gl_each_occurrence", expiresOn: "2026-07-01" }),
      cov({ kind: "gl_each_occurrence", expiresOn: "2027-07-01" }),
    ],
    today: TODAY,
  });
  assert.equal(v.status, "compliant");
  assert.equal(v.soonestExpiry, "2027-07-01");
});

test("expired outranks deficient when both are true", () => {
  const v = evaluate({
    template: { lines: [GL], flags: {} },
    coverages: [cov({ kind: "gl_each_occurrence", limitCents: 50_000_000, expiresOn: "2026-01-01" })],
    today: TODAY,
  });
  assert.equal(v.status, "expired");
  assert.equal(v.deficiencies.length, 2);
});

/* --------------------------------------------------------------------- flags */

test("additional-insured not evidenced is named on the GL line", () => {
  const v = evaluate({
    template: { lines: [GL], flags: { additionalInsured: true } },
    coverages: [cov({ kind: "gl_each_occurrence", additionalInsured: null })],
    today: TODAY,
  });
  assert.deepEqual(v.deficiencies, [
    {
      line: "GL each occurrence",
      reason: "Additional-insured status is required and is not evidenced on the GL each occurrence line.",
    },
  ]);
});

test("additional-insured explicitly not granted reads differently from unreadable", () => {
  const v = evaluate({
    template: { lines: [GL], flags: { additionalInsured: true } },
    coverages: [cov({ kind: "gl_each_occurrence", additionalInsured: false })],
    today: TODAY,
  });
  assert.deepEqual(v.deficiencies, [
    {
      line: "GL each occurrence",
      reason:
        "GL each occurrence does not grant additional-insured status, which this engagement requires.",
    },
  ]);
});

test("waiver of subrogation is checked on GL and workers' comp", () => {
  const v = evaluate({
    template: { lines: [GL, WC], flags: { waiverOfSubrogation: true } },
    coverages: [
      cov({ kind: "gl_each_occurrence", waiverOfSubrogation: true }),
      cov({ kind: "wc_each_accident", limitCents: 50_000_000, waiverOfSubrogation: false }),
    ],
    today: TODAY,
  });
  assert.deepEqual(v.deficiencies, [
    {
      line: "Workers' comp each accident",
      reason:
        "Workers' comp each accident does not include a waiver of subrogation, which this engagement requires.",
    },
  ]);
});

test("flags fall back to the first required line when the template has no GL or WC", () => {
  const v = evaluate({
    template: { lines: [AUTO], flags: { additionalInsured: true, waiverOfSubrogation: true } },
    coverages: [cov({ kind: "auto_combined", additionalInsured: null, waiverOfSubrogation: null })],
    today: TODAY,
  });
  assert.equal(v.deficiencies.length, 2);
  assert.ok(v.deficiencies.every((d) => d.line === "Auto combined single limit"));
});

test("a flag is not re-reported for a line already missing entirely", () => {
  const v = evaluate({
    template: { lines: [GL], flags: { additionalInsured: true, waiverOfSubrogation: true } },
    coverages: [],
    today: TODAY,
  });
  assert.deepEqual(v.deficiencies, [
    { line: "GL each occurrence", reason: "GL each occurrence is not evidenced on this certificate." },
  ]);
});

test("primary-and-non-contributory is recorded but never evaluated", () => {
  const v = evaluate({
    template: { lines: [GL], flags: { primaryNonContributory: true } },
    coverages: [cov({ kind: "gl_each_occurrence" })],
    today: TODAY,
  });
  assert.equal(v.status, "compliant");
  assert.deepEqual(v.deficiencies, []);
});

/* -------------------------------------------------------------------- holder */

test("a wrong certificate holder quotes what the form actually says", () => {
  const v = evaluate({
    template: { lines: [GL], flags: {} },
    coverages: [cov({ kind: "gl_each_occurrence" })],
    holder: { found: "Meridian Property Group", ok: false, expected: "Harbor Ridge Management LLC" },
    today: TODAY,
  });
  assert.deepEqual(v.deficiencies, [
    {
      line: "Certificate holder",
      reason:
        'The certificate holder reads "Meridian Property Group", not Harbor Ridge Management LLC.',
    },
  ]);
});

test("an unreadable holder is a deficiency, never an assumed match", () => {
  const v = evaluate({
    template: { lines: [GL], flags: {} },
    coverages: [cov({ kind: "gl_each_occurrence" })],
    holder: { found: null, ok: null, expected: "Harbor Ridge Management LLC" },
    today: TODAY,
  });
  assert.equal(v.status, "deficient");
  assert.match(v.deficiencies[0].reason, /could not be read from the form/);
});

test("a blank holder on the form names who it should have named", () => {
  const v = evaluate({
    template: { lines: [GL], flags: {} },
    coverages: [cov({ kind: "gl_each_occurrence" })],
    holder: { found: null, ok: false, expected: "Harbor Ridge Management LLC" },
    today: TODAY,
  });
  assert.equal(
    v.deficiencies[0].reason,
    "The certificate names no holder; it must name Harbor Ridge Management LLC.",
  );
});

test("a matching holder adds nothing", () => {
  const v = evaluate({
    template: { lines: [GL], flags: {} },
    coverages: [cov({ kind: "gl_each_occurrence" })],
    holder: { found: "Harbor Ridge Management LLC", ok: true, expected: "Harbor Ridge Management LLC" },
    today: TODAY,
  });
  assert.equal(v.status, "compliant");
});

/* ------------------------------------------------------------------ rollups */

test("the multi-deficiency summary counts the rest instead of truncating", () => {
  const v = evaluate({
    template: { lines: [GL, AUTO], flags: {} },
    coverages: [cov({ kind: "gl_each_occurrence", limitCents: 25_000_000 })],
    today: TODAY,
  });
  assert.equal(v.deficiencies.length, 2);
  assert.equal(
    verdictSummary(v),
    "GL each occurrence $250,000 is below the required $1,000,000. (+1 more)",
  );
});

test("every failing verdict blocks work; expiring and compliant do not", () => {
  assert.equal(blocksWork("deficient"), true);
  assert.equal(blocksWork("expired"), true);
  assert.equal(blocksWork("missing"), true);
  assert.equal(blocksWork("expiring"), false);
  assert.equal(blocksWork("compliant"), false);
});

test("the engine is a pure function of its inputs — same input, same verdict", () => {
  const input = {
    template: { lines: [GL, AGG, AUTO, WC], flags: { additionalInsured: true } },
    coverages: [
      cov({ kind: "gl_each_occurrence" }),
      cov({ kind: "gl_aggregate", limitCents: 150_000_000 }),
      cov({ kind: "auto_combined" }),
      cov({ kind: "wc_each_accident", limitCents: 50_000_000 }),
    ],
    today: TODAY,
  };
  assert.deepEqual(evaluate(input), evaluate(input));
});
