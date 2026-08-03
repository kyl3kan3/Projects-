"use client";

/**
 * The hero: the product running, before the first scroll.
 *
 * This is CloudSpend's brand device drawn literally — "the ridge caught the night
 * it started growing". The spend ridge draws left to right, an amber flare marks
 * the peak of the excess, and a survey line falls from the flare to the deploy
 * pennant that caused it. It is the same SVG construction the product's own chart
 * uses, at marketing size.
 *
 * The figures come from CloudSpend's own synthetic demo estate — the same code
 * path a connected account runs — and the caption says so. Nothing here is
 * presented as a customer's bill.
 */

import { useEffect, useRef, useState } from "react";

const VB_W = 340;
const VB_H = 160;
const PAD_TOP = 14;
const PAD_BOTTOM = 22;

/**
 * 48 hourly readings from the demo estate: a steady business-hours shape, then a
 * runaway that starts two hours after a deploy and never comes back down.
 */
const SERIES = [
  16.1, 15.4, 14.9, 14.2, 14.0, 14.6, 15.8, 17.2, 18.6, 19.4, 20.1, 20.6, 20.9, 20.4, 19.6, 18.7,
  17.9, 17.1, 16.4, 15.9, 15.5, 15.2, 15.0, 14.8, 14.9, 15.1, 15.6, 16.4, 17.5, 18.9, 20.2, 21.0,
  21.4, 21.1, 20.5, 19.8, 33.9, 34.6, 35.1, 34.4, 33.8, 34.9, 35.6, 36.2, 35.4, 34.8, 35.2, 35.9,
];
const BASELINE = [
  16.0, 15.3, 14.8, 14.3, 14.1, 14.7, 15.9, 17.1, 18.5, 19.3, 20.0, 20.5, 20.8, 20.3, 19.5, 18.6,
  17.8, 17.0, 16.3, 15.8, 15.4, 15.1, 14.9, 14.7, 14.8, 15.0, 15.5, 16.3, 17.4, 18.8, 20.1, 20.9,
  21.3, 21.0, 20.4, 19.7, 19.0, 18.4, 17.9, 17.4, 17.0, 17.6, 18.3, 19.1, 19.8, 20.4, 20.9, 21.3,
];
/** Hour 34 is the deploy; hour 36 is where the ridge starts growing. */
const DEPLOY_INDEX = 34;
const ONSET_INDEX = 36;

export function HeroRidge() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    // Draw once, when it is actually on screen.
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const peak = Math.max(...SERIES, ...BASELINE);
  const x = (i: number) => (i / (SERIES.length - 1)) * VB_W;
  const y = (v: number) => PAD_TOP + (VB_H - PAD_TOP - PAD_BOTTOM) * (1 - v / peak);

  const line = SERIES.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${VB_W},${VB_H - PAD_BOTTOM} L0,${VB_H - PAD_BOTTOM} Z`;
  const ghost = BASELINE.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const excessTop = SERIES.slice(ONSET_INDEX).map(
    (v, i) => `${i === 0 ? "M" : "L"}${x(ONSET_INDEX + i).toFixed(1)},${y(v).toFixed(1)}`,
  );
  const excessBottom = BASELINE.slice(ONSET_INDEX)
    .map((v, i) => ({ v, i }))
    .reverse()
    .map(({ v, i }) => `L${x(ONSET_INDEX + i).toFixed(1)},${y(v).toFixed(1)}`);
  const excess = `${excessTop.join(" ")} ${excessBottom.join(" ")} Z`;

  let peakIndex = ONSET_INDEX;
  for (let i = ONSET_INDEX; i < SERIES.length; i++) {
    if (SERIES[i] > SERIES[peakIndex]) peakIndex = i;
  }
  const flare = { x: x(peakIndex), y: y(SERIES[peakIndex]) };
  const pennantX = x(DEPLOY_INDEX);
  const surveyLength = Math.hypot(pennantX - flare.x, VB_H - PAD_BOTTOM - flare.y).toFixed(0);

  return (
    <figure style={{ margin: 0 }}>
      <div className="card" style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <span className="t-label">EC2 — us-east-1</span>
          <span className="t-data" style={{ color: "var(--color-amber)" }}>
            +$340/DAY
          </span>
        </div>

        <svg
          ref={ref}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          role="img"
          aria-label="Hourly EC2 spend over two days: flat against its baseline, then a sustained rise starting two hours after a deploy, with the excess tinted amber"
          style={{ display: "block", width: "100%", height: "auto", overflow: "visible" }}
        >
          <path d={area} fill="var(--color-dusk)" fillOpacity={0.35} />
          {visible ? (
            <path className="excess-tint" d={excess} fill="var(--color-amber)" fillOpacity={0.18} />
          ) : null}
          <path
            d={ghost}
            fill="none"
            stroke="var(--color-text-3)"
            strokeWidth={1}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
          <path
            className={visible ? "chart-series" : undefined}
            style={{ ["--draw-length" as string]: "1600" }}
            d={line}
            fill="none"
            stroke="var(--color-dusk)"
            strokeWidth={1.5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {visible ? (
            <line
              className="survey-line"
              style={{ ["--survey-length" as string]: surveyLength }}
              x1={flare.x}
              y1={flare.y}
              x2={pennantX}
              y2={VB_H - PAD_BOTTOM}
              stroke="var(--color-amber)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {visible ? (
            <g>
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
              <circle cx={flare.x} cy={flare.y} r={3} fill="var(--color-amber)" />
            </g>
          ) : null}
          <line
            x1={0}
            y1={VB_H - PAD_BOTTOM}
            x2={VB_W}
            y2={VB_H - PAD_BOTTOM}
            stroke="var(--color-hairline)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <g className={visible ? "pennant" : undefined}>
            <line
              x1={pennantX}
              y1={VB_H - PAD_BOTTOM}
              x2={pennantX}
              y2={VB_H - PAD_BOTTOM - 16}
              stroke="var(--color-amber)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={`M${pennantX},${VB_H - PAD_BOTTOM - 16} L${pennantX + 10},${VB_H - PAD_BOTTOM - 12.5} L${pennantX},${VB_H - PAD_BOTTOM - 9} Z`}
              fill="var(--color-amber)"
            />
          </g>
        </svg>

        <p className="t-data" style={{ color: "var(--color-amber)", marginTop: 12 }}>
          9f3c2ab · api-server · TUE 14:02
        </p>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          The ridge began 16:00 UTC, two hours after that deploy. Caught the same
          night, not on the invoice.
        </p>
      </div>
      <figcaption className="t-secondary" style={{ marginTop: 12, color: "var(--color-text-3)" }}>
        Demo: CloudSpend&rsquo;s own synthetic estate, running the production
        detector. Not a customer&rsquo;s bill.
      </figcaption>
    </figure>
  );
}
