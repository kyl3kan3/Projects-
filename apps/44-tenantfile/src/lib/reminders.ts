/**
 * Rent reminders.
 *
 * The rule that matters more than any other in this file: **a reminder re-checks
 * the charge at send time**. Reminders are scheduled days in advance, and a
 * tenant who paid on the 2nd must never get a late notice on the 7th because a
 * job row was written on the 1st. There are two independent guards:
 *
 *   1. Recording a payment cancels scheduled reminders for anything now settled
 *      (src/lib/ledger.ts).
 *   2. The sender re-derives the ledger and refuses to send when the charge is
 *      paid, waived, or the tenancy is no longer active.
 *
 * Guard 2 exists because guard 1 can be missed — a payment recorded directly in
 * the database, a webhook that failed, a manual `UPDATE`. The test for this is in
 * reminders.test.ts and it replays the send after a payment, which is exactly the
 * scenario ROADMAP's acceptance criteria demand.
 */

import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db";
import {
  charges,
  landlords,
  properties,
  reminders,
  tenancies,
  units,
  type Charge,
  type Reminder,
  type Tenancy,
} from "@/db/schema";
import { stitch } from "@/lib/file-events";
import { reminderCopy, templateLabel, type ReminderContext } from "@/lib/reminder-copy";
import { emailShell, notifier } from "@/lib/notify";
import { tenantPortalUrl } from "@/lib/links";
import { daysBetween, formatMoney, isoDateOf, type IsoDate } from "@/lib/money";
import { reminderPlan } from "@/lib/schedule";
import { getLateFeeRule, loadLedger } from "@/lib/ledger-read";

/**
 * Schedule the ladder for one rent charge. Idempotent: the unique index on
 * (charge, template, channel) means re-running this never duplicates a send.
 * Reminders whose moment has already passed are not scheduled — nobody wants a
 * "rent is due in 3 days" text about last March.
 */
export async function scheduleRemindersForCharge(charge: Charge, tenancy: Tenancy): Promise<number> {
  if (charge.kind !== "rent") return 0;
  const db = getDb();
  const rule = await getLateFeeRule(tenancy.id);
  const [landlord] = await db
    .select()
    .from(landlords)
    .innerJoin(properties, eq(properties.landlordId, landlords.id))
    .innerJoin(units, eq(units.propertyId, properties.id))
    .where(eq(units.id, tenancy.unitId))
    .limit(1);

  const upcomingDays = landlord?.landlords.settings.reminderUpcomingDays ?? 3;
  const plan = reminderPlan(charge.dueOn as IsoDate, rule?.graceDays ?? 5, {
    reminderUpcomingDays: upcomingDays,
  });

  const now = Date.now();
  const rows = plan
    .filter((p) => p.sendAt.getTime() > now - 60 * 60 * 1000)
    .map((p) => ({
      chargeId: charge.id,
      tenancyId: tenancy.id,
      channel: p.channel,
      template: p.template,
      sendAt: p.sendAt,
      status: "scheduled" as const,
    }));
  if (rows.length === 0) return 0;

  const inserted = await db.insert(reminders).values(rows).onConflictDoNothing().returning();
  return inserted.length;
}

export async function cancelRemindersForCharge(chargeId: string, reason: string): Promise<number> {
  const db = getDb();
  const cancelled = await db
    .update(reminders)
    .set({ status: "canceled", failureReason: reason })
    .where(and(eq(reminders.chargeId, chargeId), eq(reminders.status, "scheduled")))
    .returning();
  return cancelled.length;
}

export async function scheduledRemindersFor(tenancyId: string): Promise<Reminder[]> {
  return getDb()
    .select()
    .from(reminders)
    .where(and(eq(reminders.tenancyId, tenancyId), eq(reminders.status, "scheduled")))
    .orderBy(asc(reminders.sendAt));
}

/* ------------------------------------------------------------- the sender --- */

export interface SendOutcome {
  sent: number;
  skipped: number;
  failed: number;
}

interface DueReminder {
  reminder: Reminder;
  charge: Charge;
  tenancy: Tenancy;
  landlordName: string;
  addressLine: string;
  unitLabel: string;
}

