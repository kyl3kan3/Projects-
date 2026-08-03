/**
 * Source health, stated plainly.
 *
 * "VA eVA: last success 9h ago" is the whole feature. A monitoring-adjacent
 * product's worst failure is silent staleness — a feed that broke on Tuesday and
 * a radar that keeps looking calm — so every source shows its status word, its
 * last success, and its note verbatim, including the "Sample feed" note that says
 * the rows below it are not live data.
 *
 * Rows, not boxes: hairline-divided, ≥56px, per DESIGN.md.
 */

import { formatFetchedAt } from "@/lib/format";
import { StatusPill, sourceTone } from "@/components/StatusPill";

export interface SourceHealthRow {
  name: string;
  status: "ok" | "degraded" | "down";
  lastSuccessAt: Date | null;
  statusNote: string | null;
}

export function summarizeSources(sources: SourceHealthRow[]): string {
  const bad = sources.filter((source) => source.status === "down");
  const degraded = sources.filter((source) => source.status === "degraded");
  if (sources.length === 0) return "no sources registered";
  if (bad.length === 0 && degraded.length === 0) return "all sources ok";
  const parts: string[] = [];
  if (bad.length) parts.push(`${bad.length} down`);
  if (degraded.length) parts.push(`${degraded.length} degraded`);
  return parts.join(" · ");
}

export function SourceHealth({
  sources,
  timezone,
  now,
}: {
  sources: SourceHealthRow[];
  timezone: string;
  now: Date;
}) {
  return (
    <div className="rows">
      {sources.map((source) => (
        <div key={source.name} className="py-3 flex flex-col gap-1" style={{ minHeight: 56 }}>
          <div className="flex items-center gap-3">
            <span className="t-title flex-1 min-w-0 truncate">{source.name}</span>
            <span className="t-mono" style={{ color: "var(--color-ink-3)" }}>
              {formatFetchedAt(source.lastSuccessAt, timezone, now)}
            </span>
            <StatusPill label={source.status} tone={sourceTone(source.status)} />
          </div>
          {source.statusNote && <p className="t-secondary">{source.statusNote}</p>}
        </div>
      ))}
      {sources.length === 0 && (
        <p className="t-secondary py-3">
          No feeds are registered yet. Run <code className="t-mono">npm run db:seed-sources</code> to
          register SAM.gov and the five launch states.
        </p>
      )}
    </div>
  );
}
