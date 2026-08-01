/**
 * When a digest is due, and which period it covers — the pure half of lib/digests.
 *
 * These two functions are the entire defence against the failure mode that kills email
 * products: a state that stays true ("this SKU is still overdue", "this stock is still
 * dead") mailed on every sweep until the merchant files the sender under spam.
 *
 * A digest is pinned to a **period**, never to a condition. The period key is what the
 * unique index on `digest_sends` enforces, so "once per week" is a database guarantee
 * rather than a promise made in a loop.
 *
 * Kept free of database imports so both halves can be tested directly.
 */

import type { DigestKind, ShopSettings } from "@/db/schema";
import { isoWeekKey, isoWeekday, monthKey } from "@/lib/dates";

/** The period a digest of this kind covers, as of a given local date. */
export function periodKeyFor(kind: DigestKind, localDate: string): string {
  return kind === "weekly_reorder" ? isoWeekKey(localDate) : monthKey(localDate);
}

/**
 * Is this digest due today for a shop with these settings?
 *
 * Weekly: on the merchant's chosen weekday. Monthly: in the first three days of the
 * month, so a shop whose sweep was down on the 1st still gets its report rather than
 * skipping a month — and the period key stops those three days becoming three emails.
 */
export function digestDueOn(
  kind: DigestKind,
  settings: ShopSettings,
  localDate: string,
): boolean {
  if (kind === "weekly_reorder") {
    if (!settings.weeklyDigestEnabled) return false;
    return isoWeekday(localDate) === settings.digestWeekday;
  }
  if (!settings.monthlyDeadStockEnabled) return false;
  return Number(localDate.slice(8, 10)) <= 3;
}
