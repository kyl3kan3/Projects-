/**
 * Shop settings: defaults, merge, and validation.
 *
 * Defaults are deliberately conservative — a merchant who never opens the
 * settings screen should get suggestions that err toward "you have stock" rather
 * than toward "you have cash tied up", because a stockout costs revenue the
 * merchant can never recover while overstock costs interest on cash they still
 * own. 14 days of lead time is Shopify's own rough default for a domestic
 * supplier; 7 days of safety is one reorder cycle of slack.
 */

import type { ShopSettings } from "@/db/schema";

export const DEFAULT_SETTINGS: ShopSettings = {
  safetyDays: 7,
  defaultLeadTimeDays: 14,
  coverTargetDays: 30,
  overstockCoverDays: 60,
  deadCoverDays: 120,
  orderSoonDays: 7,
  riskHorizonDays: 30,
  digestWeekday: 1,
  weeklyDigestEnabled: true,
  monthlyDeadStockEnabled: true,
};

const RANGES: Record<keyof ShopSettings, [number, number] | null> = {
  safetyDays: [0, 120],
  defaultLeadTimeDays: [1, 365],
  coverTargetDays: [7, 365],
  overstockCoverDays: [14, 730],
  deadCoverDays: [30, 1095],
  orderSoonDays: [1, 60],
  riskHorizonDays: [7, 180],
  digestWeekday: [1, 7],
  weeklyDigestEnabled: null,
  monthlyDeadStockEnabled: null,
};

function clampNumber(value: unknown, range: [number, number], fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(range[1], Math.max(range[0], Math.round(n)));
}

/**
 * Stored settings merged over the defaults, with every value clamped.
 *
 * The jsonb column can hold anything a past version of the app wrote, so this is
 * the only place settings are read from — a nonsense `deadCoverDays: 0` must not
 * reclassify a merchant's whole catalogue as dead stock.
 */
export function resolveSettings(stored: Partial<ShopSettings> | null | undefined): ShopSettings {
  const out = { ...DEFAULT_SETTINGS };
  if (!stored) return out;
  for (const key of Object.keys(RANGES) as (keyof ShopSettings)[]) {
    const raw = (stored as Record<string, unknown>)[key];
    if (raw === undefined || raw === null) continue;
    const range = RANGES[key];
    if (range === null) {
      (out as Record<string, unknown>)[key] = Boolean(raw);
    } else {
      (out as Record<string, unknown>)[key] = clampNumber(raw, range, DEFAULT_SETTINGS[key] as number);
    }
  }
  // Overstock must sit below dead, or the overstocked bucket can never be reached.
  if (out.overstockCoverDays >= out.deadCoverDays) {
    out.overstockCoverDays = Math.max(14, Math.floor(out.deadCoverDays / 2));
  }
  return out;
}

/** Thresholds slice, for lib/reorder. */
export function thresholdsFrom(settings: ShopSettings) {
  return {
    orderSoonDays: settings.orderSoonDays,
    overstockCoverDays: settings.overstockCoverDays,
    deadCoverDays: settings.deadCoverDays,
    riskHorizonDays: settings.riskHorizonDays,
  };
}
