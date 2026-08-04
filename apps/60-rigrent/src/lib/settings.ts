/**
 * src/lib/settings.ts
 *
 * `accounts.settings` is jsonb, which means every read has to survive a row
 * written by an older version of the app. This module is the only place that
 * knows the shape: one parser that fills defaults, one merge for the settings
 * form. Nothing else reaches into the blob.
 */

import type { DamageFee } from "@/db/schema";

export interface AccountSettings {
  /** Security deposit as basis points of the rental subtotal. 2500 = 25%. */
  depositPercentBps: number;
  /** A floor, so a $40 linen order still carries a deposit worth holding. */
  depositMinimumCents: number;
  /** Sales tax in basis points. Tax-exempt customers skip it entirely. */
  taxRateBps: number;
  /** Delivery fee added to the subtotal when the order is a delivery. */
  deliveryFeeCents: number;
  /** Damage fees offered on every new item, before the item's own schedule. */
  damageFeeDefaults: DamageFee[];
  /** The rental terms printed on the contract, above the signature. */
  terms: string;
  /** The damage clause the customer initials separately. */
  damageClause: string;
}

export const DEFAULT_TERMS = [
  "Gear is rented for the window shown above and is due back at the yard on the due-back date. A late return is billed at the daily rate for each additional day.",
  "The customer is responsible for the gear from the moment it leaves the yard or is delivered to the site until it is checked back in by our crew. Keep it dry, keep it off the mud, and stack it the way it arrived.",
  "Setup and teardown are the customer's unless the order says otherwise. Do not modify, drill, paint, or adhere anything to rented equipment.",
  "Cancellation more than 7 days before the out date is free. Inside 7 days the deposit is retained as a booking fee.",
].join("\n\n");

export const DEFAULT_DAMAGE_CLAUSE = [
  "Condition is photographed at load-out and again at check-in. Those two photo sets are the record; nobody's memory is.",
  "A security deposit is authorised on the card below as a hold — not a charge. Money moves only against a documented claim: a photographed condition difference on a specific line, priced from the damage fee schedule printed above. Anything not claimed is released, and a clean return releases the whole hold automatically.",
  "Missing gear is billed at the replacement cost shown in the schedule.",
].join("\n\n");

export const DEFAULT_SETTINGS: AccountSettings = {
  depositPercentBps: 2500,
  depositMinimumCents: 5_000,
  taxRateBps: 825,
  deliveryFeeCents: 8_500,
  damageFeeDefaults: [],
  terms: DEFAULT_TERMS,
  damageClause: DEFAULT_DAMAGE_CLAUSE,
};

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function fees(value: unknown): DamageFee[] {
  if (!Array.isArray(value)) return [];
  const out: DamageFee[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label.trim() : "";
    const amountCents = num(record.amountCents, -1);
    if (label && amountCents >= 0) out.push({ label, amountCents });
  }
  return out;
}

/** Read the blob into a complete settings object. Never throws. */
export function parseSettings(raw: unknown): AccountSettings {
  const record = (raw ?? {}) as Record<string, unknown>;
  return {
    depositPercentBps: num(record.depositPercentBps, DEFAULT_SETTINGS.depositPercentBps),
    depositMinimumCents: num(record.depositMinimumCents, DEFAULT_SETTINGS.depositMinimumCents),
    taxRateBps: num(record.taxRateBps, DEFAULT_SETTINGS.taxRateBps),
    deliveryFeeCents: num(record.deliveryFeeCents, DEFAULT_SETTINGS.deliveryFeeCents),
    damageFeeDefaults: fees(record.damageFeeDefaults),
    terms: str(record.terms, DEFAULT_SETTINGS.terms),
    damageClause: str(record.damageClause, DEFAULT_SETTINGS.damageClause),
  };
}

export function mergeSettings(
  current: unknown,
  patch: Partial<AccountSettings>,
): AccountSettings {
  return { ...parseSettings(current), ...patch };
}

/** The damage fee schedule stored on an item, parsed. */
export function parseDamageFees(raw: unknown): DamageFee[] {
  return fees(raw);
}
