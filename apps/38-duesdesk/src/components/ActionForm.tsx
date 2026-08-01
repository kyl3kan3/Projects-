"use client";

/**
 * The form wrapper every write in the product goes through.
 *
 * It exists so no screen invents its own pending/error handling: one place to
 * disable the button while a server action runs, one place errors surface as
 * plain sentences, and one shape for the confirmation line afterwards. Errors
 * from server actions are messages a volunteer can act on, so they are rendered
 * verbatim rather than being replaced by "Something went wrong".
 */

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

export interface FormState {
  error?: string;
  ok?: string;
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
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "quiet";
  full?: boolean;
  small?: boolean;
  children?: React.ReactNode;
  className?: string;
  /** Board-power and destructive actions hold-to-confirm for 600ms. */
  confirmHold?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className={`flex flex-col gap-3 ${className}`}>
      {children}
      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-red)" }} role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="t-secondary" style={{ color: "var(--color-green)" }} role="status">
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
        />
      )}
    </form>
  );
}

function buttonClass(variant: string, full: boolean, small: boolean): string {
  const base =
    variant === "quiet" ? "btn-quiet" : `btn btn-${variant}${full ? " btn-full" : ""}${small ? " btn-small" : ""}`;
  return base;
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
  variant: string;
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
 * Hold-to-confirm: 600ms of fill before the action fires, per DESIGN.md's rule
 * for board-power actions (waive a fee, close an issue, revoke a link). Keyboard
 * users get the same gate through a two-press confirm, because a gesture must
 * never be the only path.
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
        // Two-stage confirm: the first press arms, the second commits. The CSS
        // fill runs on :active so a press-and-hold reads as the same gesture.
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
