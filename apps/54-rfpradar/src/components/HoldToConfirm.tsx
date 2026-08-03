"use client";

/**
 * HoldToConfirm — a 600ms press-and-hold before a decisive or destructive action
 * fires (DESIGN.md, Motion & touch): recording a go/no-go verdict, archiving a
 * library block, rotating the ICS token.
 *
 * The fill is a solid width transition on `federal`, not a glow. The keyboard
 * path is a two-step confirm rather than a hold, because holding Enter is not a
 * gesture anyone performs deliberately — and reduced-motion users get the same
 * two-step path, so nothing here is motion-only.
 */

import { useEffect, useRef, useState } from "react";

const HOLD_MS = 600;

export function HoldToConfirm({
  action,
  hiddenFields = {},
  label,
  holdingLabel = "Hold…",
  disabled = false,
  tone = "primary",
}: {
  action: (formData: FormData) => Promise<void>;
  hiddenFields?: Record<string, string>;
  label: string;
  holdingLabel?: string;
  disabled?: boolean;
  tone?: "primary" | "danger";
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [armed, setArmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

  function stop() {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    setProgress(0);
  }

  function start() {
    if (disabled || submitting) return;
    const startedAt = performance.now();
    stop();
    timer.current = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      const next = Math.min(1, elapsed / HOLD_MS);
      setProgress(next);
      if (next >= 1) {
        stop();
        setSubmitting(true);
        formRef.current?.requestSubmit();
      }
    }, 16);
  }

  return (
    <form ref={formRef} action={action} className="w-full">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <button
        type="button"
        className={`btn ${tone === "danger" ? "btn-secondary" : "btn-primary"} w-full relative overflow-hidden`}
        disabled={disabled || submitting}
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          // Keyboard: two deliberate presses instead of a hold.
          if (!armed) {
            setArmed(true);
            return;
          }
          setSubmitting(true);
          formRef.current?.requestSubmit();
        }}
        onBlur={() => setArmed(false)}
        aria-describedby="hold-hint"
        style={
          tone === "danger" ? { color: "var(--color-red)", borderColor: "var(--color-red)" } : undefined
        }
      >
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            width: `${progress * 100}%`,
            background:
              tone === "danger"
                ? "color-mix(in srgb, var(--color-red) 18%, transparent)"
                : "color-mix(in srgb, var(--color-federal) 45%, transparent)",
            transition: "width 16ms linear",
          }}
        />
        <span style={{ position: "relative" }}>
          {submitting
            ? holdingLabel
            : progress > 0
              ? holdingLabel
              : armed
                ? "Press again to confirm"
                : label}
        </span>
      </button>
      <p id="hold-hint" className="t-secondary mt-2">
        {disabled ? "" : "Press and hold for a moment, or press Enter twice — this is recorded."}
      </p>
    </form>
  );
}
