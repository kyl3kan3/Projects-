"use client";

/**
 * Beat 2 of the 6am find: the top match's fit score counts up 0 → 87 in mono
 * `federal`, tabular digits, over 300ms.
 *
 * Two rules it obeys:
 *
 *  - The final number is rendered in the HTML from the first frame, so a reader
 *    with JavaScript off, a screen reader, or `prefers-reduced-motion` sees the
 *    real score immediately. The animation only overwrites a value that is
 *    already correct.
 *  - It runs once per mount, and only for the one card that gets the ceremony.
 *    Every other score on the screen is plain text.
 *
 * This is the only reason a score needs a client component; everything else on a
 * match card is server-rendered.
 */

import { useEffect, useRef, useState } from "react";

export function ScoreCounter({ score, durationMs = 300 }: { score: number; durationMs?: number }) {
  const [shown, setShown] = useState(score);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || score <= 0) {
      setShown(score);
      return;
    }

    let frame = 0;
    const startedAt = performance.now();
    setShown(0);
    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / durationMs);
      // ease-out-quart, matching the CSS token the rest of the beat uses.
      const eased = 1 - Math.pow(1 - t, 4);
      setShown(Math.round(score * eased));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [score, durationMs]);

  return (
    <span className="t-score" aria-label={`Fit score ${score} out of 100`}>
      {shown}
    </span>
  );
}
