import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adverseActionLetter,
  applicationSummary,
  assertTransition,
  canTransition,
  incomeRatio,
  incomeRatioLabel,
  meetsIncomeRequirement,
  nextStates,
  requiresAdverseAction,
  statusLabel,
} from "@/lib/application-pipeline";

describe("pipeline transitions", () => {
  it("allows the moves the product supports", () => {
    assert.equal(canTransition("new", "invited_to_screen"), true);
    assert.equal(canTransition("new", "approved"), true);
    assert.equal(canTransition("new", "declined"), true);
    assert.equal(canTransition("invited_to_screen", "screened"), true);
    assert.equal(canTransition("screened", "approved"), true);
  });

  it("refuses to walk backwards", () => {
    assert.equal(canTransition("screened", "new"), false);
    assert.equal(canTransition("invited_to_screen", "new"), false);
  });

  it("treats approved and declined as final", () => {
    assert.deepEqual(nextStates("approved"), []);
    assert.deepEqual(nextStates("declined"), []);
    assert.throws(() => assertTransition("declined", "approved"), /cannot go from Declined to Approved/);
    assert.throws(() => assertTransition("approved", "declined"));
  });

  it("names states in words a landlord would use", () => {
    assert.equal(statusLabel("invited_to_screen"), "Invited to screen");
    assert.equal(statusLabel("screened"), "Screening on file");
  });
});

describe("requiresAdverseAction", () => {
  it("requires the notice whenever a screening record exists", () => {
    assert.equal(requiresAdverseAction("new", true), true);
    assert.equal(requiresAdverseAction("screened", true), true);
  });

  it("requires it once the applicant was invited, even before a report arrives", () => {
    // The landlord may already have seen something. Erring toward the notice
    // costs two minutes; erring away from it costs a statutory claim.
    assert.equal(requiresAdverseAction("invited_to_screen", false), true);
    assert.equal(requiresAdverseAction("screened", false), true);
  });

  it("does not require it for a plain no-screening decline", () => {
    assert.equal(requiresAdverseAction("new", false), false);
  });
});

describe("income ratio", () => {
  it("rounds down so a 2.99x applicant never reads as 3.0x", () => {
    assert.equal(incomeRatio(553_000, 185_000), 2.9);
    assert.equal(incomeRatioLabel(553_000, 185_000), "2.9× RENT");
    assert.equal(incomeRatio(630_000, 185_000), 3.4);
  });

  it("returns null rather than Infinity or NaN", () => {
    assert.equal(incomeRatio(500_000, 0), null);
    assert.equal(incomeRatio(0, 185_000), null);
    assert.equal(incomeRatioLabel(0, 185_000), "INCOME NOT STATED");
  });

  it("compares against the landlord's own published bar", () => {
    assert.equal(meetsIncomeRequirement(630_000, 185_000, 3), true);
    assert.equal(meetsIncomeRequirement(553_000, 185_000, 3), false);
    // Exactly on the line clears it.
    assert.equal(meetsIncomeRequirement(555_000, 185_000, 3), true);
    assert.equal(meetsIncomeRequirement(630_000, 185_000, 0), null);
    assert.equal(meetsIncomeRequirement(0, 185_000, 3), null);
  });

  it("summarises a card line without editorialising", () => {
    const summary = applicationSummary(630_000, 185_000, 2);
    assert.equal(summary, "$6,300.00/mo stated · 3.4× RENT · 2 occupants");
    assert.doesNotMatch(summary, /good|strong|risk|poor|recommend/i);
  });
});

describe("adverse-action letter", () => {
  const base = {
    applicantName: "Owen Pratt",
    propertyLine: "1A at 114 Maple Street",
    landlordName: "Ray Doyle",
    landlordContact: "ray@example.com",
    reason: "Stated income is below the 3x requirement on the listing.",
    reportUsed: true,
    agencyName: "TransUnion Rental Screening Solutions",
    agencyAddress: "PO Box 2000, Chester PA 19016",
    agencyPhone: "833-458-6338",
    dateLine: "2026-08-20",
  };

  it("carries all four FCRA disclosures when a report was used", () => {
    const letter = adverseActionLetter(base);
    assert.match(letter, /not able to offer you the tenancy/);
    assert.match(letter, /TransUnion Rental Screening Solutions, PO Box 2000, Chester PA 19016, 833-458-6338/);
    assert.match(letter, /did not make this decision and cannot explain why/);
    assert.match(letter, /free copy of your report .* within 60 days/);
    assert.match(letter, /dispute/);
  });

  it("uses the landlord's own words as the reason and adds none of its own", () => {
    const letter = adverseActionLetter(base);
    assert.match(letter, /Reason: Stated income is below the 3x requirement on the listing\./);
    assert.doesNotMatch(letter, /credit score|risk|we determined|our system/i);
  });

  it("leaves obvious placeholders when the agency is unknown", () => {
    const letter = adverseActionLetter({ ...base, agencyName: "", agencyAddress: "", agencyPhone: "" });
    assert.match(letter, /\[name of the screening company you used\]/);
    assert.match(letter, /\[their address\]/);
  });

  it("omits the report disclosures entirely when no report was used", () => {
    const letter = adverseActionLetter({ ...base, reportUsed: false });
    assert.doesNotMatch(letter, /consumer report/);
    assert.doesNotMatch(letter, /60 days/);
    assert.match(letter, /Dear Owen Pratt/);
    assert.match(letter, /Ray Doyle/);
  });

  it("still addresses and signs the letter when the reason is blank", () => {
    const letter = adverseActionLetter({ ...base, reason: "   ", reportUsed: false });
    assert.doesNotMatch(letter, /Reason:/);
    assert.match(letter, /I wish you well/);
  });
});
