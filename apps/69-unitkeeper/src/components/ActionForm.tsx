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

  /**
   * React 19 resets an uncontrolled form after a form action completes — including
   * when the action came back with an error. On a move-in form that is eight fields
   * of typing gone because the owner left one blank, which is how a person decides
   * software hates them. So: snapshot the fields on submit, and put them back if the
   * action returned an error.
   *
   * Found by driving the real form in Chromium; nothing in the build or the types
   * says a word about it.
   */
  const typed = useRef<Array<{ name: string; value: string; checked: boolean }>>([]);

  useEffect(() => {
    if (!state.error || !formRef.current) return;
    for (const field of typed.current) {
      const el = formRef.current.elements.namedItem(field.name);
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      ) {
        if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
          el.checked = field.checked;
        } else if (el.value === "") {
          el.value = field.value;
        }
      }
    }
  }, [state]);

  function snapshot(form: HTMLFormElement) {
    typed.current = [...form.elements]
      .filter(
        (el): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
          (el instanceof HTMLInputElement ||
            el instanceof HTMLTextAreaElement ||
            el instanceof HTMLSelectElement) &&
          el.name !== "",
      )
      .map((el) => ({
        name: el.name,
        value: el.value,
        checked: el instanceof HTMLInputElement ? el.checked : false,
      }));
  }

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
    <form
      ref={formRef}
      action={formAction}
      onSubmitCapture={(e) => snapshot(e.currentTarget)}
      className={className ?? "flex flex-col gap-4"}
    >
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
