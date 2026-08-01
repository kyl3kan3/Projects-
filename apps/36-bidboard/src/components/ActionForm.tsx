"use client";

import { useActionState } from "react";

/**
 * The shared result shape for every server action in the app. Kept in a client
 * component file on purpose: importing it from a module that also reaches the
 * database would pull `postgres` into the browser bundle.
 */
export interface ActionState {
  error?: string;
  ok?: string;
  /** A portal link or export path worth showing verbatim. */
  detail?: string;
}

/**
 * A form bound to a server action, with the pending state and the result line
 * handled once instead of in thirty places. The result is deliberately quiet — a
 * secondary line under the control, never a toast that steals focus.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel,
  variant = "primary",
  className,
  hiddenFields,
  compact = false,
  confirm,
  disabled,
  disabledReason,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children?: React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  className?: string;
  hiddenFields?: Record<string, string>;
  /** Inline layout: the control sits beside the fields rather than under them. */
  compact?: boolean;
  confirm?: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  return (
    <form
      action={formAction}
      className={
        className ?? (compact ? "flex flex-wrap items-end gap-3" : "flex flex-col gap-3")
      }
      onSubmit={
        confirm
          ? (e) => {
              if (!window.confirm(confirm)) e.preventDefault();
            }
          : undefined
      }
    >
      {Object.entries(hiddenFields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <button
        type="submit"
        disabled={pending || disabled}
        className={
          variant === "quiet" ? "btn-quiet" : `btn btn-${variant}${compact ? "" : " btn-full"}`
        }
        style={compact && variant !== "quiet" ? { height: 44 } : undefined}
      >
        {pending ? (pendingLabel ?? "Working…") : submitLabel}
      </button>

      {disabled && disabledReason ? (
        <p className="t-secondary basis-full">{disabledReason}</p>
      ) : null}
      {state.error ? (
        <p className="t-secondary basis-full" role="alert" style={{ color: "var(--bad)" }}>
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="t-secondary basis-full" style={{ color: "var(--ok)" }}>
          {state.ok}
        </p>
      ) : null}
      {state.detail ? (
        <p className="t-data basis-full break-all" style={{ color: "var(--fg-2)" }}>
          {state.detail}
        </p>
      ) : null}
    </form>
  );
}
