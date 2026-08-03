"use client";

/**
 * Form primitives shared by every screen.
 *
 * Deliberately small: a labelled field, a submit button that knows it is
 * pending, and one place that renders an action's outcome. Every form in this
 * app is a real `<form>` posting to a server action, so it works before
 * hydration and keyboard-only users get the browser's own behaviour.
 */

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export interface ActionState {
  ok: boolean;
  message: string;
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="mb-4">
      <label className="t-placard block mb-2" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? (
        <p className="t-secondary mt-2" style={{ color: "var(--fg-3)" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton({
  children,
  pendingLabel,
  className = "btn btn-primary w-full",
  disabled = false,
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled}>
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}

/** One place that renders an action outcome, in the app's two semantic colours. */
export function ActionMessage({ state }: { state: ActionState | null }) {
  if (!state || !state.message) return null;
  return (
    <p
      role="status"
      className="t-secondary mb-4"
      style={{ color: state.ok ? "var(--good)" : "var(--bad)" }}
    >
      {state.message}
    </p>
  );
}
