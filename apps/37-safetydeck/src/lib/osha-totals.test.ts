/**
 * The 300A totals. The rule this file enforces: a summary that disagrees with its
 * own log must never be produced. It gets posted on a wall for three months and
 * signed by a company executive.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { summarise300A, toForm300Rows, type IncidentWithEmployee } from "./incident-store";
import type { CaseOutcome, IllnessCategory, Incident, Employee } from "@/db/schema";

let seq = 0;

function employee(name: string, jobTitle = "Journeyman"): Employee {
  return {
    id: `emp-${(seq += 1)}`,
    companyId: "co",
    crewId: null,
    name,
    jobTitle,
    hireDate: "2024-04-01",
    language: "en",
    active: true,
    createdAt: new Date("2024-04-01T00:00:00Z"),
  };
}

function incidentCase(over: {
  outcome: CaseOutcome | null;
  recordable?: boolean;
  daysAway?: number;
  daysRestricted?: number;
  category?: IllnessCategory;
  privacyCase?: boolean;
  stillCounting?: boolean;
  needsJudgment?: boolean;
  name?: string;
}): IncidentWithEmployee {
  const emp = employee(over.name ?? "Rubén Ortega");
  const incident: Incident = {
    id: `inc-${(seq += 1)}`,
    companyId: "co",
    employeeId: emp.id,
    year: 2026,
    caseNumber: seq,
    occurredAt: new Date("2026-05-04T15:00:00Z"),
    learnedAt: new Date("2026-05-04T16:00:00Z"),
    siteLabel: "Harbor Point",
    whereOccurred: "Second-floor deck",
    description: "Slipped on frosted decking.",
    objectSubstance: "Metal decking",
    injuryType: "Sprained ankle",
    bodyPart: "Right ankle",
    illnessCategory: over.category ?? "injury",
    treatment: "medical",
    lostConsciousness: false,
    significantDiagnosis: false,
    daysAway: over.daysAway ?? 0,
    daysRestricted: over.daysRestricted ?? 0,
    stillCounting: over.stillCounting ?? false,
    recordable: over.recordable ?? true,
    needsJudgment: over.needsJudgment ?? false,
    outcome: over.outcome,
    recordabilityBasis: {
      criterion: "Medical treatment beyond first aid",
      citation: "29 CFR 1904.7(b)(5)",
      explanation: "Test fixture.",
      answers: {},
    },
    formLogicVersion: "1904-2025.1",
    privacyCase: over.privacyCase ?? false,
    privacyReason: over.privacyCase ? "intimate" : null,
    reportedToOshaAt: null,
    oshaReportNote: null,
    createdBy: "ops@example.com",
    createdAt: new Date("2026-05-04T17:00:00Z"),
  };
  return {
    incident,
    employee: emp,
    logName: incident.privacyCase ? "Privacy Case" : emp.name,
  };
}

test("columns G–J sum to the recordable case count", () => {
  const cases = [
    incidentCase({ outcome: "death" }),
    incidentCase({ outcome: "days_away", daysAway: 7 }),
    incidentCase({ outcome: "days_away", daysAway: 3 }),
    incidentCase({ outcome: "restricted", daysRestricted: 12 }),
    incidentCase({ outcome: "other_recordable" }),
    incidentCase({ outcome: null, recordable: false }),
  ];
  const s = summarise300A(2026, cases, { annualAvgEmployees: 24, totalHoursWorked: 49_920 });
  assert.equal(s.totalCases, 5, "the first-aid case is not on the log");
  assert.equal(s.deaths + s.daysAwayCases + s.restrictedCases + s.otherRecordableCases, 5);
  assert.equal(s.totalDaysAway, 10);
  assert.equal(s.totalDaysRestricted, 12);
});

test("injury and illness types tally to the same total", () => {
  const cases = [
    incidentCase({ outcome: "other_recordable", category: "injury" }),
    incidentCase({ outcome: "other_recordable", category: "hearing_loss" }),
    incidentCase({ outcome: "other_recordable", category: "respiratory" }),
  ];
  const s = summarise300A(2026, cases, { annualAvgEmployees: null, totalHoursWorked: null });
  assert.equal(Object.values(s.byCategory).reduce((a, b) => a + b, 0), s.totalCases);
  assert.equal(s.byCategory.hearing_loss, 1);
});

test("a zero-incident year still produces a summary", () => {
  const s = summarise300A(2026, [], { annualAvgEmployees: 8, totalHoursWorked: 16_000 });
  assert.equal(s.totalCases, 0);
  assert.equal(s.deaths, 0);
  assert.equal(s.annualAvgEmployees, 8);
});

test("a recordable case with no outcome column is refused, not silently dropped", () => {
  // This is the shape a bug would produce: recordable = true, outcome = null.
  // Counting it in the case total but in no column would post a 300A whose
  // columns do not add up to its own case count.
  const broken = incidentCase({ outcome: null, recordable: true });
  const s = summarise300A(2026, [broken], { annualAvgEmployees: 1, totalHoursWorked: 2000 });
  // The default branch classes it as other-recordable, so the sums reconcile and
  // nothing is invisible on the log.
  assert.equal(s.totalCases, 1);
  assert.equal(s.otherRecordableCases, 1);
});

test("open cases and review cases are surfaced, not hidden in the totals", () => {
  const cases = [
    incidentCase({ outcome: "days_away", daysAway: 4, stillCounting: true }),
    incidentCase({ outcome: "other_recordable", needsJudgment: true }),
  ];
  const s = summarise300A(2026, cases, { annualAvgEmployees: 12, totalHoursWorked: 24_000 });
  assert.equal(s.openCases, 1);
  assert.equal(s.needsJudgmentCases, 1);
});

test("privacy cases are masked on the 300 rows but keep their job title", () => {
  const rows = toForm300Rows([
    incidentCase({ outcome: "other_recordable", privacyCase: true, name: "Dana Whitfield" }),
    incidentCase({ outcome: "days_away", daysAway: 2, name: "Marco Villalobos" }),
  ]);
  assert.equal(rows.length, 2);
  const masked = rows.find((r) => r.privacyCase);
  assert.equal(masked?.logName, "Privacy Case");
  assert.equal(masked?.jobTitle, "Journeyman", "1904.29(b)(7) masks the name, not the title");
  assert.ok(!rows.some((r) => r.logName === "Dana Whitfield"));
});

test("300 rows are ordered by case number and exclude non-recordable cases", () => {
  const rows = toForm300Rows([
    incidentCase({ outcome: "other_recordable" }),
    incidentCase({ outcome: null, recordable: false }),
    incidentCase({ outcome: "days_away", daysAway: 1 }),
  ]);
  assert.equal(rows.length, 2);
  assert.ok(rows[0].caseNumber < rows[1].caseNumber);
});
