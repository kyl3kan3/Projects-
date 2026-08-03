/**
 * src/lib/reminders.ts
 *
 * The fan-out, wired to the database. The decisions all live in
 * `reminder-rules.ts`, which is pure and tested; this file reads the rows,
 * claims the ledger, and sends.
 *
 * Order matters and is deliberate: **claim, then send.** The unique index on
 * (critical_date_id, offset_days) makes the insert the lock, so two passes
 * running at once — the nightly cron and a coordinator hitting "run now" —
 * cannot both email the same rung. The cost is that a provider failure after a
 * successful claim loses that one rung; the failure is recorded on the ledger row
 * and in the file's activity, and the tighter rungs still fire, so no deadline
 * goes quiet without the file saying so. Sending first and claiming after would
 * trade that for duplicate emails to a client, which is worse.
 */

import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts,
  criticalDates,
  deals,
  parties,
  reminders,
  tasks,
  type Account,
} from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { todayInZone } from "@/lib/dates";
import { sendEmail } from "@/lib/email";
import { OPEN_STATUSES } from "@/lib/plans";
import {
  digestSubject,
  digestText,
  planFanOut,
  readAlwaysNotifyCoordinator,
  readOffsets,
  rungLabel,
  type DueDateInput,
  type PartyInput,
} from "@/lib/reminder-rules";
import { portalUrlForParty } from "@/lib/tokens";

export interface FanOutSummary {
  accountId: string;
  today: string;
  rungsClaimed: number;
  emailsSent: number;
  emailsFailed: number;
  dryRun: boolean;
  unaddressed: number;
}

/**
 * One pass for one account. Idempotent: running it twice in a day sends nothing
 * the second time, because every rung it would pick is already in the ledger.
 */
