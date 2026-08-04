"use client";

/**
 * src/components/ActionForm.tsx
 *
 * One wrapper for every server action in the app, so pending state, the error
 * line and the confirmation line look identical everywhere. A yard hand should
 * never have to guess whether a form did anything.
 *
 * `hold` turns the submit into a hold-to-confirm control, which DESIGN.md's
 * restraint wants for the actions with consequences: capturing a deposit,
 * retiring an item, cancelling an order.
 *
 * It submits through `form.requestSubmit()` rather than `startTransition`.
 * `startTransition` inside a `setState` updater throws in React 19 and surfaces
 * as "Application error: a client-side exception has occurred" — which is what
 * the user sees instead of the feature. `requestSubmit` has no such edge.
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
  onState,
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
  /** Lets a parent render fields that depend on the returned state (echoed values). */
  onState?: (state: FormState) => void;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [holding, setHolding] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onState?.(state);
    // `onState` is a render-time callback from the parent; including it in the
    // deps would re-fire on every parent render rather than on every result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  /**
   * React 19 resets an uncontrolled form after a form action completes, error or
   * not. On a quote line that is the quantity gone because the date was wrong.
   * So: snapshot the fields on submit and put them back if the action failed.
   * Found by driving the real form in Chromium; the build says nothing.
   */
  const typed = useRef<Array<{ name: string; value: string; checked: boolean }>>([]);

  useEffect(() => {
    if (!state.error || !formRef.current) return;
    for (const entry of typed.current) {
      const el = formRef.current.elements.namedItem(entry.name);
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      ) {
        if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
          el.checked = entry.checked;
        } else if (el.value === "") {
          el.value = entry.value;
        }
      }
    }
  }, [state]);

  function snapshotFields(form: HTMLFormElement) {
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
      onSubmitCapture={(e) => snapshotFields(e.currentTarget)}
      className={className ?? "stack"}
      style={{ gap: 16 }}
    >
      {children}

      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {showMessage && state.ok && state.message ? (
        <p className="form-status" role="status">
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