async function loadDue(now: Date, limit: number): Promise<DueReminder[]> {
  const db = getDb();
  const rows = await db
    .select({
      reminder: reminders,
      charge: charges,
      tenancy: tenancies,
      unit: units,
      property: properties,
      landlord: landlords,
    })
    .from(reminders)
    .innerJoin(charges, eq(charges.id, reminders.chargeId))
    .innerJoin(tenancies, eq(tenancies.id, reminders.tenancyId))
    .innerJoin(units, eq(units.id, tenancies.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .innerJoin(landlords, eq(landlords.id, properties.landlordId))
    .where(and(eq(reminders.status, "scheduled"), lte(reminders.sendAt, now)))
    .orderBy(asc(reminders.sendAt))
    .limit(limit);

  return rows.map((r) => ({
    reminder: r.reminder,
    charge: r.charge,
    tenancy: r.tenancy,
    landlordName: r.landlord.name,
    addressLine: r.property.address,
    unitLabel: r.unit.label,
  }));
}

/**
 * Send every reminder whose moment has arrived. Each one is re-checked against
 * the live ledger first; a reminder that should no longer go out is cancelled
 * with a reason, which is visible in the tenancy's reminder list.
 */
export async function sendDueReminders(
  now: Date = new Date(),
  opts: { limit?: number; deadline?: number } = {},
): Promise<SendOutcome> {
  const db = getDb();
  const due = await loadDue(now, opts.limit ?? 100);
  const outcome: SendOutcome = { sent: 0, skipped: 0, failed: 0 };

  for (const item of due) {
    if (opts.deadline && Date.now() > opts.deadline) break;

    const verdict = await shouldSend(item, now);
    if (!verdict.send) {
      await db
        .update(reminders)
        .set({ status: "canceled", failureReason: verdict.reason })
        .where(eq(reminders.id, item.reminder.id));
      outcome.skipped++;
      continue;
    }

    const result = await deliver(item, verdict.context);
    if (result.ok) {
      await db
        .update(reminders)
        .set({ status: "sent", sentAt: new Date(), providerMessageId: result.providerMessageId ?? null })
        .where(eq(reminders.id, item.reminder.id));
      outcome.sent++;
      await stitch({
        tenancyId: item.tenancy.id,
        kind: "reminder",
        refId: item.reminder.id,
        occurredAt: new Date(),
        summary: `${templateLabel(item.reminder.template)} sent by ${item.reminder.channel}`,
        detail: `${formatMoney(verdict.context.amountDueCents)} outstanding${result.simulated ? " · dry run, nothing left the building" : ""}`,
        dedupeKey: `reminder:${item.reminder.id}`,
      });
    } else {
      await db
        .update(reminders)
        .set({ status: "failed", failureReason: result.error ?? "send failed" })
        .where(eq(reminders.id, item.reminder.id));
      outcome.failed++;
    }
  }

  return outcome;
}

type Verdict =
  | { send: true; context: ReminderContext }
  | { send: false; reason: string };

/**
 * The send-time re-check. Everything that could have changed since the reminder
 * was scheduled is re-derived here, from the ledger, not from the charge's cached
 * status column.
 */
async function shouldSend(item: DueReminder, now: Date): Promise<Verdict> {
  if (item.tenancy.status !== "active") return { send: false, reason: "tenancy is no longer active" };

  const asOf = isoDateOf(now);
  const ledger = await loadLedger(item.tenancy.id, asOf);
  const state = ledger.charges.find((c) => c.charge.id === item.charge.id);
  if (!state) return { send: false, reason: "charge no longer exists" };
  if (state.charge.waived) return { send: false, reason: "charge was waived" };
  if (state.outstandingCents <= 0) return { send: false, reason: "charge is paid" };

  // A bank payment that is still clearing covers the balance: do not chase it.
  if (ledger.processingCents >= state.outstandingCents && item.reminder.template !== "upcoming") {
    return { send: false, reason: "a bank payment is still clearing" };
  }

  const to = { email: item.tenancy.tenantEmails[0], sms: item.tenancy.tenantPhones[0] }[item.reminder.channel];
  if (!to) return { send: false, reason: `no tenant ${item.reminder.channel} on file` };

  const lateFees = ledger.charges
    .filter((c) => c.charge.kind === "late_fee" && c.charge.sourceChargeId === item.charge.id && !c.charge.waived)
    .reduce((sum, c) => sum + c.charge.amountCents, 0);

  return {
    send: true,
    context: {
      tenantFirstName: (item.tenancy.tenantNames[0] ?? "").split(" ")[0] ?? "",
      landlordName: item.landlordName,
      addressLine: item.addressLine,
      unitLabel: item.unitLabel,
      amountDueCents: state.outstandingCents,
      balanceCents: ledger.balanceCents,
      dueOn: state.charge.dueOn,
      daysLate: Math.max(0, daysBetween(state.charge.dueOn, asOf)),
      lateFeeCents: lateFees,
      payUrl: tenantPortalUrl(item.tenancy.portalToken),
    },
  };
}

async function deliver(item: DueReminder, ctx: ReminderContext) {
  const copy = reminderCopy(item.reminder.template, ctx);
  if (item.reminder.channel === "sms") {
    return notifier().sms({ to: item.tenancy.tenantPhones[0]!, body: copy.sms });
  }
  const shell = emailShell(copy.heading, copy.paragraphs, { label: copy.actionLabel, url: ctx.payUrl });
  return notifier().email({
    to: item.tenancy.tenantEmails[0]!,
    subject: copy.subject,
    text: shell.text,
    html: shell.html,
  });
}

/** Send one reminder right now, from the tenancy screen's "Send reminder now". */
export async function sendReminderNow(tenancyId: string, chargeId: string): Promise<{ ok: boolean; reason?: string }> {
  const db = getDb();
  const [row] = await db
    .select({
      tenancy: tenancies,
      charge: charges,
      unit: units,
      property: properties,
      landlord: landlords,
    })
    .from(tenancies)
    .innerJoin(charges, eq(charges.tenancyId, tenancies.id))
    .innerJoin(units, eq(units.id, tenancies.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .innerJoin(landlords, eq(landlords.id, properties.landlordId))
    .where(and(eq(tenancies.id, tenancyId), eq(charges.id, chargeId)));
  if (!row) return { ok: false, reason: "No such charge" };

  const now = new Date();
  const asOf = isoDateOf(now);
  const ledger = await loadLedger(tenancyId, asOf);
  const state = ledger.charges.find((c) => c.charge.id === chargeId);
  if (!state || state.outstandingCents <= 0) return { ok: false, reason: "Nothing is owed on that charge" };

  const template = daysBetween(state.charge.dueOn, asOf) > 0 ? "late_1" : "due";
  const item: DueReminder = {
    reminder: {
      id: "manual",
      chargeId,
      tenancyId,
      channel: row.tenancy.tenantEmails[0] ? "email" : "sms",
      template,
      sendAt: now,
      status: "scheduled",
      sentAt: null,
      providerMessageId: null,
      failureReason: null,
      createdAt: now,
    },
    charge: row.charge,
    tenancy: row.tenancy,
    landlordName: row.landlord.name,
    addressLine: row.property.address,
    unitLabel: row.unit.label,
  };

  const verdict = await shouldSend(item, now);
  if (!verdict.send) return { ok: false, reason: verdict.reason };

  const result = await deliver(item, verdict.context);
  if (!result.ok) return { ok: false, reason: result.error };

  await stitch({
    tenancyId,
    kind: "reminder",
    refId: chargeId,
    occurredAt: now,
    summary: `Reminder sent by hand (${item.reminder.channel})`,
    detail: `${formatMoney(verdict.context.amountDueCents)} outstanding${result.simulated ? " · dry run" : ""}`,
  });
  return { ok: true };
}

/** Reminder rows for a set of charges, for the tenancy screen. */
export async function remindersForCharges(chargeIds: string[]): Promise<Reminder[]> {
  if (chargeIds.length === 0) return [];
  return getDb()
    .select()
    .from(reminders)
    .where(inArray(reminders.chargeId, chargeIds))
    .orderBy(asc(reminders.sendAt));
}
