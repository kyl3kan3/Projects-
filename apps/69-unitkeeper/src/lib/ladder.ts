/**
 * The late ladder, as pure logic.
 *
 * A ladder is a list of rungs pinned to fixed distances from the day the tenant
 * went late: retry at day 3, late fee at day 6, overlock at day 11, lien-eligible
 * at day 30. Two failure modes are designed out here rather than patched later:
 *
 *  - **It never runs forever.** Every rung is at a fixed offset from one dated
 *    event, so a tenant 400 days delinquent has the same four rungs as one 40
 *    days delinquent — not 400 daily emails.
 *  - **It never goes silent.** Crossing several rungs at once (a tick that did
 *    not run for a week) fires *every* unfired rung it passed, in order. Picking
 *    only the loosest crossed threshold is how a day-3 retry fires and nothing
 *    ever happens again.
 *
 * Exactly-once is enforced by the caller's unique index on
 * (tenancy, cycle, day, action) — see src/db/schema.ts. This module only decides
 * *which* rungs are due; ladder-run.ts writes them.
 */

import type { LadderAction } from "@/db/schema";

export interface LadderStep {
  day: number;
  action: LadderAction;
  feeCents?: number;
}

/** A rung already recorded for this cycle. */
export interface FiredRung {
  day: number;
  action: LadderAction;
}

/**
 * Sort by day, drop nonsense, and cap a fee at something a court would not
 * choke on. Owner settings arrive as jsonb and can be anything.
 */
export function normalizeLadder(input: unknown): LadderStep[] {
  if (!Array.isArray(input)) return [];
  const valid: LadderStep[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const step = raw as Record<string, unknown>;
    const day = Number(step.day);
    const action = String(step.action) as LadderAction;
    if (!Number.isInteger(day) || day < 0 || day > 365) continue;
    if (!["retry", "late_fee", "overlock", "lien_eligible"].includes(action)) continue;
    const feeCents = Number(step.feeCents);
    valid.push({
      day,
      action,
      ...(action === "late_fee"
        ? { feeCents: Number.isFinite(feeCents) && feeCents > 0 ? Math.trunc(feeCents) : 0 }
        : {}),
    });
  }
  // One rung per (day, action): a duplicate in settings must not become a
  // duplicate fee.
  const seen = new Set<string>();
  return valid
    .filter((s) => {
      const key = `${s.day}:${s.action}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.day - b.day || a.action.localeCompare(b.action));
}

/**
 * Every rung crossed by `daysLate` that this cycle has not already fired, in
 * ladder order. Firing them in order matters: the fee is on the ledger before the
 * overlock notice quotes a balance.
 */
export function dueRungs(
  ladder: readonly LadderStep[],
  daysLate: number,
  fired: readonly FiredRung[],
): LadderStep[] {
  const already = new Set(fired.map((f) => `${f.day}:${f.action}`));
  return normalizeLadder(ladder as unknown[]).filter(
    (step) => step.day <= daysLate && !already.has(`${step.day}:${step.action}`),
  );
}

/** The next rung that has not been reached yet — what the board previews. */
export function nextRung(
  ladder: readonly LadderStep[],
  daysLate: number,
): LadderStep | null {
  return normalizeLadder(ladder as unknown[]).find((step) => step.day > daysLate) ?? null;
}

/** The rung that opens a lien case, if the owner configured one. */
export function lienEligibleDay(ladder: readonly LadderStep[]): number | null {
  const step = normalizeLadder(ladder as unknown[]).find((s) => s.action === "lien_eligible");
  return step ? step.day : null;
}

export function describeAction(action: LadderAction): string {
  switch (action) {
    case "retry":
      return "Retry the card on file";
    case "late_fee":
      return "Post the late fee";
    case "overlock":
      return "Flag for overlock";
    case "lien_eligible":
      return "Lien-eligible — the owner decides";
  }
}

export function actionPlacard(action: LadderAction): string {
  switch (action) {
    case "retry":
      return "Retry";
    case "late_fee":
      return "Late fee";
    case "overlock":
      return "Overlock";
    case "lien_eligible":
      return "Lien-eligible";
  }
}
