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
  // Seeded with the real figure, not zero: a visitor whose JavaScript is slow or
  // blocked must never be shown "$0 of $11,200" as the product's headline number.
  const [spent, setSpent] = useState(SPENT_CENTS);
  const [ringDrawn, setRingDrawn] = useState(false);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setRingDrawn(true);
      setSpent(SPENT_CENTS);
      return;
    }

    // The ring draws first (400ms, per DESIGN.md), then the meter counts up.
    setRingDrawn(true);
    setSpent(0);
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
          {/* r=40 → circumference ≈ 252, the dash length in globals.css. */}
          <circle
            className="ring-path"
            cx="100"
            cy="46"
            r="40"
            data-draw={ringDrawn ? "true" : undefined}
          />
          <circle className="site-dot" cx="100" cy="46" r="4" />
        </svg>
        {/* The pill sits top-right so it never collides with the site label at
            390px — the two used to overlap on the narrowest phones. */}
        <div className="absolute right-4 top-4">
          <span className="pill" data-tone="on">
            <span className="dot" />
            On the clock
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="t-label" style={{ color: "var(--fg-2)" }}>
            Hendricks Patio
          </p>
          <p className="t-secondary">Inside the fence · 3 on site</p>
        </div>
      </div>

      <div className="p-5">
        <p className="t-label">Labor cost vs bid, live</p>
        <p className="t-data-lg mt-2" style={{ fontSize: 30 }}>
          {money(spent)}
        </p>
        <p className="t-data mt-1" style={{ color: "var(--fg-3)" }}>
          of {money(BID_CENTS)} labor bid
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