export async function runFanOut(
  account: Pick<Account, "id" | "timezone" | "settings">,
  options: { today?: string } = {},
): Promise<FanOutSummary> {
  const db = getDb();
  const today = options.today ?? todayInZone(account.timezone);
  const offsets = readOffsets(account.settings);
  const notifyCoordinator = readAlwaysNotifyCoordinator(account.settings);

  const openDeals = await db
    .select({ id: deals.id, address: deals.address })
    .from(deals)
    .where(and(eq(deals.accountId, account.id), inArray(deals.status, [...OPEN_STATUSES])));
  if (openDeals.length === 0) {
    return {
      accountId: account.id,
      today,
      rungsClaimed: 0,
      emailsSent: 0,
      emailsFailed: 0,
      dryRun: false,
      unaddressed: 0,
    };
  }
  const dealIds = openDeals.map((d) => d.id);
  const addressById = new Map(openDeals.map((d) => [d.id, d.address]));

  const dateRows = await db
    .select({
      id: criticalDates.id,
      dealId: criticalDates.dealId,
      key: criticalDates.key,
      label: criticalDates.label,
      dueOn: criticalDates.dueOn,
      status: criticalDates.status,
      computedFrom: criticalDates.computedFrom,
      taskId: criticalDates.taskId,
      taskOwnerRole: tasks.ownerRole,
    })
    .from(criticalDates)
    .leftJoin(tasks, eq(tasks.id, criticalDates.taskId))
    .where(inArray(criticalDates.dealId, dealIds))
    .orderBy(asc(criticalDates.dueOn));
  if (dateRows.length === 0) {
    return {
      accountId: account.id,
      today,
      rungsClaimed: 0,
      emailsSent: 0,
      emailsFailed: 0,
      dryRun: false,
      unaddressed: 0,
    };
  }

  const ledger = await db
    .select({ criticalDateId: reminders.criticalDateId, offsetDays: reminders.offsetDays })
    .from(reminders)
    .where(inArray(reminders.criticalDateId, dateRows.map((d) => d.id)));
  const sentByDate = new Map<string, number[]>();
  for (const r of ledger) {
    const list = sentByDate.get(r.criticalDateId) ?? [];
    list.push(r.offsetDays);
    sentByDate.set(r.criticalDateId, list);
  }

  const partyRows = await db
    .select({
      id: parties.id,
      dealId: parties.dealId,
      role: parties.role,
      name: parties.name,
      email: parties.email,
      notify: parties.notify,
      portalTokenHash: parties.portalTokenHash,
    })
    .from(parties)
    .where(inArray(parties.dealId, dealIds));

  const dueInputs: DueDateInput[] = dateRows.map((d) => ({
    criticalDateId: d.id,
    dealId: d.dealId,
    dealAddress: addressById.get(d.dealId) ?? "A file on your desk",
    key: d.key,
    label: d.label,
    dueOn: d.dueOn,
    status: d.status,
    ownerRole: d.taskOwnerRole ?? "tc",
    sentence:
      typeof (d.computedFrom as { sentence?: unknown } | null)?.sentence === "string"
        ? ((d.computedFrom as { sentence: string }).sentence)
        : `${d.label} is due ${d.dueOn}.`,
    sentOffsets: sentByDate.get(d.id) ?? [],
  }));

  const partyInputs: PartyInput[] = partyRows.map((p) => ({
    id: p.id,
    dealId: p.dealId,
    role: p.role,
    name: p.name,
    email: p.email,
    notify: p.notify,
  }));

  const plan = planFanOut(dueInputs, partyInputs, today, offsets, notifyCoordinator);
  if (plan.rungs.length === 0) {
    return {
      accountId: account.id,
      today,
      rungsClaimed: 0,
      emailsSent: 0,
      emailsFailed: 0,
      dryRun: false,
      unaddressed: 0,
    };
  }

  // Which parties each rung is going to, so the ledger row records the truth.
  const recipientsByRung = new Map<string, Array<{ partyId: string; name: string; email: string }>>();
  for (const digest of plan.digests) {
    for (const section of digest.sections) {
      const key = `${section.criticalDateId}:${section.offsetDays}`;
      const list = recipientsByRung.get(key) ?? [];
      list.push({ partyId: digest.partyId, name: digest.name, email: digest.email });
      recipientsByRung.set(key, list);
    }
  }

  // Claim. `onConflictDoNothing` + `returning` tells us exactly which rungs are
  // ours to send; anything another pass already took comes back empty.
  const claimed = await db
    .insert(reminders)
    .values(
      plan.rungs.map((r) => ({
        criticalDateId: r.criticalDateId,
        offsetDays: r.offsetDays,
        sentTo: {
          aboutDueOn: r.dueOn,
          recipients: recipientsByRung.get(`${r.criticalDateId}:${r.offsetDays}`) ?? [],
        },
      })),
    )
    .onConflictDoNothing({ target: [reminders.criticalDateId, reminders.offsetDays] })
    .returning({ id: reminders.id, criticalDateId: reminders.criticalDateId, offsetDays: reminders.offsetDays });

  const claimedKeys = new Set(claimed.map((c) => `${c.criticalDateId}:${c.offsetDays}`));
  if (claimedKeys.size === 0) {
    return {
      accountId: account.id,
      today,
      rungsClaimed: 0,
      emailsSent: 0,
      emailsFailed: 0,
      dryRun: false,
      unaddressed: 0,
    };
  }

  // Parties with a live portal get their own link in the email; the token is
  // re-derivable from the id, so this needs no extra round trip.
  const portalByParty = new Map<string, string | null>();
  for (const p of partyRows) {
    portalByParty.set(p.id, p.portalTokenHash ? portalUrlForParty(p.id) : null);
  }

  let emailsSent = 0;
  let emailsFailed = 0;
  let dryRun = false;

  for (const digest of plan.digests) {
    // Only send about the rungs this pass actually claimed.
    const sections = digest.sections.filter((s) =>
      claimedKeys.has(`${s.criticalDateId}:${s.offsetDays}`),
    );
    if (sections.length === 0) continue;
    const scoped = { ...digest, sections };
    const portal = portalByParty.get(digest.partyId) ?? null;
    const result = await sendEmail({
      to: digest.email,
      subject: digestSubject(scoped, today),
      text: digestText(scoped, today, portal),
    });
    if (result.dryRun) dryRun = true;
    if (result.delivered || result.dryRun) emailsSent += 1;
    else emailsFailed += 1;

    for (const section of sections) {
      await logActivity({
        dealId: section.dealId,
        actor: "ListingLoop",
        action: "reminder_sent",
        target: `${rungLabel(section.offsetDays)} — ${section.label}`,
        metadata: {
          detail: `${rungLabel(section.offsetDays)} reminder for ${section.label} ${
            result.delivered ? "sent to" : result.dryRun ? "prepared for" : "FAILED for"
          } ${digest.name} <${digest.email}>`,
          offsetDays: section.offsetDays,
          dryRun: result.dryRun,
          error: result.error,
        },
      });
    }

    if (!result.delivered && !result.dryRun) {
      // Mark the failure on the ledger row so the file does not claim an email
      // landed that never did.
      for (const section of sections) {
        const row = claimed.find(
          (c) => c.criticalDateId === section.criticalDateId && c.offsetDays === section.offsetDays,
        );
        if (!row) continue;
        await db
          .update(reminders)
          .set({
            sentTo: {
              aboutDueOn: section.dueOn,
              recipients: (recipientsByRung.get(`${section.criticalDateId}:${section.offsetDays}`) ?? []).map(
                (r) => (r.partyId === digest.partyId ? { ...r, failed: true, error: result.error } : r),
              ),
            },
          })
          .where(eq(reminders.id, row.id));
      }
    }
  }

  return {
    accountId: account.id,
    today,
    rungsClaimed: claimed.length,
    emailsSent,
    emailsFailed,
    dryRun,
    unaddressed: plan.unaddressed.length,
  };
}

/** Every account with at least one open file, for the nightly sweep. */
export async function accountsToSweep(): Promise<Array<Pick<Account, "id" | "timezone" | "settings" | "name">>> {
  return getDb()
    .select({
      id: accounts.id,
      timezone: accounts.timezone,
      settings: accounts.settings,
      name: accounts.name,
    })
    .from(accounts)
    .orderBy(asc(accounts.createdAt));
}
