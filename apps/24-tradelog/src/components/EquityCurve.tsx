/**
 * The equity curve: cumulative net P&L, in close order, drawn once.
 *
 * 1.5px `text-2` line over a flat well, a 600ms `ease-out-quart`
 * stroke-dashoffset draw, and an endpoint dot that fades in as the line settles.
 * Under `prefers-reduced-motion` the line is simply already there with its dot.
 */

import { CURVE_FRAME, pathLength, polyline, project, sharedDomain, zeroY } from "@/components/charts";

export function EquityCurve({
  values,
  height = 200,
  label,
}: {
  /** Cumulative cents at each closed trade, oldest first. */
  values: number[];
  height?: number;
  label: string;
}) {
  const frame = { ...CURVE_FRAME, height };
  if (values.length < 2) {
    return (
      <div
        className="well flex items-center justify-center"
        style={{ height }}
        role="img"
        aria-label={label}
      >
        <p className="t-secondary">
          {values.length === 0
            ? "Your curve starts with your first closed trade."
            : "One closed trade so far — the curve needs two points."}
        </p>
      </div>
    );
  }

  const domain = sharedDomain(values);
  const points = project(values, frame, domain);
  const length = pathLength(points);
  const zero = zeroY(frame, domain);
  const last = points[points.length - 1];

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
          d={polyline(points)}
          fill="none"
          stroke="var(--color-text-2)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          className="curve-base"
          style={{ "--len": length } as React.CSSProperties}
        />
        <circle
          cx={last.x}
          cy={last.y}
          r={2.5}
          fill="var(--color-text)"
          className="endpoint-dot"
        />
      </svg>
    </div>
  );
}
