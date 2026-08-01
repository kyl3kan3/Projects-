/**
 * The job cost bar — the one place a semantic colour fills width (DESIGN.md).
 *
 * A 4px track, radius 2, filled proportionally: foreman under 80% of the bid,
 * amber from 80 to 100, red past 100. Never taller, never a gradient, and always
 * accompanied by the numbers in words, because a bar alone is not a figure you
 * could defend in an argument.
 */

import { costBarFill, costBarState } from "@/lib/job-costing";

export function CostBar({ percentOfBid }: { percentOfBid: number | null }) {
  const state = costBarState(percentOfBid);
  if (state === "unbid") {
    return <div className="costbar" aria-hidden="true" />;
  }
  return (
    <div
      className="costbar"
      role="meter"
      aria-valuenow={Math.round(percentOfBid ?? 0)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span data-state={state} style={{ width: `${costBarFill(percentOfBid) * 100}%` }} />
    </div>
  );
}
