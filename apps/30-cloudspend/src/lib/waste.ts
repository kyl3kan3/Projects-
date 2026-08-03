/**
 * The waste report — "the roast".
 *
 * README.md scopes it precisely: "idle instances, unattached volumes, old
 * snapshots, over-provisioned resources (top 10, dollar-ranked)". So the ranking
 * is on dollars per month and the list is capped at ten; a list of forty findings
 * is a list nobody actions.
 *
 * The recoverable total rolls *down* as items are actioned, which is why the
 * total is always derived from the open findings rather than stored.
 *
 * Pure module.
 */

import type { WasteKind, WasteStatus } from "@/db/schema";

export const TOP_N = 10;

export interface RankableFinding {
  kind: WasteKind;
  estMonthlySavingMicros: number;
  status: WasteStatus;
}

/** Open findings only, dollar-ranked, capped at ten. */
export function rankFindings<T extends RankableFinding>(findings: T[]): T[] {
  return findings
    .filter((f) => f.status === "open")
    .sort((a, b) => b.estMonthlySavingMicros - a.estMonthlySavingMicros)
    .slice(0, TOP_N);
}

/** What is still on the table. Derived, so actioning an item moves it. */
export function recoverableMicros(findings: RankableFinding[]): number {
  return findings
    .filter((f) => f.status === "open")
    .reduce((sum, f) => sum + f.estMonthlySavingMicros, 0);
}

/** What has been recovered — the number that makes the report worth reading. */
export function recoveredMicros(findings: RankableFinding[]): number {
  return findings
    .filter((f) => f.status === "done")
    .reduce((sum, f) => sum + f.estMonthlySavingMicros, 0);
}

const KIND_LABELS: Record<WasteKind, string> = {
  idle_instance: "Idle",
  unattached_ebs: "Unattached",
  old_snapshot: "Stale",
  oversized: "Oversized",
};

export function kindLabel(kind: WasteKind): string {
  return KIND_LABELS[kind] ?? "Waste";
}

/**
 * Merge a fresh scan into what is already stored. A finding that has been
 * actioned must not silently reopen because the scan still sees the resource for
 * a few hours — cloud deletes are eventually consistent, and a report that
 * un-ticks a completed item is a report the customer stops trusting.
 *
 * A finding that has *disappeared* from the scan is closed as done: the resource
 * is gone, which is the outcome the report was asking for.
 */
export interface StoredFinding {
  resourceKey: string;
  kind: WasteKind;
  status: WasteStatus;
  estMonthlySavingMicros: number;
}

export interface ScannedFinding {
  resourceKey: string;
  kind: WasteKind;
  estMonthlySavingMicros: number;
}

export interface MergePlan<S extends ScannedFinding> {
  insert: S[];
  /** Findings whose figures changed and are still open. */
  update: S[];
  /** Keys the scan no longer reports; the resource is gone. */
  close: string[];
  /** Keys the scan still reports but the customer has already dealt with. */
  unchanged: string[];
}

function key(f: { kind: WasteKind; resourceKey: string }): string {
  return `${f.kind}:${f.resourceKey}`;
}

export function planMerge<S extends ScannedFinding>(
  stored: StoredFinding[],
  scanned: S[],
): MergePlan<S> {
  const storedByKey = new Map(stored.map((f) => [key(f), f]));
  const scannedKeys = new Set(scanned.map(key));

  const plan: MergePlan<S> = { insert: [], update: [], close: [], unchanged: [] };

  for (const finding of scanned) {
    const existing = storedByKey.get(key(finding));
    if (!existing) {
      plan.insert.push(finding);
      continue;
    }
    if (existing.status !== "open") {
      plan.unchanged.push(key(finding));
      continue;
    }
    plan.update.push(finding);
  }

  for (const finding of stored) {
    if (finding.status !== "open") continue;
    if (!scannedKeys.has(key(finding))) plan.close.push(key(finding));
  }

  return plan;
}
