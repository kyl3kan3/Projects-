import test from "node:test";
import assert from "node:assert/strict";
import { blocking, route, validateLine, type ValidationContext } from "./validators";
import { AUTO_ACCEPT_BP } from "./extraction";

const ctx = (over: Partial<ValidationContext> = {}): ValidationContext => ({
  siteId: "site-1",
  year: 2025,
  floorAreaSqm: 1_200,
  existing: [],
  documentId: "doc-new",
  ...over,
});

const line = (over: Partial<Parameters<typeof validateLine>[0]> = {}) => ({
  category: "electricity_kwh" as const,
  quantityMilli: 14_400_000, // 14,400 kWh = 12 kWh/m²/month at 1,200 m²
  serviceStart: "2025-03-01",
  serviceEnd: "2025-03-31",
  provider: "Consolidated Edison",
  ...over,
});

test("a plausible monthly electricity bill raises nothing", () => {
  assert.deepEqual(validateLine(line(), ctx()), []);
});

test("a CCF quantity read as kWh is caught by the intensity band", () => {
  // 1,240 CCF is ~37,700 kWh. Read as 1,240 kWh at a 1,200 m² site it is 1.03
  // kWh/m²/month — inside the band. The dangerous direction is the other one:
  // a gas quantity in kWh landing on an electricity meter.
  const issues = validateLine(line({ quantityMilli: 400_000_000 }), ctx());
  assert.ok(blocking(issues));
  assert.ok(issues.some((i) => i.kind === "intensity_out_of_band"));
});

test("an absurd absolute quantity blocks even with no floor area", () => {
  const issues = validateLine(line({ quantityMilli: 9_000_000_000 }), ctx({ floorAreaSqm: 0 }));
  assert.ok(issues.some((i) => i.kind === "unit_out_of_band" && i.severity === "block"));
});

test("the intensity band is skipped, not guessed, when floor area is unknown", () => {
  assert.deepEqual(validateLine(line(), ctx({ floorAreaSqm: 0 })), []);
});

test("a period that runs backwards blocks", () => {
  const issues = validateLine(
    line({ serviceStart: "2025-03-31", serviceEnd: "2025-03-01" }),
    ctx(),
  );
  assert.ok(issues.some((i) => i.kind === "period_length" && i.severity === "block"));
});

test("a five-day period warns but does not block", () => {
  const issues = validateLine(
    line({ serviceStart: "2025-03-01", serviceEnd: "2025-03-06", quantityMilli: 2_400_000 }),
    ctx(),
  );
  assert.ok(issues.some((i) => i.kind === "period_length" && i.severity === "warn"));
  assert.equal(blocking(issues), false);
});

test("a bill from the wrong year blocks", () => {
  const issues = validateLine(
    line({ serviceStart: "2023-03-01", serviceEnd: "2023-03-31" }),
    ctx(),
  );
  assert.ok(issues.some((i) => i.kind === "period_outside_year"));
});

test("a period straddling New Year is accepted", () => {
  const issues = validateLine(
    line({ serviceStart: "2024-12-18", serviceEnd: "2025-01-17" }),
    ctx(),
  );
  assert.equal(blocking(issues), false);
});

test("the same provider and period at the same site is a duplicate", () => {
  const issues = validateLine(
    line(),
    ctx({
      existing: [
        {
          documentId: "doc-old",
          siteId: "site-1",
          category: "electricity_kwh",
          serviceStart: "2025-03-01",
          serviceEnd: "2025-03-31",
          provider: "Consolidated Edison",
        },
      ],
    }),
  );
  assert.ok(issues.some((i) => i.kind === "duplicate_document"));
});

test("an overlapping but not identical period is flagged as an overlap", () => {
  const issues = validateLine(
    line({ serviceStart: "2025-03-15", serviceEnd: "2025-04-14" }),
    ctx({
      existing: [
        {
          documentId: "doc-old",
          siteId: "site-1",
          category: "electricity_kwh",
          serviceStart: "2025-03-01",
          serviceEnd: "2025-03-31",
          provider: "Consolidated Edison",
        },
      ],
    }),
  );
  assert.ok(issues.some((i) => i.kind === "period_overlap"));
});

test("a gas bill does not collide with an electricity bill for the same month", () => {
  const issues = validateLine(
    line({ category: "natural_gas_kwh", quantityMilli: 23_791_681, provider: "National Grid" }),
    ctx({
      existing: [
        {
          documentId: "doc-old",
          siteId: "site-1",
          category: "electricity_kwh",
          serviceStart: "2025-03-01",
          serviceEnd: "2025-03-31",
          provider: "Consolidated Edison",
        },
      ],
    }),
  );
  assert.equal(blocking(issues), false);
});

test("re-validating the same document does not collide with its own lines", () => {
  const issues = validateLine(
    line(),
    ctx({
      documentId: "doc-old",
      existing: [
        {
          documentId: "doc-old",
          siteId: "site-1",
          category: "electricity_kwh",
          serviceStart: "2025-03-01",
          serviceEnd: "2025-03-31",
          provider: "Consolidated Edison",
        },
      ],
    }),
  );
  assert.deepEqual(issues, []);
});

test("another site's March bill is not a duplicate", () => {
  const issues = validateLine(
    line(),
    ctx({
      existing: [
        {
          documentId: "doc-old",
          siteId: "site-2",
          category: "electricity_kwh",
          serviceStart: "2025-03-01",
          serviceEnd: "2025-03-31",
          provider: "Consolidated Edison",
        },
      ],
    }),
  );
  assert.deepEqual(issues, []);
});

test("routing: high confidence and no blocker accepts", () => {
  assert.equal(route(9_800, [], AUTO_ACCEPT_BP), "accepted");
});

test("routing: a blocker beats any confidence", () => {
  const issues = validateLine(line({ quantityMilli: 9_000_000_000 }), ctx({ floorAreaSqm: 0 }));
  assert.equal(route(10_000, issues, AUTO_ACCEPT_BP), "needs_review");
});

test("routing: confidence exactly at the threshold accepts, one basis point below does not", () => {
  assert.equal(route(AUTO_ACCEPT_BP, [], AUTO_ACCEPT_BP), "accepted");
  assert.equal(route(AUTO_ACCEPT_BP - 1, [], AUTO_ACCEPT_BP), "needs_review");
});
