/**
 * src/components/ChalkGauge.tsx
 *
 * The signature element (DESIGN.md): a 4px track in `line`, filled in `canvas`
 * to booked/owned for the quote's window, with the fraction beside it in Plex
 * Mono. The overrun segment renders `rust` and the parent names the conflicting
 * order.
 *
 * It is a server component with no state of its own — the gauge is a rendering
 * of a number, and the 180ms fill is a CSS transition on `width`, so the same
 * component works in the inventory list, the quote builder, and the landing
 * device without any of them shipping JavaScript for it.
 */

import { gauge, gaugeFraction, type AvailabilityFacts } from "@/lib/availability-core";

export interface ChalkGaugeProps {
  facts: AvailabilityFacts;
  /** What this quote line is asking for. Omit for a pure availability read. */
  requested?: number;
  /** Hide the numeric fraction — for the landing device, where it is drawn separately. */
  hideFraction?: boolean;
}

export function ChalkGauge({ facts, requested = 0, hideFraction = false }: ChalkGaugeProps) {
  const g = gauge(facts, requested);
  const pct = (fraction: number) => `${Math.min(100, Math.max(0, fraction * 100))}%`;

  return (
    <div className="gauge" data-overbooked={g.overbooked ? "true" : "false"}>
      <div
        className="gauge-track"
        role="img"
        aria-label={
          g.overbooked
            ? `${facts.itemName}: ${g.bookedCount + g.heldCount} of ${g.ownedCount} committed, ${g.requestedCount} requested, ${g.overrunCount} over`
            : `${facts.itemName}: ${g.bookedCount + g.heldCount + g.requestedCount} of ${g.ownedCount} committed`
        }
      >
        <div className="gauge-seg gauge-booked" style={{ width: pct(g.bookedFraction) }} />
        <div
          className="gauge-seg gauge-requested"
          style={{ left: pct(g.bookedFraction), width: pct(g.requestedFraction) }}
        />
        {g.overbooked ? (
          <div
            className="gauge-seg gauge-overrun"
            style={{
              left: pct(g.bookedFraction + g.requestedFraction),
              width: pct(g.overrunFraction),
            }}
          />
        ) : null}
      </div>
      {hideFraction ? null : <span className="gauge-fraction">{gaugeFraction(g)}</span>}
    </div>
  );
}

/**
 * The next-30-days strip on an inventory row (DESIGN.md screen 1). One 3px bar
 * per day, shaded by how much of the item is committed that day — the shape of a
 * busy Saturday, at a glance, without a chart library.
 */
export function LoadStrip({
  perDay,
  owned,
}: {
  perDay: readonly number[];
  owned: number;
}) {
  const level = (committed: number): "none" | "some" | "most" | "full" => {
    if (owned <= 0 || committed <= 0) return "none";
    const ratio = committed / owned;
    if (ratio >= 1) return "full";
    if (ratio >= 0.6) return "most";
    return "some";
  };
  return (
    <div className="strip" aria-hidden="true">
      {perDay.map((committed, i) => {
        const load = level(committed);
        const height = owned > 0 ? Math.max(3, Math.round(Math.min(1, committed / owned) * 16)) : 3;
        return (
          <span
            key={i}
            className="strip-day"
            data-load={load}
            style={{ height: `${load === "none" ? 3 : height}px` }}
          />
        );
      })}
    </div>
  );
}
