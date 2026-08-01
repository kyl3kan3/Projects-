/**
 * The star row, in React, for every dashboard and hosted-page surface.
 *
 * Same construction as the widget's (two overlaid rows, the filled one clipped to
 * the true fraction), because a 4.8 has to look identical in the merchant's
 * dashboard and on their storefront. The widget cannot import this — it ships no
 * React — so the geometry lives in globals.css and both use it.
 */

import { STAR_PATH } from "@/components/icons";

function row(filled: boolean) {
  return (
    <span className="stars-row">
      {[0, 1, 2, 3, 4].map((i) =>
        filled ? (
          <svg key={i} viewBox="0 0 20 20" aria-hidden="true">
            <path d={STAR_PATH} fill="currentColor" />
          </svg>
        ) : (
          <svg key={i} viewBox="0 0 20 20" aria-hidden="true">
            <path
              d={STAR_PATH}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinejoin="round"
            />
          </svg>
        ),
      )}
    </span>
  );
}

export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const rating = Math.min(5, Math.max(0, Number.isFinite(value) ? value : 0));
  const fill = `${Math.round((rating / 5) * 10_000) / 100}%`;
  return (
    <span
      className="stars"
      style={{ ["--star" as string]: `${size}px`, ["--fill" as string]: fill }}
      role="img"
      aria-label={`Rated ${rating.toFixed(1)} out of 5`}
    >
      <span className="stars-track">{row(false)}</span>
      <span className="stars-clip">{row(true)}</span>
    </span>
  );
}
