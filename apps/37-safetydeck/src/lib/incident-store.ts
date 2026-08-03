/**
 * Incident persistence and the Form 300 / 300A aggregation.
 *
 * The recordability *decision* lives in `lib/incidents.ts` (pure, tested); this
 * module is what writes it down and adds up the columns. Two details matter:
 *
 *  - **Case numbers are a per-company, per-year sequence.** They are assigned by
 *    reading the current maximum and retrying on the unique-index violation,
 *    which is correct under concurrency without a sequence per tenant.
 *  - **Totals are integers, and they are asserted.** A 300A whose case totals
 *    disagree with the number of recordable cases on the 300 is a bug that would
 *    be posted on a wall for three months, so `summarise300A` refuses to return
 *    a summary it cannot reconcile.
 */

import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  employees,
  incidents,
  companyYears,
  type CaseOutcome,
  type Employee,
  type IllnessCategory,
  type Incident,
  type Treatment,
} from "@/db/schema";
import {
  deriveRecordability,
  FORM_LOGIC_VERSION,
  PRIVACY_MASK,
  type RecordabilityAnswers,
  type Trilean,
} from "@/lib/incidents";
import { type IsoDate } from "@/lib/dates";

export interface CreateIncidentInput {
  employeeId: string;
  occurredAt: Date;
  learnedAt: Date;
  siteLabel: string;
  whereOccurred: string | null;
  description: string;
  objectSubstance: string | null;
  injuryType: string;
  bodyPart: string | null;
  illnessCategory: IllnessCategory;
  treatment: Treatment;
  workRelated: Trilean;
  lostConsciousness: Trilean;
  significantDiagnosis: Trilean;
  amputationOrEyeLoss: boolean;
  daysAway: number;
  daysRestricted: number;
  stillCounting: boolean;
  privacyCase: boolean;
  privacyReason: string | null;
  createdBy: string;
}

