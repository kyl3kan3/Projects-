"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/(app)/portals/actions";

/**
 * A form bound to a server action, with the pending state and the result line
 * handled once instead of in twenty places. The result is deliberately quiet: a
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
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children?: React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "quiet";
  className?: string;
  hiddenFields?: Record<string, string>;
  /** Inline layout: the control sits beside the fields rather than under them. */
  compact?: boolean;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  return (
    <form
      action={formAction}
      className={className ?? (compact ? "flex flex-wrap items-end gap-3" : "flex flex-col gap-3")}
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
        disabled={pending}
        className={
          variant === "quiet"
            ? "btn-quiet"
            : `btn btn-${variant}${compact ? "" : " btn-full"}`
        }
        style={compact && variant !== "quiet" ? { height: 44 } : undefined}
      >
        {pending ? (pendingLabel ?? "Working…") : submitLabel}
      </button>

      {state.error ? (
        <p
          className="t-secondary basis-full"
          role="alert"
          style={{ color: "var(--color-amber)" }}
        >
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="t-secondary basis-full" style={{ color: "var(--color-green)" }}>
          {state.ok}
        </p>
      ) : null}
      {state.link ? (
        <p className="t-data basis-full break-all" style={{ color: "var(--color-ink-2)" }}>
          {state.link}
        </p>
      ) : null}
    </form>
  );
}
