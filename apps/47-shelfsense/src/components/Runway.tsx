"use client";

/**
 * The runway — this app's one signature detail.
 *
 * A 4px track in hairline; the stock fill drains left→right toward the projected
 * stockout date; the reorder point is a 2px kraft notch with its date beneath; the
 * lead-time span is hatched. When a fresh forecast lands the fill animates to its
 * new length in 400ms `ease-out-quart` and the notch slides in 240ms — one property
 * leads (the fill), everything else follows.
 *
 * Pure CSS transforms on two absolutely-positioned bars. No canvas, no chart
 * library, nothing that costs a frame on a mid Android. The re-draw runs on mount
 * because that is when a new forecast has, by definition, just arrived: the server
 * renders the old length and the first frame after hydration animates to the new
 * one. With `prefers-reduced-motion` the fill is simply the right length from the
 * start, and the dates below it say everything the animation said.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { shortDate, shortDateRelativeTo } from "@/lib/dates";

/**
 * The furthest the track ever reaches. Beyond this the chart stops being a chart and
 * the figures below it are the honest answer.
 */
const MAX_HORIZON_DAYS = 120;

export interface RunwayProps {
  /** Units on hand today. */
  available: number;
  blendedVelocity: number;
  reorderPoint: number;
  leadTimeDays: number;
  safetyDays: number;
  /** yyyy-mm-dd. */
  today: string;
  stockoutDate: string | null;
  orderByDate: string | null;
  /** Horizon of the track in days. */
  horizonDays?: number;
}

export function Runway({
  available,
  blendedVelocity,
  reorderPoint,
  leadTimeDays,
  safetyDays,
  today,
  stockoutDate,
  orderByDate,
  horizonDays,
}: RunwayProps) {
  const model = useMemo(() => {
    const daysToEmpty = blendedVelocity > 0 ? available / blendedVelocity : null;
    // The track spans far enough to show the whole depletion plus the lead time, so
    // the notch and the hatch are always on screen — but capped, because a SKU with
    // 1,800 days of cover would otherwise produce a 130-label axis and squash every
    // interesting part of the chart into the first pixel. Past the cap the runway
    // simply says so and the numbers below carry the detail.
    const uncapped = Math.ceil(
      horizonDays ?? Math.max((daysToEmpty ?? 30) + 4, leadTimeDays + safetyDays + 6),
    );
    const horizon = Math.min(MAX_HORIZON_DAYS, Math.max(14, uncapped));
    const beyondHorizon = uncapped > horizon;
    const daysToReorderPoint =
      blendedVelocity > 0 ? (available - reorderPoint) / blendedVelocity : null;
    const pct = (days: number) => Math.max(0, Math.min(100, (days / horizon) * 100));
    return {
      horizon,
      beyondHorizon,
      fillPct: daysToEmpty === null ? 100 : pct(daysToEmpty),
      notchPct: daysToReorderPoint === null ? null : pct(Math.max(0, daysToReorderPoint)),
      leadStartPct: daysToReorderPoint === null ? null : pct(Math.max(0, daysToReorderPoint)),
      leadWidthPct: daysToReorderPoint === null ? null : pct(leadTimeDays),
      daysToEmpty,
      daysToReorderPoint,
    };
  }, [available, blendedVelocity, reorderPoint, leadTimeDays, safetyDays, horizonDays]);

  // Start at the full track and settle to the real length: the re-draw.
  const [drawn, setDrawn] = useState(false);
  const frame = useRef<number | null>(null);
  useEffect(() => {
    frame.current = requestAnimationFrame(() => setDrawn(true));
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  const axisDates = useMemo(() => {
    const marks: { pct: number; label: string }[] = [];
    const step = model.horizon > 60 ? 14 : model.horizon > 28 ? 7 : 4;
    for (let day = 0; day <= model.horizon; day += step) {
      marks.push({
        pct: (day / model.horizon) * 100,
        label: shortDate(addDays(today, day)),
      });
    }
    return marks;
  }, [model.horizon, today]);

  return (
    <div>
      <div className="runway" role="img" aria-label={runwayLabel(model, stockoutDate, orderByDate)}>
        {model.leadStartPct !== null && model.leadWidthPct !== null ? (
          <span
            className="runway-lead"
            style={{ left: `${model.leadStartPct}%`, width: `${model.leadWidthPct}%` }}
            aria-hidden="true"
          />
        ) : null}
        <span
          className="runway-fill"
          style={{ width: drawn ? `${model.fillPct}%` : "100%" }}
          aria-hidden="true"
        />
        {model.notchPct !== null ? (
          <span
            className="runway-notch"
            style={{ left: drawn ? `${model.notchPct}%` : "100%" }}
            aria-hidden="true"
          />
        ) : null}
      </div>

      {model.beyondHorizon ? (
        <p className="t-data mt-3" style={{ color: "var(--color-fg-3)" }}>
          RUNS PAST {MAX_HORIZON_DAYS}D — CHART CAPPED
        </p>
      ) : null}

      <div className="runway-axis mt-3">
        <div className="relative h-4" style={{ minWidth: 280 }}>
          {axisDates.map((mark) => (
            <span
              key={mark.label}
              className="t-data absolute top-0 whitespace-nowrap"
              style={{
                left: `${mark.pct}%`,
                // The first and last labels align to their edge instead of centring
                // on it: centred, half of "AUG 3" hangs outside the strip and gets
                // clipped to "G 3".
                transform:
                  mark.pct <= 1
                    ? "none"
                    : mark.pct > 85
                      ? "translateX(-100%)"
                      : "translateX(-50%)",
                color: "var(--color-fg-3)",
              }}
            >
              {mark.label}
            </span>
          ))}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-y-2">
        <dt className="t-label">Reorder point</dt>
        <dd className="t-data text-right" style={{ color: "var(--color-kraft)" }}>
          {reorderPoint} UNITS{orderByDate ? ` · ${shortDateRelativeTo(orderByDate, today)}` : ""}
        </dd>
        <dt className="t-label">Runs out</dt>
        <dd className="t-data text-right">
          {stockoutDate ? shortDateRelativeTo(stockoutDate, today) : "Not at this rate"}
        </dd>
        <dt className="t-label">Lead time span</dt>
        <dd className="t-data text-right" style={{ color: "var(--color-fg-2)" }}>
          {leadTimeDays}D + {safetyDays}D SAFETY
        </dd>
      </dl>
    </div>
  );
}

function runwayLabel(
  model: { daysToEmpty: number | null; daysToReorderPoint: number | null },
  stockoutDate: string | null,
  orderByDate: string | null,
): string {
  const empty =
    model.daysToEmpty === null
      ? "does not run out at the current rate"
      : `runs out in ${Math.floor(model.daysToEmpty)} days${stockoutDate ? ` on ${stockoutDate}` : ""}`;
  const reorder =
    model.daysToReorderPoint === null
      ? ""
      : `; reaches its reorder point${orderByDate ? ` on ${orderByDate}` : ""}`;
  return `Stock ${empty}${reorder}.`;
}

/** Day arithmetic on the axis labels, kept local and allocation-free. */
function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
