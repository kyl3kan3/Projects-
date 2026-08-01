/**
 * The 48x16 portal-view sparkline on the agency dashboard, in ink-2 (DESIGN.md).
 * Static — it is history, not motion. A portal nobody has opened draws a flat
 * baseline rather than nothing, because "flat" is the finding.
 */
export function Sparkline({
  values,
  width = 48,
  height = 16,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  const series = values.length >= 2 ? values : [0, 0];
  const max = Math.max(1, ...series);
  const step = width / (series.length - 1);
  const points = series
    .map((v, i) => {
      const x = i * step;
      const y = height - 1 - (v / max) * (height - 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      style={{ flex: "none" }}
    >
      <polyline
        points={points}
        stroke="var(--color-ink-2)"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
