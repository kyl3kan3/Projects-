"use client";

/**
 * Hold-to-confirm for destructive actions: a 900ms radial fill, and releasing
 * early rewinds (DESIGN.md motion & touch). There is no confirm dialog anywhere
 * in this product — a dialog trains people to click through, a hold does not.
 *
 * Keyboard users get the same control: Space or Enter held has the same effect,
 * and the button is a real submit button inside a real form, so it works before
 * hydration too (a slow phone must still be able to remove a database).
 */

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";

const HOLD_MS = 900;

export function HoldToConfirm({
  action,
  hiddenName,
  hiddenValue,
  label,
  confirmLabel,
}: {
  action: (form: FormData) => Promise<void>;
  hiddenName: string;
  hiddenValue: string;
  label: string;
  confirmLabel: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name={hiddenName} value={hiddenValue} />
      <HoldButton label={label} confirmLabel={confirmLabel} />
    </form>
  );
}

function HoldButton({ label, confirmLabel }: { label: string; confirmLabel: string }) {
  const { pending } = useFormStatus();
  const [progress, setProgress] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const formRef = useRef<HTMLButtonElement | null>(null);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setProgress(0);
  };

  const start = () => {
    if (pending || timer.current) return;
    const startedAt = Date.now();
    timer.current = setInterval(() => {
      const ratio = Math.min(1, (Date.now() - startedAt) / HOLD_MS);
      setProgress(ratio);
      if (ratio >= 1) {
        stop();
        formRef.current?.form?.requestSubmit();
      }
    }, 30);
  };

  return (
    <button
      ref={formRef}
      type="submit"
      className="btn btn-danger btn-full relative overflow-hidden"
      disabled={pending}
      // A plain click does nothing: the hold is the confirmation.
      onClick={(e) => {
        if (progress < 1) e.preventDefault();
      }}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={stop}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: "left center",
          transform: `scaleX(${progress})`,
          background: "color-mix(in srgb, var(--color-torch) 22%, transparent)",
        }}
      />
      <span className="relative">{pending ? confirmLabel : label}</span>
    </button>
  );
}
