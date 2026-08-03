"use client";

/**
 * Destructive actions are hold-to-confirm: 600ms of fill behind the label, per
 * DESIGN.md. Rejecting a document and unlocking a reporting year both remove figures
 * someone may already have sent to a customer, so neither is one tap away.
 *
 * A keyboard user gets the same gate through Space/Enter held down, and
 * `prefers-reduced-motion` collapses the fill to its final state while keeping the
 * timer — the safety is not decoration.
 */

import { useEffect, useRef, useState } from "react";

export function HoldToConfirm({
  label,
  holdingLabel,
  onConfirm,
  disabled,
  className = "btn btn-secondary btn-full",
  durationMs = 600,
}: {
  label: string;
  holdingLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
  durationMs?: number;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function start() {
    if (disabled || holding) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      setHolding(false);
      onConfirm();
    }, durationMs);
  }

  function cancel() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  }

  return (
    <button
      type="button"
      disabled={disabled}
      className={className}
      style={{ position: "relative", overflow: "hidden" }}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={cancel}
      onBlur={cancel}
    >
      <span className="hold-progress" data-holding={holding || undefined} aria-hidden="true" />
      <span style={{ position: "relative" }}>
        {holding ? (holdingLabel ?? `Hold to ${label.toLowerCase()}…`) : label}
      </span>
    </button>
  );
}
