/**
 * Checklist planning and progress. The pure half of the engine — which is the half
 * that decides what a crew is told to do.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { checklistProgress, planChecklistItems } from "./checklists";
import type { RequirementRecord } from "@/db/schema";

const MESA = { name: "City of Mesa", departmentName: "Development Services" };

const RECORD: Pick<
  RequirementRecord,
  | "permitsRequired"
  | "submittalRequirements"
  | "fees"
  | "reviewTimeline"
  | "inspectionSequence"
  | "inspectionContact"
  | "inspectionLeadTimeDays"
  | "reinspectionFeeCents"
  | "jobType"
> = {
  jobType: "hvac_changeout",
  permitsRequired: ["Mechanical permit"],
  submittalRequirements: [
    { title: "Equipment cut sheets", detail: "Model numbers and rated capacity", required: true },
    { title: "Manual J load calculation", detail: "Required above 5 tons", required: false },
  ],
  fees: [
    { label: "Mechanical permit fee", amountCents: 8_900 },
    { label: "State construction technology fee", amountCents: 200 },
  ],
  reviewTimeline: "Over the counter, same day",
  inspectionSequence: ["Mechanical final"],
  inspectionContact: "Inspection line (480) 644-2061",
  inspectionLeadTimeDays: 1,
  reinspectionFeeCents: 6_500,
};

test("a record expands into permit, document, fee, inspection and licence items", () => {
  const items = planChecklistItems(RECORD, MESA);
  assert.deepEqual(
    items.map((i) => i.kind),
    ["permit", "document", "document", "fee", "inspection_note", "license_check"],
  );
  assert.deepEqual(
    items.map((i) => i.position),
    [0, 1, 2, 3, 4, 5],
  );
});

test("the fee item carries the schedule total, summed in cents", () => {
  const fee = planChecklistItems(RECORD, MESA).find((i) => i.kind === "fee");
  assert.ok(fee);
  assert.equal(fee.title, "Permit fees — $91");
  assert.match(fee.detail, /Mechanical permit fee \$89/);
});

test("conditional submittals are marked so they can be stamped n/a honestly", () => {
  const items = planChecklistItems(RECORD, MESA);
  const loadCalc = items.find((i) => i.title === "Manual J load calculation");
  assert.ok(loadCalc);
  assert.match(loadCalc.detail, /^Conditional — /);
});

test("the inspection item spells out who to call, lead time, and reinspection cost", () => {
  const inspection = planChecklistItems(RECORD, MESA).find((i) => i.kind === "inspection_note");
  assert.ok(inspection);
  assert.equal(inspection.title, "Book mechanical final");
  assert.equal(
    inspection.detail,
    "Inspection line (480) 644-2061 · book 1 day ahead · reinspection $65",
  );
});

test("item slugs are stable across regeneration so stamps survive a new version", () => {
  const before = planChecklistItems(RECORD, MESA).map((i) => i.slug);
  // A new version adds a submittal and raises the fee; the other slugs must not move.
  const after = planChecklistItems(
    {
      ...RECORD,
      fees: [{ label: "Mechanical permit fee", amountCents: 9_600 }],
      submittalRequirements: [
        ...RECORD.submittalRequirements,
        { title: "Duct leakage test report", detail: "Required on replacements", required: true },
      ],
    },
    MESA,
  ).map((i) => i.slug);

  for (const slug of before) assert.ok(after.includes(slug), `${slug} should survive regeneration`);
  assert.ok(after.includes("doc:duct-leakage-test-report"));
});

test("an exempt scope produces just the licence check — no invented permit", () => {
  const items = planChecklistItems(
    {
      ...RECORD,
      jobType: "window_replacement",
      permitsRequired: [],
      submittalRequirements: [],
      fees: [],
      inspectionSequence: [],
      reviewTimeline: "No permit required for this scope",
    },
    MESA,
  );
  assert.deepEqual(
    items.map((i) => i.kind),
    ["license_check"],
  );
});

test("progress counts verified against everything still in play", () => {
  const states = [
    { state: "verified" as const },
    { state: "verified" as const },
    { state: "open" as const },
    { state: "na" as const },
  ];
  const progress = checklistProgress(states);
  assert.equal(progress.verified, 2);
  assert.equal(progress.total, 3); // the n/a item leaves the denominator
  assert.equal(progress.naCount, 1);
  assert.equal(progress.complete, false);
});

test("a checklist whose remaining items are all verified is complete", () => {
  const progress = checklistProgress([
    { state: "verified" },
    { state: "na" },
    { state: "verified" },
  ]);
  assert.equal(progress.verified, 2);
  assert.equal(progress.total, 2);
  assert.equal(progress.complete, true);
});

test("an all-n/a checklist is not 'ready to submit'", () => {
  const progress = checklistProgress([{ state: "na" }, { state: "na" }]);
  assert.equal(progress.total, 0);
  assert.equal(progress.complete, false);
});
