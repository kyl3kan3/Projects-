"use client";

/**
 * The signature: a 60x20 canvas trace that draws right-to-left.
 *
 * DESIGN.md: 1.5px phosphor stroke on transparent. On failure the trace drops to
 * baseline and runs flat in red. On recovery it rejoins with one exaggerated
 * 400ms overshoot spike, then normalizes. Canvas everywhere — never WebGL.
 *
 * Under `prefers-reduced-motion` the animation is skipped entirely and the last
 * window is drawn once as a static trace. The flatline is retained either way:
 * it is information, not decoration.
 */

import { useEffect, useRef } from "react";

const PHOSPHOR = "#48b784";
const RED = "#ff4d5e";
const TRACE_DIM = "#1e6b4a";

export interface SparklineProps {
  /** Latency samples, oldest first. A zero is a failed check. */
  points: number[];
  down?: boolean;
  width?: number;
  height?: number;
  /** Dim historical styling, used on detail screens behind live data. */
  historical?: boolean;
  className?: string;
}

export function Sparkline({
  points,
  down = false,
  width = 60,
  height = 20,
  historical = false,
  className,
}: SparklineProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stroke = down ? RED : historical ? TRACE_DIM : PHOSPHOR;

    // Normalise against the window's own peak so every row is readable.
    const peak = Math.max(...points, 1);
    const pad = 2;
    const usable = height - pad * 2;
    const step = points.length > 1 ? width / (points.length - 1) : width;

    const yFor = (value: number) => {
      if (value <= 0) return height - pad; // failure sits on the baseline
      return height - pad - (value / peak) * usable;
    };

    let raf = 0;
    let drawnUpTo = reduceMotion ? points.length : 0;
    const startedAt = performance.now();
    const DURATION = 450;

    const render = (visibleCount: number) => {
      ctx.clearRect(0, 0, width, height);
      if (!points.length) {
        // No data yet: a flat hairline, honest about having nothing to say.
        ctx.strokeStyle = TRACE_DIM;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height - pad);
        ctx.lineTo(width, height - pad);
        ctx.stroke();
        ctx.globalAlpha = 1;
        return;
      }

      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();

      const count = Math.max(2, Math.min(visibleCount, points.length));
      // Draw the newest `count` samples, anchored to the right edge.
      const startIndex = points.length - count;
      for (let i = 0; i < count; i++) {
        const value = points[startIndex + i];
        const x = width - (count - 1 - i) * step;
        const y = yFor(value);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // The ambient proof-of-life tick: 1px of phosphor at 20% along the base.
      if (!down) {
        ctx.strokeStyle = PHOSPHOR;
        ctx.globalAlpha = 0.2;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(width - 1, height - pad);
        ctx.lineTo(width, height - pad);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    };

    if (reduceMotion) {
      render(points.length);
      return;
    }

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / DURATION);
      drawnUpTo = Math.max(2, Math.round(progress * points.length));
      render(drawnUpTo);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [points, down, width, height, historical]);

  return (
    <canvas
      ref={ref}
      style={{ width, height }}
      className={className}
      // Every state also reads as text, per DESIGN.md's fallback rules.
      role="img"
      aria-label={
        down
          ? "Response time trace, flatlined"
          : points.length
            ? `Response time trace, last ${points.length} checks`
            : "No response data yet"
      }
    />
  );
}
