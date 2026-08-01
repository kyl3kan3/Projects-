"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { assessmentSchedules, invoices, type Cadence, type LateFeePolicy } from "@/db/schema";
import { requireCapability } from "@/lib/auth";
import type { Actor } from "@/lib/audit";
import { today } from "@/lib/dates";
import { DEFAULT_LATE_FEE, NO_LATE_FEE } from "@/lib/dues";
import {
  applyLateFee,
  generateInvoices,
  previewRun,
  recordManualPayment,
  specialAssessment,
  waiveLateFee,
  writeOffInvoice,
} from "@/lib/invoicing";
import { chargeRun } from "@/lib/autopay";
import { createPaymentPlan, reminderSweep } from "@/lib/reminders";
import { formatMoney, parseMoney } from "@/lib/money";
import { featureAllowed, planForFeature } from "@/lib/plans";

export interface ActionState {
  error?: string;
  ok?: string;
}

function actorFor(user: { id: string; name: string }): Actor {
  return { kind: "user", id: user.id, name: user.name };
}

/** Everything below writes money, so every one of them requires the money role. */
async function moneyContext() {
  const ctx = await requireCapability("money");
  return { ...ctx, actor: actorFor(ctx.user) };
}

/** Confirm an invoice belongs to the signed-in association before touching it. */
async function ownedInvoice(associationId: string, invoiceId: string) {
  const [row] = await getDb()
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.associationId, associationId)));
  if (!row) throw new Error("That invoice is not on this association's books");
  return row;
}

export async function recordPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { association, actor } = await moneyContext();
    const invoiceId = String(formData.get("invoiceId") ?? "");
    const invoice = await ownedInvoice(association.id, invoiceId);

    const amountCents = parseMoney(String(formData.get("amount") ?? ""));
    if (amountCents === null || amountCents <= 0) {
      return { error: "Enter the amount as dollars and cents, for example 180.00" };
    }
    const method = String(formData.get("method") ?? "check");
    if (!["check", "cash", "card", "ach", "other"].includes(method)) {
      return { error: "Pick how the payment arrived" };
    }
    const receivedOn = String(formData.get("receivedOn") ?? today());

    const result = await recordManualPayment(
      {
        invoiceId,
        amountCents,
        method: method as "check" | "cash" | "card" | "ach" | "other",
        receivedOn,
        reference: String(formData.get("reference") ?? "") || null,
      },
      actor,
    );

    revalidatePath("/dues");
    revalidatePath(`/dues/${invoice.householdId}`);

    const spread =
      result.invoiceIds.length > 1
        ? ` Applied across ${result.invoiceIds.length} invoices, oldest first.`
        : "";
    const credit =
      result.creditCents > 0
        ? ` ${formatMoney(result.creditCents)} was more than this household owed and is held as credit.`
        : "";
    return { ok: `Recorded ${formatMoney(amountCents)}.${spread}${credit}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not record that payment" };
  }
}

export async function applyLateFeeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { association, actor } = await moneyContext();
    if (!featureAllowed(association.plan, "lateFeeRules")) {
      return {
        error: `Late-fee rules are part of ${planForFeature("lateFeeRules").name}. Upgrade in Settings to switch them on.`,
      };
    }
    const invoiceId = String(formData.get("invoiceId") ?? "");
    const invoice = await ownedInvoice(association.id, invoiceId);
    const fee = await applyLateFee(invoiceId, actor);
    revalidatePath(`/dues/${invoice.householdId}`);
    return fee > 0
      ? { ok: "Late fee added as its own line." }
      : { error: "No late fee applies: either grace has not expired or the policy is set to none." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not apply the fee" };
  }
}

export async function waiveLateFeeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { association, actor } = await moneyContext();
    const invoiceId = String(formData.get("invoiceId") ?? "");
    const invoice = await ownedInvoice(association.id, invoiceId);
    await waiveLateFee(invoiceId, String(formData.get("reason") ?? ""), actor);
    revalidatePath(`/dues/${invoice.householdId}`);
    return { ok: "Waived. The original fee stays on the record beside the waiver." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not waive the fee" };
  }
}

export async function writeOffAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { association, actor } = await moneyContext();
    const invoiceId = String(formData.get("invoiceId") ?? "");
    const invoice = await ownedInvoice(association.id, invoiceId);
    await writeOffInvoice(invoiceId, String(formData.get("reason") ?? ""), actor);
    revalidatePath("/dues");
    revalidatePath(`/dues/${invoice.householdId}`);
    return { ok: "Written off, with your reason on the record." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not write that off" };
  }
}

export async function createScheduleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { association, actor } = await moneyContext();
    const amountCents = parseMoney(String(formData.get("amount") ?? ""));
    if (amountCents === null || amountCents <= 0) {
      return { error: "Enter the per-household amount, for example 180.00" };
    }
    const cadence = String(formData.get("cadence") ?? "quarterly") as Cadence;
    if (!["annual", "quarterly", "monthly", "one_time"].includes(cadence)) {
      return { error: "Pick how often dues are assessed" };
    }
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { error: "Name the schedule, for example \"2026 Quarterly Dues\"" };
    const startsOn = String(formData.get("startsOn") ?? today());
    const dueDay = Math.min(28, Math.max(1, Number(formData.get("dueDay") ?? 1) || 1));

    const feesAllowed = featureAllowed(association.plan, "lateFeeRules");
    const lateFeeCentsValue = parseMoney(String(formData.get("lateFee") ?? "0")) ?? 0;
    const policy: LateFeePolicy = !feesAllowed || lateFeeCentsValue <= 0
      ? { ...NO_LATE_FEE, graceDays: Number(formData.get("graceDays") ?? 10) || 10 }
      : {
          ...DEFAULT_LATE_FEE,
          graceDays: Number(formData.get("graceDays") ?? 10) || 10,
          flatCents: lateFeeCentsValue,
        };

    const [schedule] = await getDb()
      .insert(assessmentSchedules)
      .values({
        associationId: association.id,
        name,
        cadence,
        amountCents,
        dueDay,
        startsOn,
        prorate: formData.get("prorate") === "on",
        lateFeePolicy: policy,
      })
      .returning();

    const preview = await previewRun(schedule.id, 0);
    void actor;
    revalidatePath("/dues");
    revalidatePath("/dues/schedules");
    return { ok: preview.sentence };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the schedule" };
  }
}

export async function generateRunAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { association, actor } = await moneyContext();
    const scheduleId = String(formData.get("scheduleId") ?? "");
    const [schedule] = await getDb()
      .select()
      .from(assessmentSchedules)
      .where(
        and(
          eq(assessmentSchedules.id, scheduleId),
          eq(assessmentSchedules.associationId, association.id),
        ),
      );
    if (!schedule) return { error: "That schedule is not on this association's books" };

    const periodIndex = Number(formData.get("periodIndex") ?? 0);
    const result = await generateInvoices(scheduleId, periodIndex, actor);
    revalidatePath("/dues");
    revalidatePath("/dues/schedules");
    return {
      ok:
        result.created === 0
          ? `Nothing to do — all ${result.skipped} households already have a ${result.period.label} invoice.`
          : `Created ${result.created} invoice${result.created === 1 ? "" : "s"} for ${result.period.label}${
              result.skipped > 0 ? `, skipping ${result.skipped} that already existed` : ""
            }.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate that run" };
  }
}

