"use client";

/**
 * The form wrapper every write in the product goes through.
 *
 * It exists so no screen invents its own pending/error handling: one place that
 * disables the button while a server action runs, one place where errors surface
 * as plain sentences, and one shape for the confirmation afterwards. Errors from
 * server actions are messages a volunteer can act on ("Thunder is at its
 * 14-player limit"), so they are rendered verbatim rather than replaced with
 * "Something went wrong".
 */

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

export interface FormState {
  error?: string;
  ok?: string;
}

/**
 * React 19 resets an uncontrolled form once its action has run. That is right
 * after a success — a sent announcement should leave an empty composer — and
 * badly wrong after a failure: a parent who typed three children's details and
 * got "we don't recognise that code" would find the whole form blank.
 *
 * So every submission is snapshotted, and the snapshot is restored whenever the
 * action came back with an error. One place, every form in the product.
 */
export function useValueRestore(
  state: FormState,
  options: {
    always?: boolean;
    /** Share one form element between two actions (register + re-quote). */
    formRef?: React.RefObject<HTMLFormElement | null>;
  } = {},
) {
  const ownRef = useRef<HTMLFormElement>(null);
  const formRef = options.formRef ?? ownRef;
  const snapshot = useRef<[string, string][] | null>(null);

  const capture = (form: HTMLFormElement) => {
    snapshot.current = [...new FormData(form).entries()].filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && !entry[0].startsWith("$"),
    );
  };

  useEffect(() => {
    // `always` is for forms that navigate away on success and must never lose
    // what was typed — the parent registration form, where a fee re-check
    // returns `ok` and would otherwise blank three children's details.
    if (!(state.error || (options.always && state.ok)) || !snapshot.current || !formRef.current) {
      return;
    }
    const saved = snapshot.current;
    const form = formRef.current;
    for (const element of Array.from(form.elements)) {
      const field = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if (!field.name || field.name.startsWith("$")) continue;
      if (field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")) {
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
  extraClass = "",
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  full?: boolean;
  small?: boolean;
  children?: React.ReactNode;
  className?: string;
  /** Destructive actions hold-to-confirm for 600ms (DESIGN.md motion rules). */
  confirmHold?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  /** Extra classes on the button itself — used for the all-clear sweep. */
  extraClass?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const { formRef, capture } = useValueRestore(state);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={(event) => capture(event.currentTarget)}
      className={`flex flex-col gap-3 ${className}`}
    >
      {children}
      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--bad)" }} role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="t-secondary" style={{ color: "var(--accent)" }} role="status">
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
        <HoldSubmit label={submitLabel} full={full} small={small} variant={variant} />
      ) : (
        <Submit
          label={submitLabel}
          pendingLabel={pendingLabel}
          variant={variant}
          full={full}
          small={small}
          extraClass={extraClass}
        />
      )}
    </form>
  );
}

function buttonClass(variant: string, full: boolean, small: boolean): string {
  if (variant === "quiet") return "btn-quiet";
  return `btn btn-${variant}${full ? " btn-full" : ""}${small ? " btn-small" : ""}`;
}

function Submit({
  label,
  pendingLabel,
  variant,
  full,
  small,
  extraClass = "",
}: {
  label: string;
  pendingLabel: string;
  variant: string;
  full: boolean;
  small: boolean;
  extraClass?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={`${buttonClass(variant, full, small)} ${extraClass}`.trim()}
      disabled={pending}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

/**
 * Hold-to-confirm: a 600ms fill before the action commits, per DESIGN.md's rule
 * for destructive actions (refund, unpublish, remove a player). Keyboard users
 * get the same gate through a two-press confirm, because a gesture must never be
 * the only path.
 */
function HoldSubmit({
  label,
  variant,
  full,
  small,
}: {
  label: string;
  variant: string;
  full: boolean;
  small: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={`${buttonClass(variant, full, small)} hold`}
      disabled={pending}
      data-hold="600"
      onClick={(event) => {
        const el = event.currentTarget;
        if (el.dataset.armed !== "true") {
          event.preventDefault();
          el.dataset.armed = "true";
          el.textContent = `${label} — press again to confirm`;
          window.setTimeout(() => {
            if (el.dataset.armed === "true") {
              el.dataset.armed = "false";
              el.textContent = label;
            }
          }, 4000);
        }
      }}
    >
      {pending ? "Working…" : label}
    </button>
  );
}
