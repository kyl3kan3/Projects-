/**
 * The trade's own fills, plotted against time, with entry and exit pins and the
 * R-multiple bracket between the average entry and the stop.
 *
 * It is explicitly **not** a candle chart: TradeLog has no market-data feed, so
 * drawing price action would mean drawing something it does not know. What it can
 * show honestly is where the trader actually transacted, which is the thing a
 * review is about anyway. The caption says so.
 *
 * Pins drop 120ms apart and the bracket draws between them (DESIGN.md's motion).
 */

import { pathLength, polyline, project } from "@/components/charts";

export interface FillPoint {
  role: "open" | "close";
  /** Price as a JS number — an SVG coordinate, never a stored value. */
  price: number;
  label: string;
  priceLabel: string;
}

export function TradeChart({
  fills,
  stop,
  height = 200,
}: {
  fills: FillPoint[];
  stop: number | null;
  height?: number;
}) {
  const frame = { width: 340, height, padTop: 24, padBottom: 24 };
  if (fills.length === 0) {
    return (
      <div className="well flex items-center justify-center" style={{ height }}>
        <p className="t-secondary">No fills recorded for this trade.</p>
      </div>
    );
  }

  const prices = fills.map((f) => f.price);
  const candidates = stop === null ? prices : [...prices, stop];
  const min = Math.min(...candidates);
  const max = Math.max(...candidates);
  const pad = (max - min) * 0.15 || Math.max(0.01, Math.abs(max) * 0.002);
  const domain = { min: min - pad, max: max + pad };
  const points = project(prices, frame, domain);
  const stopPoint = stop === null ? null : project([stop], frame, domain)[0];

  const entryIndexes = fills.map((f, i) => (f.role === "open" ? i : -1)).filter((i) => i >= 0);
  const avgEntryY =
    entryIndexes.reduce((sum, i) => sum + points[i].y, 0) / Math.max(1, entryIndexes.length);

  return (
    <div className="well" style={{ height }}>
      <svg
        viewBox={`0 0 ${frame.width} ${frame.height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Your ${fills.length} fills on this trade, from ${fills[0].priceLabel} to ${fills[fills.length - 1].priceLabel}`}
      >
        {/* The path between fills is a reading aid, not price action — hairline. */}
        <path
          d={polyline(points)}
          fill="none"
          stroke="var(--color-hairline)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />

        {stopPoint ? (
          <>
            <line
              x1={0}
              x2={frame.width}
              y1={stopPoint.y}
              y2={stopPoint.y}
              stroke="var(--color-loss)"
              strokeOpacity={0.5}
              strokeWidth={1}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
            {/* The R bracket: average entry to stop — one R of risk. */}
            <path
              d={`M6 ${round(avgEntryY)} L6 ${round(stopPoint.y)}`}
              stroke="var(--color-text-2)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              className="bracket"
              style={
                {
                  "--len": pathLength([
                    { x: 6, y: avgEntryY },
                    { x: 6, y: stopPoint.y },
                  ]),
                } as React.CSSProperties
              }
            />
            <text x={10} y={round((avgEntryY + stopPoint.y) / 2) + 4} className="t-cell" fill="var(--color-text-2)" fontSize={11}>
              1R
            </text>
          </>
        ) : null}

        {points.map((point, index) => (
          <g
            key={index}
            className="pin"
            style={{ animationDelay: `${Math.min(index, 8) * 120}ms` }}
          >
            <circle
              cx={point.x}
              cy={point.y}
              r={3.5}
              fill={fills[index].role === "open" ? "var(--color-paper)" : "var(--color-graphite)"}
              stroke={fills[index].role === "open" ? "none" : "var(--color-paper)"}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