export async function createIncident(
  companyId: string,
  input: CreateIncidentInput,
): Promise<Incident> {
  const db = getDb();

  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, input.employeeId), eq(employees.companyId, companyId)));
  if (!employee) throw new Error("That employee is not on this company's roster");

  const answers: RecordabilityAnswers = {
    workRelated: input.workRelated,
    treatment: input.treatment,
    daysAway: input.daysAway,
    daysRestricted: input.daysRestricted,
    lostConsciousness: input.lostConsciousness,
    significantDiagnosis: input.significantDiagnosis,
    amputationOrEyeLoss: input.amputationOrEyeLoss,
  };
  const decision = deriveRecordability(answers);
  const year = input.occurredAt.getUTCFullYear();

  // Make sure the reporting year has a denominators row to hang the 300A off.
  await db.insert(companyYears).values({ companyId, year }).onConflictDoNothing();

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${incidents.caseNumber}), 0)::int` })
      .from(incidents)
      .where(and(eq(incidents.companyId, companyId), eq(incidents.year, year)));
    const caseNumber = max + 1;
    try {
      const [row] = await db
        .insert(incidents)
        .values({
          companyId,
          employeeId: input.employeeId,
          year,
          caseNumber,
          occurredAt: input.occurredAt,
          learnedAt: input.learnedAt,
          siteLabel: input.siteLabel,
          whereOccurred: input.whereOccurred,
          description: input.description,
          objectSubstance: input.objectSubstance,
          injuryType: input.injuryType,
          bodyPart: input.bodyPart,
          illnessCategory: input.illnessCategory,
          treatment: input.treatment,
          lostConsciousness: input.lostConsciousness === "yes",
          significantDiagnosis: input.significantDiagnosis === "yes",
          daysAway: decision.cappedDaysAway,
          daysRestricted: decision.cappedDaysRestricted,
          stillCounting: input.stillCounting,
          recordable: decision.recordable,
          needsJudgment: decision.needsJudgment,
          outcome: decision.outcome,
          recordabilityBasis: {
            criterion: decision.criterion,
            citation: decision.citation,
            explanation: decision.explanation,
            answers: {
              workRelated: input.workRelated,
              treatment: input.treatment,
              daysAwayEntered: input.daysAway,
              daysRestrictedEntered: input.daysRestricted,
              lostConsciousness: input.lostConsciousness,
              significantDiagnosis: input.significantDiagnosis,
              amputationOrEyeLoss: input.amputationOrEyeLoss,
              stillCounting: input.stillCounting,
            },
          },
          formLogicVersion: decision.formLogicVersion,
          privacyCase: input.privacyCase,
          privacyReason: input.privacyReason,
          createdBy: input.createdBy,
        })
        .returning();
      return row;
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (!message.includes("incidents_case_uq")) throw err;
      // Another intake took this case number between the read and the write.
    }
  }
  throw new Error("Could not assign a case number — try again");
}

/** Record what the company did about the 8/24-hour duty. Guidance only. */
export async function recordOshaReport(
  companyId: string,
  incidentId: string,
  reportedAt: Date | null,
  note: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(incidents)
    .set({ reportedToOshaAt: reportedAt, oshaReportNote: note.trim() || null })
    .where(and(eq(incidents.id, incidentId), eq(incidents.companyId, companyId)));
}

/** Update the running day counts on an open case, re-deriving the outcome. */
export async function updateDayCounts(
  companyId: string,
  incidentId: string,
  daysAway: number,
  daysRestricted: number,
  stillCounting: boolean,
): Promise<Incident> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(incidents)
    .where(and(eq(incidents.id, incidentId), eq(incidents.companyId, companyId)));
  if (!existing) throw new Error("No such case");

  const decision = deriveRecordability({
    workRelated: (existing.recordabilityBasis.answers.workRelated as Trilean) ?? "yes",
    treatment: existing.treatment,
    daysAway,
    daysRestricted,
    lostConsciousness: existing.lostConsciousness ? "yes" : "no",
    significantDiagnosis: existing.significantDiagnosis ? "yes" : "no",
    amputationOrEyeLoss: Boolean(existing.recordabilityBasis.answers.amputationOrEyeLoss),
  });

  const [row] = await db
    .update(incidents)
    .set({
      daysAway: decision.cappedDaysAway,
      daysRestricted: decision.cappedDaysRestricted,
      stillCounting,
      recordable: decision.recordable,
      needsJudgment: decision.needsJudgment,
      outcome: decision.outcome,
      recordabilityBasis: {
        ...existing.recordabilityBasis,
        criterion: decision.criterion,
        citation: decision.citation,
        explanation: decision.explanation,
        answers: {
          ...existing.recordabilityBasis.answers,
          daysAwayEntered: daysAway,
          daysRestrictedEntered: daysRestricted,
          stillCounting,
        },
      },
      formLogicVersion: FORM_LOGIC_VERSION,
    })
    .where(eq(incidents.id, incidentId))
    .returning();
  return row;
}

export interface IncidentWithEmployee {
  incident: Incident;
  employee: Employee;
  /** The name as it appears on the Form 300 — masked on privacy cases. */
  logName: string;
}

export async function listIncidents(
  companyId: string,
  opts: { year?: number; from?: IsoDate; to?: IsoDate } = {},
): Promise<IncidentWithEmployee[]> {
  const db = getDb();
  const clauses = [eq(incidents.companyId, companyId)];
  if (opts.year !== undefined) clauses.push(eq(incidents.year, opts.year));
  // Date-only bounds are cast explicitly; handing a JS Date to a raw fragment is
  // how postgres.js ends up calling Buffer.byteLength on a Date at runtime.
  if (opts.from) clauses.push(gte(incidents.occurredAt, new Date(`${opts.from}T00:00:00.000Z`)));
  if (opts.to) clauses.push(lte(incidents.occurredAt, new Date(`${opts.to}T23:59:59.999Z`)));

  const rows = await db
    .select({ incident: incidents, employee: employees })
    .from(incidents)
    .innerJoin(employees, eq(employees.id, incidents.employeeId))
    .where(and(...clauses))
    .orderBy(desc(incidents.occurredAt), asc(incidents.caseNumber));

  return rows.map(({ incident, employee }) => ({
    incident,
    employee,
    logName: incident.privacyCase ? PRIVACY_MASK : employee.name,
  }));
}

export async function getIncident(
  companyId: string,
  incidentId: string,
): Promise<IncidentWithEmployee | null> {
  const db = getDb();
  const [row] = await db
    .select({ incident: incidents, employee: employees })
    .from(incidents)
    .innerJoin(employees, eq(employees.id, incidents.employeeId))
    .where(and(eq(incidents.id, incidentId), eq(incidents.companyId, companyId)));
  if (!row) return null;
  return {
    incident: row.incident,
    employee: row.employee,
    logName: row.incident.privacyCase ? PRIVACY_MASK : row.employee.name,
  };
}

/** Which years have cases, newest first — the year selector. */
export async function incidentYears(companyId: string): Promise<number[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ year: incidents.year })
    .from(incidents)
    .where(eq(incidents.companyId, companyId))
    .orderBy(desc(incidents.year));
  return rows.map((r) => r.year);
}

/* ------------------------------------------------------------ the 300 rows --- */

export interface Form300Row {
  caseNumber: number;
  logName: string;
  jobTitle: string;
  dateOfInjury: string;
  whereOccurred: string;
  description: string;
  outcome: CaseOutcome;
  daysAway: number;
  daysRestricted: number;
  illnessCategory: IllnessCategory;
  privacyCase: boolean;
  needsJudgment: boolean;
}

export function toForm300Rows(cases: IncidentWithEmployee[]): Form300Row[] {
  return cases
    .filter((c) => c.incident.recordable)
    .sort((a, b) => a.incident.caseNumber - b.incident.caseNumber)
    .map(({ incident, employee, logName }) => ({
      caseNumber: incident.caseNumber,
      logName,
      // 1904.29(b)(7) masks the name, not the job title.
      jobTitle: employee.jobTitle ?? "—",
      dateOfInjury: incident.occurredAt.toISOString().slice(0, 10),
      whereOccurred: incident.whereOccurred
        ? `${incident.siteLabel} — ${incident.whereOccurred}`
        : incident.siteLabel,
      description: describeCase(incident),
      outcome: incident.outcome ?? "other_recordable",
      daysAway: incident.daysAway,
      daysRestricted: incident.daysRestricted,
      illnessCategory: incident.illnessCategory,
      privacyCase: incident.privacyCase,
      needsJudgment: incident.needsJudgment,
    }));
}

/** Column F: object/exposure, the part of the body, and the injury. */
export function describeCase(incident: Incident): string {
  const parts = [incident.injuryType];
  if (incident.bodyPart) parts.push(`to ${incident.bodyPart}`);
  if (incident.objectSubstance) parts.push(`from ${incident.objectSubstance}`);
  const summary = parts.join(" ");
  return `${summary}. ${incident.description}`;
}

/* ----------------------------------------------------------- the 300A math --- */

export interface Form300ASummary {
  year: number;
  deaths: number;
  daysAwayCases: number;
  restrictedCases: number;
  otherRecordableCases: number;
  totalCases: number;
  totalDaysAway: number;
  totalDaysRestricted: number;
  byCategory: Record<IllnessCategory, number>;
  annualAvgEmployees: number | null;
  totalHoursWorked: number | null;
  /** Cases still accruing days — the totals will move. */
  openCases: number;
  needsJudgmentCases: number;
}

/**
 * Add up a year's recordable cases. Integer counts only, and the case columns
 * (G–J) are reconciled against the case count before the summary is returned —
 * a 300A that disagrees with its own 300 is worse than no 300A.
 */
export function summarise300A(
  year: number,
  cases: IncidentWithEmployee[],
  denominators: { annualAvgEmployees: number | null; totalHoursWorked: number | null },
): Form300ASummary {
  const recordable = cases.filter((c) => c.incident.recordable);
  const byCategory: Record<IllnessCategory, number> = {
    injury: 0,
    skin_disorder: 0,
    respiratory: 0,
    poisoning: 0,
    hearing_loss: 0,
    other_illness: 0,
  };

  let deaths = 0;
  let daysAwayCases = 0;
  let restrictedCases = 0;
  let otherRecordableCases = 0;
  let totalDaysAway = 0;
  let totalDaysRestricted = 0;
  let openCases = 0;
  let needsJudgmentCases = 0;

  for (const { incident } of recordable) {
    switch (incident.outcome) {
      case "death":
        deaths += 1;
        break;
      case "days_away":
        daysAwayCases += 1;
        break;
      case "restricted":
        restrictedCases += 1;
        break;
      default:
        otherRecordableCases += 1;
    }
    totalDaysAway += incident.daysAway;
    totalDaysRestricted += incident.daysRestricted;
    byCategory[incident.illnessCategory] += 1;
    if (incident.stillCounting) openCases += 1;
    if (incident.needsJudgment) needsJudgmentCases += 1;
  }

  const totalCases = recordable.length;
  const columnSum = deaths + daysAwayCases + restrictedCases + otherRecordableCases;
  if (columnSum !== totalCases) {
    throw new Error(
      `Form 300A totals do not reconcile: columns G–J sum to ${columnSum} but there are ${totalCases} recordable cases. Refusing to produce a summary that disagrees with the log.`,
    );
  }
  const categorySum = Object.values(byCategory).reduce((a, b) => a + b, 0);
  if (categorySum !== totalCases) {
    throw new Error(
      `Form 300A injury/illness types sum to ${categorySum} but there are ${totalCases} recordable cases.`,
    );
  }

  return {
    year,
    deaths,
    daysAwayCases,
    restrictedCases,
    otherRecordableCases,
    totalCases,
    totalDaysAway,
    totalDaysRestricted,
    byCategory,
    annualAvgEmployees: denominators.annualAvgEmployees,
    totalHoursWorked: denominators.totalHoursWorked,
    openCases,
    needsJudgmentCases,
  };
}

export async function denominatorsFor(
  companyId: string,
  year: number,
): Promise<{ annualAvgEmployees: number | null; totalHoursWorked: number | null; certifiedByName: string | null; certifiedByTitle: string | null; certifiedByPhone: string | null; certifiedAt: Date | null }> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(companyYears)
    .where(and(eq(companyYears.companyId, companyId), eq(companyYears.year, year)));
  return {
    annualAvgEmployees: row?.annualAvgEmployees ?? null,
    totalHoursWorked: row?.totalHoursWorked ?? null,
    certifiedByName: row?.certifiedByName ?? null,
    certifiedByTitle: row?.certifiedByTitle ?? null,
    certifiedByPhone: row?.certifiedByPhone ?? null,
    certifiedAt: row?.certifiedAt ?? null,
  };
}

export async function saveDenominators(
  companyId: string,
  year: number,
  input: { annualAvgEmployees: number | null; totalHoursWorked: number | null },
): Promise<void> {
  const db = getDb();
  await db
    .insert(companyYears)
    .values({ companyId, year, ...input })
    .onConflictDoUpdate({
      target: [companyYears.companyId, companyYears.year],
      set: input,
    });
}

export async function certify300A(
  companyId: string,
  year: number,
  signer: { name: string; title: string; phone: string },
): Promise<void> {
  if (!signer.name.trim()) throw new Error("The 300A needs the name of a company executive");
  const db = getDb();
  await db
    .insert(companyYears)
    .values({
      companyId,
      year,
      certifiedByName: signer.name.trim(),
      certifiedByTitle: signer.title.trim() || null,
      certifiedByPhone: signer.phone.trim() || null,
      certifiedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [companyYears.companyId, companyYears.year],
      set: {
        certifiedByName: signer.name.trim(),
        certifiedByTitle: signer.title.trim() || null,
        certifiedByPhone: signer.phone.trim() || null,
        certifiedAt: new Date(),
      },
    });
}
