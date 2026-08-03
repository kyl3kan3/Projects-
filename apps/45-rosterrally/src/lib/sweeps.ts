/**
 * Everything that has to happen without a human, in one place, so there is one
 * place to reason about it.
 *
 * Vercel has no always-on process (root DEPLOYING.md), so this runs from a
 * cron-triggered route with a bounded time budget rather than a BullMQ worker.
 * `npm run worker` runs the same functions in a loop for local development — one
 * implementation either way.
 *
 * Every sweep is idempotent and every one is *bounded in time*, which is the bug
 * the brief warns about twice:
 *
 *  - Game reminders exist as rows pinned to fixed distances from kick-off, so a
 *    sweep that has not run for a week cannot mail a month of history, and a
 *    condition that stays true forever cannot mail forever.
 *  - The due comparison happens in Postgres, never against a JS `Date` —
 *    millisecond truncation against a microsecond timestamp is how a scheduler
 *    finds work it can then never claim.
 *  - Installment charges are keyed by a unique idempotency key per (plan, payment),
 *    so a double-fired cron cannot bill a family twice.
 */

import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clubs,
  divisions,
  installmentCharges,
  paymentSchedules,
  registrations,
  seasons,
  teams,
  venues,
  type Club,
} from "@/db/schema";
import { audit, SYSTEM } from "@/lib/audit";
import { DEFAULT_CLUB_SETTINGS } from "@/lib/auth";
import { notifyHousehold, sendAnnouncement } from "@/lib/comms";
import { formatMoney } from "@/lib/money";
import { ageInDays, chaseRungFor } from "@/lib/notices";
import { getGateway } from "@/lib/payments";
import {
  applyAvailableCredit,
  getHouseholdMoney,
  promoteFromWaitlist,
  settlePayment,
} from "@/lib/registration";
import { dueReminders, markReminderSent } from "@/lib/schedule";
import { formatWhen, todayIso, type IsoDate } from "@/lib/time";
import { dueClaimReminders, markClaimReminded } from "@/lib/volunteers";

function settingsOf(club: Club | undefined) {
  return { ...DEFAULT_CLUB_SETTINGS, ...(club?.settings ?? {}) };
}

/* --------------------------------------------------------- game reminders --- */

export async function sendDueGameReminders(limit = 100): Promise<number> {
  const db = getDb();
  const due = await dueReminders(limit);
  let sent = 0;

  for (const row of due) {
    const [club] = await db.select().from(clubs).where(eq(clubs.id, row.game.clubId));
    const [venue] = await db.select().from(venues).where(eq(venues.id, row.game.venueId));
    const teamIds = [row.game.homeTeamId, row.game.awayTeamId].filter(
      (id): id is string => Boolean(id),
    );
    const teamRows = await db.select().from(teams).where(inArray(teams.id, teamIds));
    const label = teamRows.map((t) => t.name).join(" v ");
    const when = formatWhen(row.game.startsAt, club?.timezone ?? "America/New_York");

    try {
      await sendAnnouncement({
        clubId: row.game.clubId,
        seasonId: row.game.seasonId,
        audience: { kind: "team", teamIds },
        subject:
          row.reminder.rung === "t24_email"
            ? `Tomorrow: ${label} — ${when}`
            : `Today: ${label} — ${when}`,
        body: [
          `${label} is on ${when}.`,
          `${venue?.name ?? "Venue"} · ${row.game.field}${venue?.address ? `, ${venue.address}` : ""}.`,
          row.game.note ?? "",
          "Your family page has the rest of the schedule and a calendar link.",
        ]
          .filter(Boolean)
          .join("\n\n"),
        channels: [row.reminder.channel],
        purpose: "game_reminder",
        actor: SYSTEM,
        smsBudget: settingsOf(club).smsMonthlyBudget,
      });
      await markReminderSent(row.reminder.id);
      sent += 1;
    } catch (err) {
      // "That audience has nobody in it" is the common case for an unrostered
      // fixture. Mark it done: retrying every hour forever helps nobody.
      console.error(`[sweep] game reminder ${row.reminder.id} not sent`, err);
      await markReminderSent(row.reminder.id);
    }
  }
  return sent;
}

/* ---------------------------------------------------- volunteer reminders --- */

