/**
 * src/lib/reminder-rules.ts
 *
 * Which reminder fires today, to whom, and what it says. Pure — no db, no email
 * — because this is the logic that has to be right and the two ways it goes
 * wrong are both silent:
 *
 *  1. **Never stopping.** An "overdue" state stays true forever, so a naive
 *     sweep mails the same buyer every morning until the file closes. Reminders
 *     here are pinned to fixed distances *before* the date; once the date has
 *     passed, nothing fires at all. The file shows MISSED; it does not nag.
 *
 *  2. **Going silent.** Picking the loosest crossed rung means a T-7 fires and
 *     nothing ever does again — every later rung has "already been passed". This
 *     picks the TIGHTEST crossed rung, so a file opened four days out gets its
 *     T-3 today and its T-1 on the day before, and the ledger's unique index on
 *     (critical_date_id, offset_days) makes each rung exactly-once.
 */

import { daysBetween, formatLong, relativeDays, type StoredDateStatus } from "@/lib/dates";
import { PARTY_ROLE_LABELS } from "@/lib/templates";
import type { PartyRole } from "@/db/schema";

export const DEFAULT_OFFSETS = [7, 3, 1] as const;

/** Read `accounts.settings.reminderOffsets`, refusing anything unusable. */
export function readOffsets(settings: unknown): number[] {
  const raw = (settings as { reminderOffsets?: unknown } | null)?.reminderOffsets;
  if (!Array.isArray(raw)) return [...DEFAULT_OFFSETS];
  const cleaned = raw
    .map((n) => (typeof n === "number" ? Math.trunc(n) : Number.NaN))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 90);
  const unique = [...new Set(cleaned)].sort((a, b) => b - a);
  return unique.length > 0 ? unique : [...DEFAULT_OFFSETS];
}

export function readAlwaysNotifyCoordinator(settings: unknown): boolean {
  const raw = (settings as { alwaysNotifyCoordinator?: unknown } | null)?.alwaysNotifyCoordinator;
  return raw === undefined ? true : raw === true;
}

/**
 * The rung to fire today, or null for silence.
 *
 * `offsets` is descending (7, 3, 1). `sent` is the offsets already in the ledger
 * for this date.
 */
export function selectOffset(
  dueOn: string,
  todayIso: string,
  offsets: readonly number[],
  sent: readonly number[],
): number | null {
  const daysUntil = daysBetween(todayIso, dueOn);
  // Past due: the reminder ladder is finished. The timeline says MISSED.
  if (daysUntil < 0) return null;
  const crossed = offsets.filter((o) => daysUntil <= o);
  if (crossed.length === 0) return null;
  // The tightest crossed rung — never the loosest.
  const tightest = Math.min(...crossed);
  if (sent.includes(tightest)) return null;
  return tightest;
}

/* ------------------------------------------------------------- fan-out plan */

export interface DueDateInput {
  criticalDateId: string;
  dealId: string;
  dealAddress: string;
  key: string;
  label: string;
  dueOn: string | null;
  status: StoredDateStatus;
  ownerRole: string;
  sentence: string;
  sentOffsets: number[];
}

export interface PartyInput {
  id: string;
  dealId: string;
  role: PartyRole;
  name: string;
  email: string | null;
  notify: boolean;
}

export interface DigestSection {
  criticalDateId: string;
  dealId: string;
  dealAddress: string;
  label: string;
  dueOn: string;
  offsetDays: number;
  sentence: string;
}

export interface Digest {
  partyId: string;
  name: string;
  email: string;
  sections: DigestSection[];
}

export interface FanOutPlan {
  /** One row to claim per (date, offset) — the exactly-once ledger. */
  rungs: Array<{ criticalDateId: string; offsetDays: number; dueOn: string; label: string }>;
  /** One email per party per pass, however many dates landed on them. */
  digests: Digest[];
  /** Dates whose rung fired but that have nobody to tell. */
  unaddressed: Array<{ criticalDateId: string; label: string; ownerRole: string }>;
}

/**
 * Build today's fan-out. Recipients for a date are the parties holding its owner
 * role, plus the coordinator when the account asks for that — a coordinator who
 * stops seeing their own deadlines is the whole problem this product solves.
 */
