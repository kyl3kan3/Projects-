"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The signature detail: the position numeral as a big-type odometer.
 *
 * When a referral converts, the digits roll upward — `#347 → #298` — over 500ms
 * with `ease-out-quart`, tinted flare while moving and settling to paper at
 * rest; a delta chip (`▲ 49`) fades in above for 1.2s; one 1.75px flare ring
 * expands from the baseline once at landing. Pure DOM and CSS transforms, so it
 * holds 60fps on a mid phone.
 *
 * The live update is a poll, not a socket. ARCHITECTURE.md describes a socket
 * push, but Vercel functions cannot hold a connection open, so at MVP the page
 * asks every 20 seconds. It is the same moment for the person watching, and the
 * whole position is always readable as text (see `positionSummary`) whether the
 * poll ever fires or not.
 */

const POLL_MS = 20_000;

export function PositionRoll({
  code,
  initialPosition,
  live = true,
  onUpdate,
}: {
  code: string;
  initialPosition: number;
  live?: boolean;
  onUpdate?: (next: { position: number; total: number; referrals: number }) => void;
}) {
  const [position, setPosition] = useState(initialPosition);
  const [delta, setDelta] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [ringKey, setRingKey] = useState(0);
  const latest = useRef(initialPosition);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const response = await fetch(`/api/queue/${code}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as {
          position: number;
          total: number;
          referrals: number;
        };
        if (cancelled || typeof data.position !== "number") return;
        onUpdate?.(data);
        if (data.position < latest.current) {
          setDelta(latest.current - data.position);
          latest.current = data.position;
          setRolling(true);
          setPosition(data.position);
          setRingKey((k) => k + 1);
          setTimeout(() => !cancelled && setRolling(false), 520);
        } else if (data.position !== latest.current) {
          latest.current = data.position;
          setPosition(data.position);
        }
      } catch {
        // A failed poll is not an error worth showing: the number on screen is
        // still the number we last read from the database.
      }
    };

    const timer = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [code, live, onUpdate]);

  const digits = String(position).split("");

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <div
        aria-live="polite"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
      >
        {`Position ${position}`}
      </div>
      <div
        style={{
          height: 20,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
        }}
      >
        {delta > 0 ? (
          <span key={`d-${ringKey}`} className="delta-chip">
            ▲ {delta}
          </span>
        ) : null}
      </div>
      <div className="t-numeral roll" data-rolling={rolling} aria-hidden="true">
        <span>#</span>
        {digits.map((digit, index) => (
          <Digit key={`${digits.length}-${index}`} value={Number(digit)} />
        ))}
      </div>
      {ringKey > 0 ? <span key={ringKey} className="landing-ring" data-active="true" /> : null}
    </div>
  );
}

const LADDER = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function Digit({ value }: { value: number }) {
  return (
    <span className="roll-digit">
      <span style={{ transform: `translateY(-${value * 10}%)` }}>
        {LADDER.map((d) => (
          <span key={d} style={{ display: "block", height: "1em" }}>
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * The desktop-only enhancement: a receding shaft of hairline ticks behind the
 * numeral. Static SVG, hidden below 1024px, never load-bearing.
 */
export function Shaft() {
  return (
    <svg className="shaft" viewBox="0 0 320 160" preserveAspectRatio="none" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => {
        const y = 158 - i * 11;
        const inset = i * 9;
        return (
          <line
            key={i}
            x1={inset}
            x2={320 - inset}
            y1={y}
            y2={y}
            stroke="var(--color-hairline)"
            strokeWidth="1"
            opacity={1 - i * 0.06}
          />
        );
      })}
    </svg>
  );
}
