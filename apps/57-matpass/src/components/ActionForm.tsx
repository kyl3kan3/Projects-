"use client";

/**
 * The form wrapper every write in the product goes through.
 *
 * It exists so no screen invents its own pending/error handling: one place that
 * disables the button while a server action runs, one place where errors surface
 * as plain sentences, one shape for the confirmation afterwards. Errors from
 * server actions are messages a front-desk person can act on ("Add a guardian
 * email to the household first — the link goes to them"), so they are rendered
 * verbatim rather than replaced with "Something went wrong".
 */

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

export interface FormState {
  error?: string;
  ok?: string;
}

/**
 * React 19 resets an uncontrolled form once its action has run. That is right
 * after a success — a sent announcement should leave an empty composer — and
 * badly wrong after a failure: an owner who typed a whole curriculum row and got
 * "display order 3 is taken" would find the form blank.
 *
 * So every submission is snapshotted, and the snapshot is restored whenever the
 * action came back with an error.
 */
export function useValueRestore(state: FormState, options: { always?: boolean } = {}) {
  const formRef = useRef<HTMLFormElement>(null);
  const snapshot = useRef<[string, string][] | null>(null);

  const capture = (form: HTMLFormElement) => {
    snapshot.current = [...new FormData(form).entries()].filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && !entry[0].startsWith("$"),
    );
  };

  useEffect(() => {
    if (!(state.error || (options.always && state.ok)) || !snapshot.current || !formRef.current) {
      return;
    }
    const saved = snapshot.current;
    const form = formRef.current;
    for (const element of Array.from(form.elements)) {
      const field = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if (!field.name || field.name.startsWith("$")) continue;
      if (
        field instanceof HTMLInputElement &&
        (field.type === "checkbox" || field.type === "radio")
      ) {
        field.checked = saved.some(([n, v]) => n === field.name && v === field.value);
        continue;
      }
      if (field instanceof HTMLInputElement && field.type === "file") continue;
      const match = saved.find(([n]) => n === field.name);
      if (match) field.value = match[1];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return { formRef, capture };
}

type Variant = "primary" | "secondary" | "quiet" | "danger";

function buttonClass(variant: Variant, full: boolean, small: boolean): string {
  if (variant === "quiet") return "btn-quiet";
  return `btn btn-${variant}${full ? " btn-full" : ""}${small ? " btn-small" : ""}`;
}

export function ActionForm({
  action,
  submitLabel,
  pendingLabel = "Working…",
  variant = "primary",
  full = false,
  small = false,
  children,
  className = "",
  confirmHold = false,
  disabled = false,
  disabledReason,
  hiddenFields,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  pendingLabel?: string;
  variant?: Variant;
  full?: boolean;
  small?: boolean;
  children?: React.ReactNode;
  className?: string;
  /** Destructive and record-reversing actions hold-to-confirm for 600ms. */
  confirmHold?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  hiddenFields?: Record<string, string>;
}) {
  const [state, formAction] = useActionState(action, {});
  const { formRef, capture } = useValueRestore(state);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={(event) => capture(event.currentTarget)}
      className={`flex flex-col ${className}`}
      style={{ gap: 12 }}
    >
      {hiddenFields
        ? Object.entries(hiddenFields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))
        : null}
      {children}
      {state.error ? (
        <p className="t-secondary alarm" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="t-secondary green" role="status">
          {state.ok}
        </p>
      ) : null}
      {disabled ? (
        <>
          <button type="button" className={buttonClass(variant, full, small)} disabled>
            {submitLabel}
          </button>
          {disabledReason ? <p className="t-secondary">{disabledReason}</p> : null}
        </>
      ) : confirmHold ? (
        <HoldSubmit label={submitLabel} variant={variant} full={full} small={small} />
      ) : (
        <Submit
          label={submitLabel}
          pendingLabel={pendingLabel}
          variant={variant}
          full={full}
          small={small}
        />
      )}
    </form>
  );
}

function Submit({
  label,
  pendingLabel,
  variant,
  full,
  small,
}: {
  label: string;
  pendingLabel: string;
  variant: Variant;
  full: boolean;
  small: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={buttonClass(variant, full, small)} disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

/**
 * Hold-to-confirm: a 600ms fill before the action commits, per DESIGN.md's rule
 * for destructive and record-reversing actions (revoke a kiosk, reverse a
 * promotion, mark a student lost). Keyboard users get the same gate through a
 * two-press confirm, because a gesture must never be the only path.
 *
 * The armed label lives in React state rather than being written into
 * `textContent`: mutating the DOM under React changes the button's accessible
 * name, which breaks both screen readers and anything driving the button by name.
 */
function HoldSubmit({
  label,
  variant,
  full,
  small,
}: {
  label: string;
  variant: Variant;
  full: boolean;
  small: boolean;
}) {
  const { pending } = useFormStatus();
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="submit"
      className={`${buttonClass(variant, full, small)} hold`}
      disabled={pending}
      aria-label={label}
      data-armed={armed ? "true" : undefined}
      onClick={(event) => {
        if (!armed) {
          event.preventDefault();
          setArmed(true);
        }
      }}
    >
      {pending ? "Working…" : armed ? "Press again to confirm" : label}
    </button>
  );
}
