/**
 * A monitor row. No boxes: a full-bleed hairline row, >=64px, whole row
 * tappable (DESIGN.md component construction).
 *
 * Layout is 8px status dot, name + mono metric, live sparkline right, region
 * dots beneath. Every row shows real content — never a placeholder bar.
 */

import Link from "next/link";
import type { Monitor } from "@/db/schema";
import { Sparkline } from "@/components/Sparkline";
import { StatusDot, statusWord } from "@/components/StatusDot";
import { MonitorTypeIcon } from "@/components/icons";
import { ago, interval, latencyPair, until } from "@/lib/format";

export interface MonitorRowData {
  monitor: Monitor;
  points: number[];
  p50: number | null;
  p99: number | null;
  /** Expiry date for ssl/domain monitors. */
  expiresAt?: Date | null;
}

/** The mono line under the name — different truth per monitor type. */
function metric(data: MonitorRowData): string {
  const { monitor } = data;
  if (monitor.type === "heartbeat") {
    return monitor.lastPingAt
      ? `last ping ${ago(monitor.lastPingAt)}`
      : `no ping yet · every ${interval(monitor.expectedIntervalSeconds ?? 3600)}`;
  }
  if (monitor.type === "ssl" || monitor.type === "domain") {
    return data.expiresAt ? `expires ${until(data.expiresAt)}` : "not scanned yet";
  }
  if (monitor.status === "pending") return `checking every ${interval(monitor.intervalSeconds)}`;
  return latencyPair(data.p50, data.p99);
}

export function MonitorRow({ data }: { data: MonitorRowData }) {
  const { monitor } = data;
  const down = monitor.status === "down";

  return (
    <Link href={`/monitors/${monitor.id}`} className="row">
      <StatusDot status={monitor.status} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <MonitorTypeIcon
            type={monitor.type}
            size={16}
            className="shrink-0 text-[var(--color-text-3)]"
          />
          <span className="t-title truncate">{monitor.name}</span>
        </div>
        <div className="t-data mt-1 truncate" style={{ color: down ? "var(--color-red)" : "var(--color-text-2)" }}>
          {metric(data)}
        </div>
        {monitor.regions.length > 1 ? (
          <div className="mt-1.5 flex gap-1" aria-label={`${monitor.regions.length} regions`}>
            {monitor.regions.map((region) => (
              <span key={region} className="region-dot" data-failing={down} title={region} />
            ))}
          </div>
        ) : null}
      </div>

      {/* Heartbeats have no latency to trace; showing one would be a fiction. */}
      {monitor.type === "http" ? (
        <Sparkline points={data.points} down={down} />
      ) : (
        <span className="t-label" style={{ color: down ? "var(--color-red)" : undefined }}>
          {statusWord(monitor.status)}
        </span>
      )}
    </Link>
  );
}
