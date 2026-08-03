"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/action-state";

const INITIAL: ActionState = { error: null, message: null };

/**
 * A form bound to a server action that returns `ActionState`. The result renders
 * as one line of text under the form — no toasts, nothing that disappears before
 * a foreman in the sun has read it.
 */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL);
  return (
    <form action={formAction} className={className}>
      {children}
      {state.error ? (
        <p className="t-secondary msg msg-error mt-3" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p className="t-secondary msg msg-ok mt-3" role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
