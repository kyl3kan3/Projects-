"use client";

/**
 * One wrapper for every server action in the console.
 *
 * It exists so pending state, the error line and the confirmation line are
 * identical everywhere: a storage owner should never have to guess whether a form
 * did anything. `confirm` turns the submit into a hold-to-confirm control, which
 * DESIGN.md's restraint rule wants for the actions with consequences — completing
 * a statutory step, ending a tenancy, revoking a gate code.
 */

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FormState } from "@/lib/form";

export function ActionForm({
  action,
  submitLabel,
  pendingLabel,
  children,
  variant = "primary",
  hold = false,
  full = true,
  disabled = false,
  disabledReason,
  className,
  showMessage = true,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  submitLabel: string;
  pendingLabel?: string;
  children?: React.ReactNode;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  hold?: boolean;
  full?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
  showMessage?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [holding, setHolding] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.ok && state.redirectTo) router.push(state.redirectTo);
  }, [state.ok, state.redirectTo, router]);

  const buttonClass =
    variant === "quiet"
      ? "btn-quiet"
      : `btn ${variant === "danger" ? "btn-danger" : variant === "secondary" ? "btn-secondary" : "btn-primary"}${full ? " btn-full" : ""}`;

  function startHold() {
    setHolding(true);
    holdTimer.current = setTimeout(() => {
      setHolding(false);
      formRef.current?.requestSubmit();
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
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {showMessage && state.ok && state.message ? (
        <p className="t-secondary" style={{ color: "var(--color-moss-strong)" }} role="status">
          {state.message}
        </p>
      ) : null}

      {hold ? (
        <button
          type="button"
          className={buttonClass}
          disabled={pending || disabled}
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") startHold();
          }}
          onKeyUp={cancelHold}
        >
          {pending
            ? (pendingLabel ?? "Working…")
            : holding
              ? "Keep holding…"
              : `${submitLabel} — hold`}
        </button>
      ) : (
        <button type="submit" className={buttonClass} disabled={pending || disabled}>
          {pending ? (pendingLabel ?? "Working…") : submitLabel}
        </button>
      )}

      {disabled && disabledReason ? <p className="field-help">{disabledReason}</p> : null}
    </form>
  );
}

/** A read-only value the owner copies: move-in links, gate codes. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="flex gap-2">
        <input
          className="input input-mono"
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
        />
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
