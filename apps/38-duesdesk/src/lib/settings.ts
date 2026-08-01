/**
 * Association defaults.
 *
 * Separate module so the cron routes, the reminder sweep, and the tests can read
 * the defaults without importing `auth.ts` and, through it, `next/headers`.
 */

import type { AssociationSettings } from "@/db/schema";
import { DEFAULT_REMINDER_LADDER } from "@/lib/ledger";

export const DEFAULT_SETTINGS: AssociationSettings = {
  reminderLadder: DEFAULT_REMINDER_LADDER,
  fiscalYearStartMonth: 1,
  invoiceFooter: "Questions about this invoice? Reply to this email and the board will answer.",
};

/** Merge a stored settings blob over the defaults, so new keys are never null. */
export function withDefaults(stored: AssociationSettings | null): AssociationSettings {
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}