export async function sendDueVolunteerReminders(limit = 100): Promise<number> {
  const db = getDb();
  const due = await dueClaimReminders(limit);
  let sent = 0;

  for (const row of due) {
    const [club] = await db.select().from(clubs).where(eq(clubs.id, row.slot.clubId));
    const when = formatWhen(row.slot.startsAt, club?.timezone ?? "America/New_York");
    try {
      await notifyHousehold({
        clubId: row.slot.clubId,
        seasonId: row.slot.seasonId,
        householdId: row.claim.householdId,
        subject: `Tomorrow: you're on ${row.slot.role}`,
        body: [
          `A reminder that you claimed ${row.slot.role} for ${when}.`,
          "If something has come up, open your family page and give it up — somebody else can pick it up, and that is much better than an empty snack bar.",
        ].join("\n\n"),
        channels: ["email"],
        purpose: "volunteer_reminder",
        smsBudget: settingsOf(club).smsMonthlyBudget,
      });
      await markClaimReminded(row.claim.id);
      sent += 1;
    } catch (err) {
      console.error(`[sweep] volunteer reminder ${row.claim.id} not sent`, err);
      await markClaimReminded(row.claim.id);
    }
  }
  return sent;
}

/* ------------------------------------------------------------ installments --- */

export interface InstallmentRunSummary {
  attempted: number;
  succeeded: number;
  failed: number;
}

/**
 * Charge every installment whose due date has arrived.
 *
 * The `installment_charges` row IS the claim: it is inserted with its idempotency
 * key before the gateway is called, so a crash between the charge and the write
 * cannot produce a second charge on the next run.
 */
export async function chargeDueInstallments(
  asOf: IsoDate = todayIso(),
): Promise<InstallmentRunSummary> {
  const db = getDb();
  const gateway = getGateway();
  const summary: InstallmentRunSummary = { attempted: 0, succeeded: 0, failed: 0 };

  const plans = await db
    .select({ plan: paymentSchedules, reg: registrations })
    .from(paymentSchedules)
    .innerJoin(registrations, eq(registrations.id, paymentSchedules.registrationId))
    .where(and(isNull(paymentSchedules.canceledAt), eq(registrations.status, "active")));

  for (const { plan, reg } of plans) {
    const existing = await db
      .select()
      .from(installmentCharges)
      .where(eq(installmentCharges.scheduleId, plan.id));

    for (const [seq, installment] of plan.installments.entries()) {
      if (installment.dueOn > asOf) continue;
      const already = existing.find((c) => c.seq === seq);
      if (already && already.status !== "failed") continue;
      if (already?.status === "failed") continue; // one attempt; the registrar chases

      const key = `schedule:${plan.id}:${seq}`;
      const [claim] = await db
        .insert(installmentCharges)
        .values({
          scheduleId: plan.id,
          seq,
          dueOn: installment.dueOn,
          amountCents: installment.amountCents,
          idempotencyKey: key,
        })
        .onConflictDoNothing({ target: installmentCharges.idempotencyKey })
        .returning();
      if (!claim) continue; // another run has it

      summary.attempted += 1;
      const [club] = await db.select().from(clubs).where(eq(clubs.id, reg.clubId));

      const result = await gateway.chargeInstallment({
        connectedAccountId: club?.stripeAccountReady ? club.stripeAccountId : null,
        amountCents: installment.amountCents,
        idempotencyKey: key,
        description: `Installment ${seq + 1} for registration ${reg.id}`,
        originalPaymentIntentId: null,
      });

      if (result.status === "succeeded") {
        await settlePayment({
          clubId: reg.clubId,
          householdId: reg.householdId,
          amountCents: installment.amountCents,
          platformFeeCents: 0,
          method: "card",
          providerReference: result.paymentIntentId || key,
          note: `Installment ${seq + 1} of ${plan.installments.length}`,
        });
        await applyAvailableCredit(reg.householdId);
        await db
          .update(installmentCharges)
          .set({ status: "succeeded" })
          .where(eq(installmentCharges.id, claim.id));
        summary.succeeded += 1;
      } else {
        await db
          .update(installmentCharges)
          .set({ status: "failed", error: result.error ?? "Charge failed" })
          .where(eq(installmentCharges.id, claim.id));
        summary.failed += 1;
        await audit(reg.clubId, SYSTEM, "installment_failed", `registration:${reg.id}`, {
          amountCents: installment.amountCents,
          error: result.error,
        });
        const money = await getHouseholdMoney(reg.householdId);
        try {
          await notifyHousehold({
            clubId: reg.clubId,
            seasonId: reg.seasonId,
            householdId: reg.householdId,
            subject: "A payment did not go through",
            body: [
              `We could not take ${formatMoney(installment.amountCents)} for your child's registration.`,
              `${formatMoney(money.netDueCents)} is outstanding. Open your family page to pay it — no login needed.`,
              "If the card has changed, paying from the page is the quickest fix.",
            ].join("\n\n"),
            channels: ["email"],
            purpose: "installment_failed",
            smsBudget: settingsOf(club).smsMonthlyBudget,
          });
        } catch (err) {
          console.error("[sweep] failed-installment notice not sent", err);
        }
      }
    }
  }
  return summary;
}

