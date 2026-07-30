/**
 * The 90-day uptime bar: 90 cells of 3x24px, radius 0, in its own
 * overflow-x:auto track (DESIGN.md). Filled = trace-dim, incident days = red,
 * today = phosphor, no data = hairline.
 *
 * A day with no data renders as an empty cell rather than a green one. Claiming
 * uptime you did not measure is the one thing a status page must never do.
 */

import type { UptimeCell } from "@/lib/status-pages";
import { uptimePct } from "@/lib/format";

function state(cell: UptimeCell): "none" | "ok" | "incident" | "today" {
  if (cell.hadIncident) return "incident";
  if (cell.uptime == null) return "none";
  if (cell.isToday) return "today";
  // Anything short of four nines on a day is worth showing as an incident day.
  return cell.uptime >= 0.9999 ? "ok" : "incident";
}

function title(cell: UptimeCell): string {
  if (cell.uptime == null) return `${cell.day} · no data`;
  return `${cell.day} · ${(cell.uptime * 100).toFixed(2)}%${cell.hadIncident ? " · incident" : ""}`;
}

export function UptimeBars({ cells, uptime90 }: { cells: UptimeCell[]; uptime90: number | null }) {
  const withData = cells.filter((c) => c.uptime != null).length;

  return (
    <div>
      <div className="uptime-track" role="img" aria-label={ariaSummary(cells, uptime90)}>
        {cells.map((cell) => (
          <span
            key={cell.day}
            className="uptime-cell"
            data-state={state(cell)}
            title={title(cell)}
          />
        ))}
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="t-label">90 days ago</span>
        <span className="t-data" style={{ color: "var(--color-text-2)" }}>
          {uptime90 == null ? "no data yet" : `${(uptime90 * 100).toFixed(2)}% uptime`}
          {withData > 0 && withData < cells.length ? ` · ${withData}d measured` : ""}
        </span>
        <span className="t-label">Today</span>
      </div>
    </div>
  );
}

function ariaSummary(cells: UptimeCell[], uptime90: number | null): string {
  const incidents = cells.filter((c) => c.hadIncident).length;
  const pct = uptime90 == null ? "no data" : `${(uptime90 * 100).toFixed(2)} percent`;
  return `90-day uptime ${pct}, ${incidents} day${incidents === 1 ? "" : "s"} with incidents`;
}

/** Compact variant for the dashboard, where the row has less room. */
export function UptimeSummary({ ok, total }: { ok: number; total: number }) {
  return <span className="t-data">{uptimePct(ok, total)}</span>;
}
