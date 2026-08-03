/**
 * Cert expiry: status derivation and the escalation ladder.
 *
 * Two traps this module exists to avoid.
 *
 * **A status column that goes stale.** Nothing stores a cert's status. It is
 * derived from the expiry date and today's date in the company's own zone, every
 * time it is displayed, so a matrix can never show "valid" on a card that
 * lapsed in March.
 *
 * **A ladder that either never stops or never starts.** The rung selected is the
 * *tightest* one crossed, not the loosest: a cert 20 days out gets the 30-day
 * notice, not the 60-day one, and then the 7-day notice a fortnight later. And
 * "overdue" is a single rung with its own ledger row, so an expired cert
 * generates exactly one overdue notice — not one every morning until somebody
 * renews it or unsubscribes.
 *
 * Pure module: no db, no env.
 */

import type { CertKind, CertStatus, ReminderChannel, ReminderRung } from "@/db/schema";
import { daysBetween, type IsoDate } from "@/lib/dates";

/** Days before expiry at which a cert starts reading "expiring". */
export const EXPIRING_WINDOW_DAYS = 60;

export function deriveStatus(expiresOn: IsoDate | null, today: IsoDate): CertStatus {
  // No expiry date means nothing to expire — OSHA 10 has no federal expiry.
  if (!expiresOn) return "valid";
  const days = daysBetween(today, expiresOn);
  if (days < 0) return "expired";
  if (days <= EXPIRING_WINDOW_DAYS) return "expiring";
  return "valid";
}

/** Days until expiry; negative when already expired; null when there is no date. */
export function daysUntilExpiry(expiresOn: IsoDate | null, today: IsoDate): number | null {
  return expiresOn ? daysBetween(today, expiresOn) : null;
}

export const LADDER: { rung: ReminderRung; withinDays: number; channels: ReminderChannel[] }[] = [
  { rung: "7d", withinDays: 7, channels: ["email", "sms"] },
  { rung: "30d", withinDays: 30, channels: ["email"] },
  { rung: "60d", withinDays: 60, channels: ["email"] },
];

export interface DueRung {
  rung: ReminderRung;
  channels: ReminderChannel[];
  daysUntil: number;
}

/**
 * The rung a cert is on today, or null when it is not on the ladder at all.
 * Tightest crossed rung wins.
 */
export function dueRung(expiresOn: IsoDate | null, today: IsoDate): DueRung | null {
  if (!expiresOn) return null;
  const days = daysBetween(today, expiresOn);
  if (days < 0) {
    // One notice, pinned to the expiry itself. Not one a day, forever.
    return { rung: "overdue", channels: ["email", "sms"], daysUntil: days };
  }
  for (const step of LADDER) {
    if (days <= step.withinDays) {
      return { rung: step.rung, channels: step.channels, daysUntil: days };
    }
  }
  return null;
}

export const CERT_KIND_LABELS: Record<CertKind, string> = {
  osha_10: "OSHA 10",
  osha_30: "OSHA 30",
  first_aid_cpr: "First aid / CPR",
  fit_test: "Respirator fit test",
  license: "License",
  custom: "Other",
};

/** Typical renewal intervals, used to pre-fill the expiry field. */
export const CERT_KIND_DEFAULT_MONTHS: Record<CertKind, number | null> = {
  osha_10: null,
  osha_30: null,
  first_aid_cpr: 24,
  fit_test: 12,
  license: 24,
  custom: null,
};

export function certKindLabel(kind: CertKind): string {
  return CERT_KIND_LABELS[kind];
}

/** "EXPIRES IN 12 DAYS" / "EXPIRED 41 DAYS AGO" / "NO EXPIRY". */
export function expiryLabel(expiresOn: IsoDate | null, today: IsoDate): string {
  if (!expiresOn) return "NO EXPIRY";
  const days = daysBetween(today, expiresOn);
  if (days === 0) return "EXPIRES TODAY";
  if (days > 0) return `EXPIRES IN ${days} DAY${days === 1 ? "" : "S"}`;
  const ago = Math.abs(days);
  return `EXPIRED ${ago} DAY${ago === 1 ? "" : "S"} AGO`;
}
