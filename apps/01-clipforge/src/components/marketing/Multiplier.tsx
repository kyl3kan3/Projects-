"use client";

/**
 * Beat 2: the brand device. `1 → 14` counts up once when it enters the
 * viewport. Big Clash Display numerals; amber reserved for the arrow.
 */

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";

export function Multiplier() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? 14 : 1);

  useEffect(() => {
    if (!inView || reduce) return;
    let raf = 0;
    const start = performance.now();
    const DUR = 1100;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / DUR);
      // ease-out-quart
      const eased = 1 - Math.pow(1 - p, 4);
      setN(Math.max(1, Math.round(1 + eased * 13)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduce]);

  return (
    <div ref={ref} className="text-center">
      <div className="font-display flex items-baseline justify-center gap-4 leading-none">
        <span style={{ fontSize: "clamp(64px, 18vw, 128px)" }}>1</span>
        <span
          className="text-[var(--color-brand)]"
          style={{ fontSize: "clamp(40px, 11vw, 80px)" }}
          aria-hidden
        >
          →
        </span>
        <span className="mono-tab" style={{ fontSize: "clamp(64px, 18vw, 128px)", fontVariantNumeric: "tabular-nums" }}>
          {n}
        </span>
      </div>
      <p className="t-label mt-4">One episode · Fourteen assets</p>
      <p className="mx-auto mt-3 max-w-[38ch] text-sm text-[var(--color-muted)]">
        10 captioned clips (five moments, cut 9:16 and 1:1), a tweet thread,
        two LinkedIn posts, and a newsletter section. That&apos;s the kit. Every time.
      </p>
    </div>
  );
}
