"use client";

/**
 * The spend chart, and with it the product's signature.
 *
 * Hand-drawn SVG rather than a charting library, because DESIGN.md specifies the
 * construction exactly — dusk area at 35% with a 1.5px stroke, a dashed 1px
 * baseline ghost, a 1px steel now-line, 10px deploy pennants on 1px masts, an
 * amber flare at the peak of the excess and a 1px amber survey line drawn from
 * the flare down to the deploy that caused it. A library would fight every one of
 * those.
 *
 * It is a client component and takes only serialisable primitives: no db import
 * can reach the browser bundle through it.
 *
 * Strokes use `vector-effect="non-scaling-stroke"` so a 1px hairline stays 1px
 * when the same viewBox is scaled up on a desktop.
 */

import { useState } from "react";

const VB_W = 320;
const VB_H = 150;
const PAD_TOP = 10;
const PAD_BOTTOM = 14;

export interface ChartPoint {
  /** Axis label, e.g. `14` or `14:00`. */
  label: string;
  value: number;
  /** The baseline ghost for this point, if known. */
  baseline?: number;
}

export interface ChartPennant {
  /** Index into `points` the deploy sits at. */
  index: number;
  sha: string;
  service: string;
  stamp: string;
  href?: string | null;
  /** True for the deploy correlated with the open anomaly. */
  correlated?: boolean;
}

export interface SpendChartProps {
  points: ChartPoint[];
  pennants?: ChartPennant[];
  /** Index where the anomalous stretch begins; tints the excess amber. */
  excessFromIndex?: number | null;
  /** Where the now-line sits, 0–1 across the width. */
  nowFraction?: number | null;
  /** open | acked | resolved — drives whether the flare pulses. */
  anomalyState?: "open" | "acked" | "resolved" | null;
  caption?: string;
  emptyMessage?: string;
  ariaLabel: string;
}

