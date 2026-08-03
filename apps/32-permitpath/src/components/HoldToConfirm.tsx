"use client";

/**
 * Hold-to-confirm, per DESIGN.md's touch rules: destructive actions take a 600ms
 * hold with a visible fill rather than a confirm dialog. Releasing early cancels,
 * and the label says what will happen — a thumb in a truck cab does not want a
 * modal.
 *
 * Reduced motion collapses the fill to its final state (see globals.css), so the
 * hold still works and simply stops animating.
 */

import { useRef, useState } from "react";

const HOLD_MS = 600;

export function HoldToConfirm({
  label,
  holdingLabel,
  hint,
  onConfirm,
}: {
  label: string;
  holdingLabel: string;
  /** Spoken to assistive tech in place of the bare label. */
  hint: string;
  onConfirm: () => void;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function start(): void {
    if (timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onConfirm();
    }, HOLD_MS);
  }

  function cancel(): void {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setHolding(false);
  }

  return (
    <button
      type="button"
      className="btn btn-secondary relative overflow-hidden"
      style={{ color: "var(--color-signal-red)" }}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      // Keyboard path: space or enter held down repeats keydown, so the timer
      // starts once and the same 600ms applies.
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") start();
      }}
      onKeyUp={cancel}
      onBlur={cancel}
      aria-label={hint}
    >
      <span className="hold-progress" data-holding={holding} aria-hidden="true" />
      <span className="relative">{holding ? holdingLabel : label}</span>
    </button>
  );
}
