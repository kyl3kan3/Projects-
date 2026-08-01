/**
 * The 12-cell year strip. Paid cells carry a check glyph rather than relying on
 * colour alone, and every cell has a title — the strip is a summary, but it must
 * be readable to someone who cannot distinguish green from red.
 */

import { IconCheck } from "@/components/icons";
import type { StripCell } from "@/lib/ledger-core";
import { formatMoney, monthInitial } from "@/lib/money";

function cellState(cell: StripCell): string {
  if (cell.status === "none") return "none";
  if (cell.status === "due" && cell.lateDays > 0) return "late";
  return cell.status;
}

function cellTitle(cell: StripCell): string {
  const month = `${cell.period}`;
  switch (cell.status) {
    case "none":
      return `${month}: no rent charged`;
    case "paid":
      return `${month}: paid, ${formatMoney(cell.amountCents)}`;
    case "partial":
      return `${month}: part paid, ${formatMoney(cell.outstandingCents)} still owing`;
    case "waived":
      return `${month}: waived`;
    case "upcoming":
      return `${month}: upcoming, ${formatMoney(cell.amountCents)}`;
    case "due":
      return cell.lateDays > 0
        ? `${month}: ${cell.lateDays} day${cell.lateDays === 1 ? "" : "s"} late, ${formatMoney(cell.outstandingCents)} owing`
        : `${month}: due, ${formatMoney(cell.amountCents)}`;
  }
}

export function LedgerStrip({ cells, year }: { cells: StripCell[]; year: number }) {
  return (
    <div>
      <div className="strip" role="list" aria-label={`Rent by month, ${year}`}>
        {cells.map((cell) => (
          <div key={cell.period} className="strip-cell" data-state={cellState(cell)} role="listitem" title={cellTitle(cell)}>
            {cell.status === "paid" ? <IconCheck size={14} /> : null}
            <span className="sr-only">{cellTitle(cell)}</span>
          </div>
        ))}
      </div>
      <div className="strip-labels" aria-hidden="true">
        {cells.map((cell) => (
          <span key={cell.period}>{monthInitial(cell.month)}</span>
        ))}
      </div>
    </div>
  );
}
