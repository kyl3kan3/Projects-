"use client";

/**
 * Hold-to-confirm, 600ms, for the two actions that are annoying to undo: snoozing a
 * SKU out of the reorder list and dismissing a PO draft.
 *
 * A confirmation dialog on a phone is a modal in the thumb zone with a 44px target
 * two pixels from the destructive one. A hold is better: the intent is continuous,
 * releasing early cancels it, and the fill *is* the progress indicator. Keyboard
 * users get the same thing from Enter/Space held down, and the button is still a
 * button, so screen readers announce it normally.
 */

import { useEffect, useRef, useState, useTransition } from "react";

export function HoldToConfirm({
  onConfirm,
  label,
  holdingLabel = "Hold…",
  doneLabel,
  className = "btn btn-secondary btn-full",
  holdMs = 600,
}: {
  onConfirm: () => void | Promise<void>;
  label: string;
  holdingLabel?: string;
  doneLabel?: string;
  className?: string;
  holdMs?: number;
}) {
  const [holding, setHolding] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function begin() {
    if (pending || done) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      setHolding(false);
      setDone(true);
      startTransition(() => {
        void onConfirm();
      });
    }, holdMs);
  }

  function cancel() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  }

  return (
    <button
      type="button"
      className={`relative overflow-hidden ${className}`}
      onPointerDown={begin}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!holding) begin();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === " ") cancel();
      }}
      onBlur={cancel}
      disabled={pending || done}
      aria-describedby="hold-hint"
    >
      <span className="hold-progress" data-holding={holding} aria-hidden="true" />
      <span className="relative">
        {done ? (doneLabel ?? "Done") : holding ? holdingLabel : label}
      </span>
      <span id="hold-hint" className="sr-only">
        Press and hold for {Math.round(holdMs / 100) / 10} seconds to confirm.
      </span>
    </button>
  );
}
