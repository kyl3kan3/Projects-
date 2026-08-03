"use client";

/**
 * Hold-to-confirm, for destructive actions only (reject a document, revoke a share
 * link) — DESIGN.md's motion rules. A 600ms fill runs behind the label while the
 * pointer is down; letting go early cancels.
 *
 * Keyboard users get the same guard with a two-step press rather than a timed hold,
 * because "hold Enter for 600ms" is not a thing a screen reader announces.
 */

import { useRef, useState } from "react";

export function HoldToConfirm({
  label,
  confirmLabel,
  onConfirm,
  pending,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  pending?: boolean;
}) {
  const [holding, setHolding] = useState(false);
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function start() {
    if (pending) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      setHolding(false);
      onConfirm();
    }, 600);
  }

  function cancel() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  }

  return (
    <button
      type="button"
      className="btn btn-secondary btn-full relative overflow-hidden"
      style={{ color: "var(--color-red)", borderColor: "var(--color-line)" }}
      disabled={pending}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
      onBlur={() => setArmed(false)}
      aria-label={armed ? confirmLabel : label}
    >
      <span className="hold-progress" data-holding={holding} aria-hidden="true" />
      <span className="relative">{armed ? confirmLabel : holding ? confirmLabel : label}</span>
    </button>
  );
}
