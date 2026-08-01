"use client";

/**
 * The hero: the product visibly running inside five seconds (playbook law 2).
 *
 * A staged clock-in draws the geofence ring, then the job's labour-cost meter
 * starts ticking against the bid — the brand device, "labor cost vs bid, live".
 * This reuses the app's one signature animation exactly once, which is the whole
 * marketing motion budget for the beat.
 *
 * It is labelled a demo on the page. The numbers are a worked example from a
 * real bid shape, not a customer's data.
 */

import { useEffect, useRef, useState } from "react";

const BID_CENTS = 1_120_000; // $11,200 labor bid
const SPENT_CENTS = 841_000; // $8,410 burned so far
const DURATION_MS = 1400;

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

export function HeroMeter() {
  const [spent, setSpent] = useState(0);
  const [ringDrawn, setRingDrawn] = useState(false);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setRingDrawn(true);
      setSpent(SPENT_CENTS);
      return;
    }

    // The ring draws first (400ms, per DESIGN.md), then the meter starts.
    setRingDrawn(true);
    const startAt = performance.now() + 420;
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - startAt) / DURATION_MS));
      // ease-out-quart, the same curve the product uses.
      const eased = 1 - Math.pow(1 - t, 4);
      setSpent(Math.round(SPENT_CENTS * eased));
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, []);

  const percent = (spent / BID_CENTS) * 100;

  return (
    <div className="panel overflow-hidden">
      <div className="minimap" style={{ borderRadius: 0, border: "none", borderBottom: "1px solid var(--line)" }}>
        <div className="minimap-grid" aria-hidden="true" />
        <svg className="ring-svg" viewBox="0 0 200 112" aria-hidden="true">
          <circle
            className="ring-path"
            cx="100"
            cy="56"
            r="48"
            data-draw={ringDrawn ? "true" : undefined}
          />
          <circle className="site-dot" cx="100" cy="56" r="4" />
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
          <div>
            <p className="t-label" style={{ color: "var(--fg-2)" }}>
              Hendricks Patio
            </p>
            <p className="t-secondary">Inside the fence · 3 on site</p>
          </div>
          <span className="pill" data-tone="on">
            <span className="dot" />
            On the clock
          </span>
        </div>
      </div>

      <div className="p-5">
        <p className="t-label">Labor cost vs bid, live</p>
        <p className="t-data-lg mt-2" style={{ fontSize: 28 }}>
          {money(spent)}
          <span style={{ color: "var(--fg-3)" }}> of {money(BID_CENTS)} bid</span>
        </p>
        <div className="costbar mt-3">
          <span
            data-state={percent > 100 ? "over" : percent >= 80 ? "warning" : undefined}
            style={{ width: `${Math.min(100, percent)}%`, animation: "none" }}
          />
        </div>
        <p className="t-data mt-2" style={{ color: "var(--fg-2)" }}>
          {percent.toFixed(0)}% · 118.5 h of 120 h bid · at this pace: $8,520 finish
        </p>
      </div>
    </div>
  );
}
