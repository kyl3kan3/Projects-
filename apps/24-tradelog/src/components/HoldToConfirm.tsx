"use client";

/**
 * Hold-to-confirm, for anything destructive (DESIGN.md's destructive control).
 *
 * A 1.5px `loss` border sweep completes over an 800ms hold; releasing early
 * cancels. Under `prefers-reduced-motion` the timing is kept — it is a safety,
 * not a decoration — and the sweep becomes a static countdown numeral.
 */

import { useEffect, useRef, useState } from "react";

const HOLD_MS = 800;

export function HoldToConfirm({
  label,
  holdingLabel = "Keep holding",
  onConfirm,
  disabled = false,
  className = "",
}: {
  label: string;
  holdingLabel?: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}) {
  const [holding, setHolding] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [reduced, setReduced] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setReduced(Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
  }, []);

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    if (ticker.current) clearInterval(ticker.current);
    timer.current = null;
    ticker.current = null;
    setHolding(false);
    setRemaining(0);
  };

  useEffect(() => stop, []);

  const start = () => {
    if (disabled || holding) return;
    setHolding(true);
    setRemaining(Math.ceil(HOLD_MS / 100) / 10);
    timer.current = setTimeout(() => {
      stop();
      void onConfirm();
    }, HOLD_MS);
    ticker.current = setInterval(() => {
      setRemaining((r) => Math.max(0, Math.round((r - 0.1) * 10) / 10));
    }, 100);
  };

  return (
    <button
      type="button"
      className={`btn btn-destructive ${className}`.trim()}
      data-holding={holding}
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") start();
      }}
      onKeyUp={stop}
      onBlur={stop}
    >
      {holding ? (reduced ? `${holdingLabel} · ${remaining.toFixed(1)}s` : holdingLabel) : label}
    </button>
  );
}
