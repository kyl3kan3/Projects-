"use client";

/**
 * One form wrapper for every server action in the app.
 *
 * It exists so that pending state, the error line and the success line are
 * identical everywhere — a landlord should never have to work out whether a form
 * did anything. `hold` turns the submit into a hold-to-confirm control, which
 * DESIGN.md requires for destructive actions (decline an applicant, void a lease,
 * end a tenancy).
 */

import { useActionState, useRef, useState } from "react";
import type { FormState } from "@/app/(app)/actions";

export function ActionForm({
  action,
  submitLabel,
  pendingLabel,
  children,
  variant = "primary",
  hold = false,
  full = true,
  className,
  onDone,
  showMessage = true,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  submitLabel: string;
  pendingLabel?: string;
  children?: React.ReactNode;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  hold?: boolean;
  full?: boolean;
  className?: string;
  onDone?: () => void;
  showMessage?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [holding, setHolding] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buttonClass =
    variant === "quiet"
      ? "btn-quiet"
      : `btn ${variant === "danger" ? "btn-danger" : variant === "secondary" ? "btn-secondary" : "btn-primary"}${full ? " btn-full" : ""}`;

  function startHold() {
    setHolding(true);
    holdTimer.current = setTimeout(() => {
      setHolding(false);
      formRef.current?.requestSubmit();
      onDone?.();
    }, 600);
  }

  function cancelHold() {
    setHolding(false);
    if (holdTimer.current) clearTimeout(holdTimer.current);
  }

  return (
    <form ref={formRef} action={formAction} className={className ?? "flex flex-col gap-4"}>
      {children}

      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-red)" }} role="alert">
          {state.error}
        </p>
      ) : null}
      {showMessage && state.ok && state.message ? (
        <p className="t-secondary" style={{ color: "var(--color-rent-green)" }} role="status">
          {state.message}
        </p>
      ) : null}

      {hold ? (
        <button
          type="button"
          className={buttonClass}
          disabled={pending}
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") startHold();
          }}
          onKeyUp={cancelHold}
          style={
            holding
              ? {
                  background: "var(--color-red)",
                  color: "var(--color-porch)",
                  borderColor: "var(--color-red)",
                }
              : undefined
          }
        >
          {pending ? (pendingLabel ?? "Working…") : holding ? "Keep holding…" : `${submitLabel} — hold`}
        </button>
      ) : (
        <button type="submit" className={buttonClass} disabled={pending}>
          {pending ? (pendingLabel ?? "Working…") : submitLabel}
        </button>
      )}
    </form>
  );
}

/** A read-only text block a landlord can copy: listing links, signing links. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="field">
      <span className="t-label">{label}</span>
      <div className="flex gap-2">
        <input className="input input-mono" readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
