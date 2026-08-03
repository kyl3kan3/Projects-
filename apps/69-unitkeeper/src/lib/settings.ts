/**
 * Owner settings live in a jsonb column, which means they can be anything at all
 * by the time they come back out. This module is the only place that reads them,
 * so every screen and every job sees the same normalised shape.
 */

import { DEFAULT_SETTINGS, type OwnerSettings } from "@/db/schema";
import { normalizeLadder, actionPlacard } from "@/lib/ladder";
import { formatMoney } from "@/lib/money";

export function readSettings(raw: unknown): OwnerSettings {
  const value = (raw ?? {}) as Partial<OwnerSettings>;
  const ladder = normalizeLadder(value.lateLadder as unknown[]);
  const dueDay = Number(value.rentDueDay);
  return {
    lateLadder: ladder.length > 0 ? ladder : DEFAULT_SETTINGS.lateLadder,
    prorateRule: value.prorateRule === "full_month" ? "full_month" : "daily",
    rentDueDay: Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 28 ? dueDay : 1,
    legalName: typeof value.legalName === "string" ? value.legalName : "",
    facilityTerms:
      typeof value.facilityTerms === "string" ? value.facilityTerms : DEFAULT_SETTINGS.facilityTerms,
  };
}

/** The ladder as one sentence, for the lease's late-charges clause. */
export function ladderSentence(settings: OwnerSettings): string {
  const parts = settings.lateLadder.map((step) => {
    switch (step.action) {
      case "retry":
        return `on day ${step.day} the payment method on file is retried`;
      case "late_fee":
        return `on day ${step.day} a late charge of ${formatMoney(step.feeCents ?? 0)} is added`;
      case "overlock":
        return `on day ${step.day} the unit is overlocked and the gate code stops working`;
      case "lien_eligible":
        return `on day ${step.day} the account becomes eligible for lien proceedings under state law`;
    }
  });
  return `${parts.join("; ")}.`;
}

export function ladderPlacards(settings: OwnerSettings): string[] {
  return settings.lateLadder.map(
    (s) => `Day ${s.day} · ${actionPlacard(s.action)}${s.action === "late_fee" ? ` ${formatMoney(s.feeCents ?? 0)}` : ""}`,
  );
}