export function SpendChart({
  points,
  pennants = [],
  excessFromIndex = null,
  nowFraction = null,
  anomalyState = null,
  caption,
  emptyMessage = "No spend recorded in this window yet.",
  ariaLabel,
}: SpendChartProps) {
  const [openPennant, setOpenPennant] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <p className="t-secondary" style={{ margin: 0 }}>
          {emptyMessage}
        </p>
      </div>
    );
  }

  const peak = Math.max(
    1,
    ...points.map((p) => Math.max(p.value, p.baseline ?? 0)),
  );
  const x = (i: number) => (i / (points.length - 1)) * VB_W;
  const y = (v: number) => PAD_TOP + (VB_H - PAD_TOP - PAD_BOTTOM) * (1 - Math.max(0, v) / peak);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(" ");
  const area = `${line} L${VB_W},${VB_H - PAD_BOTTOM} L0,${VB_H - PAD_BOTTOM} Z`;
  const hasBaseline = points.every((p) => typeof p.baseline === "number");
  const ghost = hasBaseline
    ? points
        .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(p.baseline ?? 0).toFixed(2)}`)
        .join(" ")
    : null;

  // The excess region: between the series and its baseline, from onset onward.
  let excess: string | null = null;
  let flare: { x: number; y: number } | null = null;
  if (excessFromIndex !== null && excessFromIndex >= 0 && hasBaseline) {
    const from = Math.min(excessFromIndex, points.length - 1);
    const slice = points.slice(from);
    if (slice.length >= 2) {
      const top = slice.map((p, i) => `${i === 0 ? "M" : "L"}${x(from + i).toFixed(2)},${y(p.value).toFixed(2)}`);
      const bottom = [...slice]
        .reverse()
        .map((p, i) => `L${x(points.length - 1 - i).toFixed(2)},${y(p.baseline ?? 0).toFixed(2)}`);
      excess = `${top.join(" ")} ${bottom.join(" ")} Z`;
    }
    let peakIndex = from;
    for (let i = from; i < points.length; i++) {
      if (points[i].value > points[peakIndex].value) peakIndex = i;
    }
    flare = { x: x(peakIndex), y: y(points[peakIndex].value) };
  }

  const correlated = pennants.find((p) => p.correlated);
  const survey =
    flare && correlated
      ? {
          x1: flare.x,
          y1: flare.y,
          x2: x(Math.min(Math.max(correlated.index, 0), points.length - 1)),
          y2: VB_H - PAD_BOTTOM,
        }
      : null;
  const surveyLength = survey
    ? Math.hypot(survey.x2 - survey.x1, survey.y2 - survey.y1).toFixed(0)
    : "0";

  const active = openPennant !== null ? pennants[openPennant] : null;
  const axisLabels = [0, Math.floor((points.length - 1) / 2), points.length - 1];

  return (
    <div className="card" style={{ padding: 16 }}>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        role="img"
        aria-label={ariaLabel}
        // The intrinsic size comes from the viewBox; `height: auto` belongs in CSS,
        // not in the SVG height attribute, which only accepts a length.
        style={{ display: "block", width: "100%", height: "auto", overflow: "visible" }}
      >
        {/* Area fill, then the stroke over it. */}
        <path d={area} fill="var(--color-dusk)" fillOpacity={0.35} />
        {excess ? (
          <path className="excess-tint" d={excess} fill="var(--color-amber)" fillOpacity={0.18} />
        ) : null}
        {ghost ? (
          <path
            d={ghost}
            fill="none"
            stroke="var(--color-text-3)"
            strokeWidth={1}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        <path
          className="chart-series"
          style={{ ["--draw-length" as string]: "1400" }}
          d={line}
          fill="none"
          stroke="var(--color-dusk)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* The now-line. */}
        {nowFraction !== null ? (
          <line
            x1={VB_W * Math.min(1, Math.max(0, nowFraction))}
            y1={PAD_TOP - 4}
            x2={VB_W * Math.min(1, Math.max(0, nowFraction))}
            y2={VB_H - PAD_BOTTOM}
            stroke="var(--color-steel)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {/* The survey line: flare down to the deploy that caused it. */}
        {survey ? (
          <line
            className="survey-line"
            style={{ ["--survey-length" as string]: surveyLength }}
            x1={survey.x1}
            y1={survey.y1}
            x2={survey.x2}
            y2={survey.y2}
            stroke="var(--color-amber)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {/* The flare. Open anomalies pulse twice, then settle to a steady lamp. */}
        {flare ? (
          <g>
            {anomalyState === "open" ? (
              <circle
                className="flare-ring"
                cx={flare.x}
                cy={flare.y}
                r={6}
                fill="none"
                stroke="var(--color-amber)"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            <circle
              cx={flare.x}
              cy={flare.y}
              r={anomalyState === "open" ? 3 : 2}
              fill={anomalyState === "resolved" ? "var(--color-green)" : "var(--color-amber)"}
            />
          </g>
        ) : null}

        {/* The baseline axis rule. */}
        <line
          x1={0}
          y1={VB_H - PAD_BOTTOM}
          x2={VB_W}
          y2={VB_H - PAD_BOTTOM}
          stroke="var(--color-hairline)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />

        {/* Deploy pennants: 10px flags on 1px masts, along the axis. */}
        {pennants.map((pennant, i) => {
          const px = x(Math.min(Math.max(pennant.index, 0), points.length - 1));
          const top = VB_H - PAD_BOTTOM - 16;
          const isActive = openPennant === i;
          return (
            <g key={`${pennant.sha}-${i}`} className="pennant">
              <line
                x1={px}
                y1={VB_H - PAD_BOTTOM}
                x2={px}
                y2={top}
                stroke={pennant.correlated ? "var(--color-amber)" : "var(--color-text-3)"}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={`M${px},${top} L${px + 10},${top + 3.5} L${px},${top + 7} Z`}
                fill={pennant.correlated ? "var(--color-amber)" : "var(--color-text-3)"}
              />
              {isActive ? (
                <line
                  x1={px}
                  y1={PAD_TOP - 4}
                  x2={px}
                  y2={VB_H - PAD_BOTTOM}
                  stroke="var(--color-steel)"
                  strokeWidth={1}
                  strokeDasharray="2 3"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
            </g>
          );
        })}
      </svg>

      {/* Axis labels live in HTML so they never scale with the viewBox. */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 8,
        }}
      >
        {axisLabels.map((i, n) => (
          <span key={`${i}-${n}`} className="t-data" style={{ color: "var(--color-text-3)" }}>
            {points[i]?.label ?? ""}
          </span>
        ))}
      </div>

      {caption ? (
        <p className="t-data" style={{ color: "var(--color-text-2)", marginTop: 12 }}>
          {caption}
        </p>
      ) : null}

      {/*
        Every pennant is also a button and a text row. DESIGN.md's fallback rule:
        every correlation and figure is always present as text beneath the chart,
        and no gesture is the only path to anything.
      */}
      {pennants.length ? (
        <div style={{ marginTop: 12 }}>
          <p className="t-label" style={{ marginBottom: 4 }}>
            Deploys in this window
          </p>
          {pennants.map((pennant, i) => (
            <div key={`row-${pennant.sha}-${i}`} className="row" style={{ minHeight: 44, gap: 8 }}>
              {/* Both of these are thumb targets, so both are 44px tall. */}
              <button
                type="button"
                className="t-data"
                onClick={() => setOpenPennant(openPennant === i ? null : i)}
                aria-pressed={openPennant === i}
                style={{
                  background: "none",
                  border: 0,
                  padding: 0,
                  textAlign: "left",
                  color: pennant.correlated ? "var(--color-amber)" : "var(--color-text)",
                  flex: 1,
                  minWidth: 0,
                  minHeight: 44,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {pennant.sha} · {pennant.service} · {pennant.stamp}
              </button>
              {pennant.href ? (
                <a
                  className="t-data"
                  href={pennant.href}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: "var(--color-steel)",
                    flex: "none",
                    minHeight: 44,
                    minWidth: 44,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                  }}
                >
                  commit
                </a>
              ) : null}
            </div>
          ))}
          {active ? (
            <p className="t-data" style={{ color: "var(--color-text-2)", marginTop: 8 }}>
              {active.sha} · {active.service} · {active.stamp}
              {active.correlated ? " · correlated with the open anomaly" : ""}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