/* --------------------------------------------------------------- waitlists --- */

/**
 * Move waitlist queues along wherever a place has opened, and tell the family.
 * Promotion never charges a card — the family agreed a price weeks ago, and a
 * silent charge is not something a volunteer club should do.
 */
export async function promoteWaitlists(): Promise<number> {
  const db = getDb();
  const open = await db
    .select({ division: divisions, season: seasons })
    .from(divisions)
    .innerJoin(seasons, eq(seasons.id, divisions.seasonId))
    .where(inArray(seasons.status, ["open", "closed"]));

  let promoted = 0;
  for (const row of open) {
    const result = await promoteFromWaitlist(row.division.id, SYSTEM);
    for (const person of result.promoted) {
      promoted += 1;
      const [reg] = await db
        .select()
        .from(registrations)
        .where(eq(registrations.id, person.registrationId));
      if (!reg) continue;
      const [club] = await db.select().from(clubs).where(eq(clubs.id, reg.clubId));
      try {
        await notifyHousehold({
          clubId: reg.clubId,
          seasonId: reg.seasonId,
          householdId: reg.householdId,
          subject: `A place has opened for ${person.playerName}`,
          body: [
            `${person.playerName} has moved off the waitlist into ${row.division.name}.`,
            person.amountDueCents > 0
              ? `${formatMoney(person.amountDueCents)} is now due — open your family page to pay it and confirm the place.`
              : "Nothing is owed; the place is confirmed.",
            "If you no longer want the place, reply to this message and we will pass it on.",
          ].join("\n\n"),
          channels: ["email"],
          purpose: "waitlist_promoted",
          smsBudget: settingsOf(club).smsMonthlyBudget,
        });
      } catch (err) {
        console.error("[sweep] promotion notice not sent", err);
      }
    }
  }
  return promoted;
}

/* ------------------------------------------------------------- unpaid chase --- */

/**
 * Chase unpaid registrations at fixed distances from the day they were taken:
 * day 3, day 10, day 21. Never "every day while unpaid" — that is the mistake
 * that mails somebody forever.
 *
 * Deduped by counting the chases already sent to that household for that purpose,
 * so the ladder walks once and stops.
 */
export async function chaseUnpaid(asOf: IsoDate = todayIso()): Promise<number> {
  const db = getDb();
  let sent = 0;

  const rows = await db
    .select({ reg: registrations, club: clubs })
    .from(registrations)
    .innerJoin(clubs, eq(clubs.id, registrations.clubId))
    .where(
      and(
        eq(registrations.status, "active"),
        // Let Postgres compare the dates; a JS Date here is the bug the brief names.
        lte(registrations.createdAt, sql`now() - interval '3 days'`),
      ),
    )
    .orderBy(asc(registrations.createdAt))
    .limit(400);

  for (const { reg, club } of rows) {
    const money = await getHouseholdMoney(reg.householdId);
    if (money.netDueCents <= 0) continue;

    // The tightest crossed rung, not the loosest: a 30-day-old unpaid
    // registration gets the day-21 notice, not the day-3 one (lib/notices.ts).
    const rung = chaseRungFor(ageInDays(reg.createdAt, new Date(`${asOf}T00:00:00Z`)));
    if (rung === null) continue;

    const alreadySent = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(sql`announcements a join deliveries d on d.announcement_id = a.id`)
      .where(
        sql`a.purpose = ${`chase_${rung}`} and d.household_id = ${reg.householdId} and a.club_id = ${reg.clubId}`,
      );
    if (Number(alreadySent[0]?.n ?? 0) > 0) continue;

    try {
      await notifyHousehold({
        clubId: reg.clubId,
        seasonId: reg.seasonId,
        householdId: reg.householdId,
        subject: `${formatMoney(money.netDueCents)} outstanding for your registration`,
        body: [
          `Our records show ${formatMoney(money.netDueCents)} still outstanding with ${club.name}.`,
          "You can pay from your family page — no login, and it takes a moment.",
          "If you have already sent a cheque, thank you; it may still be with the treasurer.",
        ].join("\n\n"),
        channels: ["email"],
        purpose: `chase_${rung}`,
        smsBudget: settingsOf(club).smsMonthlyBudget,
      });
      sent += 1;
    } catch (err) {
      console.error("[sweep] chase not sent", err);
    }
  }
  return sent;
}
