"use client";

/**
 * Beat 1 — the machine running. A live trace that runs, flatlines, and recovers
 * on a loop, so the product demos itself inside five seconds
 * (MARKETING_PLAYBOOK law 2).
 *
 * This is the same canvas renderer the product uses, driven by synthetic data.
 * It is labelled as a demo, because Law 5 forbids passing staged output off as
 * measurement.
 */

import { useEffect, useRef, useState } from "react";
import { Sparkline } from "@/components/Sparkline";

const WINDOW = 48;
/** Plausible p50-ish latency for a small API, in ms. */
const BASELINE = 184;

type Phase = "healthy" | "down" | "recovering";

export function HeroTrace() {
  const [points, setPoints] = useState<number[]>(() =>
    Array.from({ length: WINDOW }, () => jitter(BASELINE)),
  );
  const [phase, setPhase] = useState<Phase>("healthy");
  const tick = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = setInterval(() => {
      tick.current += 1;
      const t = tick.current % 40;
      // 0-23 healthy, 24-31 flatlined, 32-39 recovering.
      const next: Phase = t < 24 ? "healthy" : t < 32 ? "down" : "recovering";
      setPhase(next);
      setPoints((prev) => {
        const value =
          next === "down"
            ? 0
            : next === "recovering" && t === 32
              ? BASELINE * 3.4 // the one exaggerated overshoot spike
              : jitter(BASELINE);
        return [...prev.slice(1), value];
      });
    }, 220);

    return () => clearInterval(timer);
  }, []);

  const down = phase === "down";

  return (
    <div className="panel relative overflow-hidden p-5">
      <div className="flex items-center gap-2.5">
        <span className={down ? "dot dot-down" : "dot dot-up"} />
        <span className="t-title flex-1">api.helvet.ico</span>
        <span className="t-label" style={{ color: down ? "var(--color-red)" : "var(--color-phosphor)" }}>
          {down ? "DOWN" : "UP"}
        </span>
      </div>

      <div className="mt-4">
        <Sparkline points={points} down={down} width={300} height={72} />
      </div>

      <p className="t-data mt-3" style={{ color: down ? "var(--color-red)" : "var(--color-text-2)" }}>
        {down
          ? `down ${Math.max(1, (tick.current % 40) - 23) * 5}s · 2/3 regions`
          : `${Math.round(points[points.length - 1] || BASELINE)}ms · 3 regions`}
      </p>

      <p className="t-label mt-4">Demo — synthetic data, not a live service</p>
    </div>
  );
}

function jitter(base: number): number {
  // Deterministic-ish wobble; a flat line would read as fake.
  return Math.round(base + (Math.random() - 0.5) * 46);
}
