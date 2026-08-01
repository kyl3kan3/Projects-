"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Hold-to-confirm: a 600ms radial fill for the acts that are hard to undo —
 * approving a pay period, editing someone's punch (DESIGN.md motion rules).
 *
 * Accessibility is not sacrificed to the gesture: keyboard and assistive-tech
 * users get a plain confirm dialog on activation, and so does anyone who asked
 * for reduced motion. A gesture is never the only path.
 */
export function HoldToConfirm({
  label,
  holdingLabel,
  confirmMessage,
  className = "btn btn-primary btn-full hold",
  disabled,
}: {
  label: string;
  holdingLabel: string;
  confirmMessage: string;
  className?: string;
  disabled?: boolean;
}) {
  const [holding, setHolding] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };

  useEffect(() => clear, []);

  const submit = () => {
    clear();
    buttonRef.current?.form?.requestSubmit();
  };

  const start = () => {
    if (disabled) return;
    if (reducedMotion) {
      if (window.confirm(confirmMessage)) submit();
      return;
    }
    setHolding(true);
    timer.current = setTimeout(submit, 600);
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      className={className}
      data-holding={holding}
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (window.confirm(confirmMessage)) submit();
        }
      }}
    >
      {holding ? holdingLabel : label}
    </button>
  );
}