export function planFanOut(
  dates: readonly DueDateInput[],
  parties: readonly PartyInput[],
  todayIso: string,
  offsets: readonly number[],
  alwaysNotifyCoordinator: boolean,
): FanOutPlan {
  const byDeal = new Map<string, PartyInput[]>();
  for (const p of parties) {
    const list = byDeal.get(p.dealId) ?? [];
    list.push(p);
    byDeal.set(p.dealId, list);
  }

  const rungs: FanOutPlan["rungs"] = [];
  const digestsByParty = new Map<string, Digest>();
  const unaddressed: FanOutPlan["unaddressed"] = [];

  for (const date of dates) {
    if (date.status === "met" || date.status === "waived") continue;
    if (!date.dueOn) continue;
    const offsetDays = selectOffset(date.dueOn, todayIso, offsets, date.sentOffsets);
    if (offsetDays === null) continue;

    const dealParties = byDeal.get(date.dealId) ?? [];
    const recipients = dealParties.filter((p) => {
      if (!p.notify || !p.email) return false;
      if (p.role === date.ownerRole) return true;
      return alwaysNotifyCoordinator && p.role === "tc";
    });

    rungs.push({
      criticalDateId: date.criticalDateId,
      offsetDays,
      dueOn: date.dueOn,
      label: date.label,
    });

    if (recipients.length === 0) {
      unaddressed.push({
        criticalDateId: date.criticalDateId,
        label: date.label,
        ownerRole: date.ownerRole,
      });
      continue;
    }

    for (const p of recipients) {
      const existing = digestsByParty.get(p.id);
      const section: DigestSection = {
        criticalDateId: date.criticalDateId,
        dealId: date.dealId,
        dealAddress: date.dealAddress,
        label: date.label,
        dueOn: date.dueOn,
        offsetDays,
        sentence: date.sentence,
      };
      if (existing) existing.sections.push(section);
      else
        digestsByParty.set(p.id, {
          partyId: p.id,
          name: p.name,
          // Narrowed by the filter above.
          email: p.email as string,
          sections: [section],
        });
    }
  }

  const digests = [...digestsByParty.values()];
  for (const d of digests) {
    d.sections.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.label.localeCompare(b.label));
  }
  return { rungs, digests, unaddressed };
}

/* --------------------------------------------------------------- the copy */

export function digestSubject(digest: Digest, todayIso: string): string {
  const first = digest.sections[0];
  if (!first) return "Your transaction: nothing due";
  if (digest.sections.length === 1) {
    return `${first.label} — ${relativeDays(todayIso, first.dueOn)} (${first.dealAddress})`;
  }
  const soonest = digest.sections[0];
  return `${digest.sections.length} dates coming up — next ${relativeDays(
    todayIso,
    soonest.dueOn,
  )} (${soonest.dealAddress})`;
}

/**
 * Plain text, written the way a coordinator writes: the date, what it is, and
 * why it falls where it does. No marketing, no unsubscribe theatre on a
 * transaction email a party is a signatory to.
 */
export function digestText(digest: Digest, todayIso: string, portalUrl: string | null): string {
  const lines: string[] = [`${digest.name},`, ""];
  lines.push(
    digest.sections.length === 1
      ? "One date on your transaction is coming up."
      : `${digest.sections.length} dates on your transaction are coming up.`,
  );
  lines.push("");
  for (const s of digest.sections) {
    lines.push(`${s.label}`);
    lines.push(`  ${formatLong(s.dueOn)} — ${relativeDays(todayIso, s.dueOn)}`);
    lines.push(`  ${s.dealAddress}`);
    lines.push(`  How this date was computed: ${s.sentence}`);
    lines.push("");
  }
  if (portalUrl) {
    lines.push("Everything on the file, including anything we need from you:");
    lines.push(portalUrl);
    lines.push("");
  }
  lines.push("Reply to this email if a date looks wrong — it will reach your coordinator.");
  return lines.join("\n");
}

export function ownerRoleLabel(role: string): string {
  return PARTY_ROLE_LABELS[role as PartyRole] ?? role;
}

/** "T-3" / "on the day" — how a rung is named in the ledger UI. */
export function rungLabel(offsetDays: number): string {
  return offsetDays === 0 ? "on the day" : `T-${offsetDays}`;
}

function rungList(offsets: readonly number[]): string {
  const names = [...offsets].sort((a, b) => b - a).map(rungLabel);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * What the reminder ladder will still do for a date that just moved.
 *
 * The ledger is append-only — a reminder that went out is a fact about an email
 * a party received, and a recompute must not erase it. The consequence is that a
 * date pushed further out keeps only its unspent rungs, so the coordinator is
 * told plainly which warnings already went and which are still coming. That
 * turns the one case the ladder cannot cover (every rung spent, then the date
 * moves later) from a silent gap into a sentence on the diff preview.
 */
export function remindersOutlook(
  spentOffsets: readonly number[],
  newDueOn: string | null,
  todayIso: string,
  offsets: readonly number[],
): string {
  if (!newDueOn) {
    return spentOffsets.length > 0
      ? `${rungList(spentOffsets)} already went out; nothing further fires until this date is computable again.`
      : "No reminders have gone out for this date yet.";
  }
  const remaining = offsets
    .filter((o) => !spentOffsets.includes(o))
    .filter((o) => daysBetween(todayIso, newDueOn) >= 0 && o <= daysBetween(todayIso, newDueOn) + o)
    .sort((a, b) => b - a);
  const sentPart =
    spentOffsets.length > 0 ? `${rungList(spentOffsets)} already went out for the old date. ` : "";
  if (daysBetween(todayIso, newDueOn) < 0) {
    return `${sentPart}The new date is in the past, so no further reminders fire.`;
  }
  if (remaining.length === 0) {
    return `${sentPart}Every reminder for this date has been used — nothing further will fire.`;
  }
  const next = Math.max(...remaining);
  const fireOn = daysBetween(todayIso, newDueOn) <= next ? "on the next pass" : "when it comes due";
  return `${sentPart}${rungList(remaining)} still to fire — the next ${fireOn}.`;
}
