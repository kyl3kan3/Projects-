/**
 * The signature detail: the counterfactual gap.
 *
 * The base curve draws (600ms, 1.5px `text-2`). Two hundred milliseconds after it
 * settles, "you without this leak" draws above it in 1.5px `paper`. The region
 * between them fills with `leak` at 12%, revealed top-down over 400ms — the gap
 * *is* the dollar cost, and the finding's figure counts up beside it.
 *
 * The honest part: the upper line is not a model. It is the same trades with the
 * leak's trades struck out, so every point on it can be defended trade by trade.
 *
 * One leak at a time, one draw per session (see `DrawOnce`).
 */

import {
  CURVE_FRAME,
  gapArea,
  pathLength,
  polyline,
  project,
  sharedDomain,
  zeroY,
} from "@/components/charts";

export function CounterfactualCurve({
  actual,
  without,
  height = 200,
  label,
}: {
  /** Cumulative cents, oldest first, as it happened. */
  actual: number[];
  /** The same series with the leak's trades removed. */
  without: number[];
  height?: number;
  label: string;
}) {
  const frame = { ...CURVE_FRAME, height };
  if (actual.length < 2) {
    return (
      <div
        className="well flex items-center justify-center"
        style={{ height }}
        role="img"
        aria-label={label}
      >
        <p className="t-secondary">Not enough closed trades to draw the comparison yet.</p>
      </div>
    );
  }

  const domain = sharedDomain(actual, without);
  const actualPoints = project(actual, frame, domain);
  const withoutPoints = project(without, frame, domain);
  const zero = zeroY(frame, domain);

  return (
    <div className="well" style={{ height }}>
      <svg
        viewBox={`0 0 ${frame.width} ${frame.height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
      >
        {zero !== null ? (
          <line
            x1={0}
            x2={frame.width}
            y1={zero}
            y2={zero}
            stroke="var(--color-hairline)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        <path
          d={gapArea(withoutPoints, actualPoints)}
          fill="var(--color-leak)"
          fillOpacity={0.12}
          className="curve-gap"
        />

        <path
          d={polyline(actualPoints)}
          fill="none"
          stroke="var(--color-text-2)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          className="curve-base"
          style={{ "--len": pathLength(actualPoints) } as React.CSSProperties}
        />

        <path
          d={polyline(withoutPoints)}
          fill="none"
          stroke="var(--color-paper)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          className="curve-counterfactual"
          style={{ "--len": pathLength(withoutPoints) } as React.CSSProperties}
        />
      </svg>
    </div>
  );
}
