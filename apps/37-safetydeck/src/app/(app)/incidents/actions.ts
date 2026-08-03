"use server";

/**
 * Incident actions: log a case, record what was done about the OSHA reporting
 * duty, update the running day counts, and certify the 300A.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWriter } from "@/lib/auth";
import {
  certify300A,
  createIncident,
  recordOshaReport,
  saveDenominators,
  updateDayCounts,
} from "@/lib/incident-store";
import type { ActionState } from "@/lib/action-state";

const trilean = z.enum(["yes", "no", "unsure"]);

const intakeSchema = z.object({
  employeeId: z.string().uuid("Pick who was hurt"),
  occurredAt: z.string().min(10),
  learnedAt: z.string().min(10),
  siteLabel: z.string().min(1, "Which site or job?"),
  whereOccurred: z.string().optional().default(""),
  description: z.string().min(10, "Write what happened — this text prints on the 300 and 301"),
  objectSubstance: z.string().optional().default(""),
  injuryType: z.string().min(2, "What is the injury?"),
  bodyPart: z.string().optional().default(""),
  illnessCategory: z.enum([
    "injury",
    "skin_disorder",
    "respiratory",
    "poisoning",
    "hearing_loss",
    "other_illness",
  ]),
  treatment: z.enum([
    "none",
    "first_aid",
    "observation",
    "medical",
    "er",
    "hospitalized",
    "fatality",
  ]),
  workRelated: trilean,
  lostConsciousness: trilean,
  significantDiagnosis: trilean,
  amputationOrEyeLoss: trilean,
  daysAway: z.coerce.number().int().min(0).max(3650),
  daysRestricted: z.coerce.number().int().min(0).max(3650),
  stillCounting: trilean,
  privacyCase: z.string().optional().default(""),
});

export interface IntakeResult extends ActionState {
  incidentId: string | null;
}

export async function logIncidentAction(
  _prev: IntakeResult,
  form: FormData,
): Promise<IntakeResult> {
  try {
    const { company, user } = await requireWriter();
    const parsed = intakeSchema.safeParse(Object.fromEntries(form.entries()));
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Some answers are missing",
        message: null,
        incidentId: null,
      };
    }
    const a = parsed.data;
    const occurredAt = new Date(a.occurredAt);
    const learnedAt = new Date(a.learnedAt);
    if (Number.isNaN(occurredAt.getTime()) || Number.isNaN(learnedAt.getTime())) {
      return { error: "Those dates did not parse", message: null, incidentId: null };
    }

    const incident = await createIncident(company.id, {
      employeeId: a.employeeId,
      occurredAt,
      learnedAt,
      siteLabel: a.siteLabel,
      whereOccurred: a.whereOccurred || null,
      description: a.description,
      objectSubstance: a.objectSubstance || null,
      injuryType: a.injuryType,
      bodyPart: a.bodyPart || null,
      illnessCategory: a.illnessCategory,
      treatment: a.treatment,
      workRelated: a.workRelated,
      lostConsciousness: a.lostConsciousness,
      significantDiagnosis: a.significantDiagnosis,
      amputationOrEyeLoss: a.amputationOrEyeLoss === "yes",
      daysAway: a.daysAway,
      daysRestricted: a.daysRestricted,
      stillCounting: a.stillCounting === "yes",
      privacyCase: Boolean(a.privacyCase),
      privacyReason: a.privacyCase || null,
      createdBy: user.email,
    });

    revalidatePath("/incidents");
    return {
      error: null,
      message: `Case ${incident.year}-${String(incident.caseNumber).padStart(3, "0")} recorded.`,
      incidentId: incident.id,
    };
  } catch (err) {
    return { error: message(err), message: null, incidentId: null };
  }
}

export async function recordOshaReportAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { company } = await requireWriter();
    const incidentId = str(form, "incidentId");
    const when = str(form, "reportedAt");
    await recordOshaReport(
      company.id,
      incidentId,
      when ? new Date(when) : null,
      str(form, "note"),
    );
    revalidatePath(`/incidents/${incidentId}`);
    return {
      error: null,
      message: when
        ? "Recorded. The 301 now shows when you notified OSHA and what you said."
        : "Cleared — the case shows as not yet reported.",
    };
  } catch (err) {
    return { error: message(err), message: null };
  }
}

export async function updateDayCountsAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { company } = await requireWriter();
    const incidentId = str(form, "incidentId");
    const updated = await updateDayCounts(
      company.id,
      incidentId,
      Number(str(form, "daysAway") || 0),
      Number(str(form, "daysRestricted") || 0),
      str(form, "stillCounting") === "yes",
    );
    revalidatePath(`/incidents/${incidentId}`);
    revalidatePath("/incidents");
    return {
      error: null,
      message: `Updated: ${updated.daysAway} days away, ${updated.daysRestricted} restricted. ${updated.recordabilityBasis.criterion} — ${updated.recordabilityBasis.citation}.`,
    };
  } catch (err) {
    return { error: message(err), message: null };
  }
}

export async function saveDenominatorsAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { company } = await requireWriter();
    const year = Number(str(form, "year"));
    const employeesRaw = str(form, "annualAvgEmployees");
    const hoursRaw = str(form, "totalHoursWorked");
    await saveDenominators(company.id, year, {
      annualAvgEmployees: employeesRaw ? Number(employeesRaw) : null,
      totalHoursWorked: hoursRaw ? Number(hoursRaw) : null,
    });
    revalidatePath("/incidents");
    revalidatePath("/settings");
    return { error: null, message: `${year} employment numbers saved.` };
  } catch (err) {
    return { error: message(err), message: null };
  }
}

export async function certifyAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { company } = await requireWriter();
    const year = Number(str(form, "year"));
    await certify300A(company.id, year, {
      name: str(form, "name"),
      title: str(form, "title"),
      phone: str(form, "phone"),
    });
    revalidatePath("/incidents");
    return {
      error: null,
      message: `Certified. Download the ${year} 300A and post it where employees can see it, February 1 through April 30.`,
    };
  } catch (err) {
    return { error: message(err), message: null };
  }
}

function str(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}
