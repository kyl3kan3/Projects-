"use client";

import { useActionState } from "react";
import { sendThisWeekAction } from "./actions";
import { type ActionState, IDLE } from "@/lib/action-state";
import { IconMegaphone } from "@/components/icons";

/**
 * The thumb-zone primary on the dashboard: schedule anything unscheduled and
 * send every crew its link. Idempotent — pressing it twice does not text a
 * foreman twice, because the instances are already delivered by then.
 */
export function SendThisWeek({ label }: { label: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    () => sendThisWeekAction(),
    IDLE,
  );
  return (
    <form action={formAction}>
      {state.error ? (
        <p
          className="t-secondary mb-2 rounded-[8px] px-3 py-2"
          role="alert"
          style={{ background: "var(--color-surface)", color: "var(--color-red)" }}
        >
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p
          className="t-secondary mb-2 rounded-[8px] px-3 py-2"
          role="status"
          style={{ background: "var(--color-surface)", color: "var(--color-fg-2)" }}
        >
          {state.message}
        </p>
      ) : null}
      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        <IconMegaphone size={18} />
        {pending ? "Sending…" : label}
      </button>
    </form>
  );
}