export async function specialAssessmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { association, actor } = await moneyContext();
    const amountCents = parseMoney(String(formData.get("amount") ?? ""));
    if (amountCents === null || amountCents <= 0) {
      return { error: "Enter the per-household amount, for example 450.00" };
    }
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { error: "Name the assessment, for example \"Roof Special Assessment\"" };
    const result = await specialAssessment(
      association.id,
      { name, amountCents, dueOn: String(formData.get("dueOn") ?? today()) },
      actor,
    );
    revalidatePath("/dues");
    revalidatePath("/dues/schedules");
    return { ok: `Created ${result.created} invoices for ${name}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create that assessment" };
  }
}

export async function runRemindersAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  try {
    await moneyContext();
    const summary = await reminderSweep();
    revalidatePath("/dues");
    return {
      ok:
        summary.sent === 0
          ? `Nothing to send: ${summary.considered} overdue invoice${summary.considered === 1 ? "" : "s"} checked, none had crossed a new step of your ladder.`
          : `Sent ${summary.sent} reminder${summary.sent === 1 ? "" : "s"} out of ${summary.considered} overdue invoices.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not run reminders" };
  }
}

export async function runAutopayAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  try {
    const { association } = await moneyContext();
    const summary = await chargeRun(today(), association.id);
    revalidatePath("/dues");
    if (summary.considered === 0) return { ok: "No enrolled household has a due invoice today." };
    return {
      ok: `Charged ${summary.charged}, ${summary.processing} clearing by ACH, ${summary.failed} failed, ${summary.skipped} already handled.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not run autopay" };
  }
}

export async function createPaymentPlanAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { association, actor } = await moneyContext();
    if (!featureAllowed(association.plan, "paymentPlans")) {
      return {
        error: `Payment plans are part of ${planForFeature("paymentPlans").name}. Upgrade in Settings to offer them.`,
      };
    }
    const householdId = String(formData.get("householdId") ?? "");
    const parts = Number(formData.get("parts") ?? 3);
    const startOn = String(formData.get("startOn") ?? today());
    const result = await createPaymentPlan(householdId, parts, startOn, actor);
    revalidatePath("/dues");
    revalidatePath(`/dues/${householdId}`);
    return {
      ok: `Plan created: ${result.instalments.length} instalments, first due ${result.instalments[0].dueOn}.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the plan" };
  }
}
