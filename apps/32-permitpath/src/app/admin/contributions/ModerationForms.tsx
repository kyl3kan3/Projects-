"use client";

/**
 * Moderation controls. Acceptance publishes a new version with the contributor as
 * its source and credits their org; rejection records a reason, and only a
 * bad-faith tick moves reputation — punishing honest misses is how a field network
 * stops reporting.
 */

import { useActionState, useState } from "react";
import {
  acceptContributionAction,
  rejectContributionAction,
  type CurationState,
} from "../actions";

const initial: CurationState = { error: null, ok: null };

export function AcceptForm({ contributionId }: { contributionId: string }) {
  const [state, action, pending] = useActionState(acceptContributionAction, initial);
  return (
    <form action={action} className="inline-flex flex-col">
      <input type="hidden" name="contributionId" value={contributionId} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Publishing…" : "Accept, publish, credit $10"}
      </button>
      {state.error && (
        <span className="t-secondary mt-2" role="alert" style={{ color: "var(--color-signal-red)" }}>
          {state.error}
        </span>
      )}
      {state.ok && (
        <span className="t-secondary mt-2" style={{ color: "var(--color-brick)" }}>
          {state.ok}
        </span>
      )}
    </form>
  );
}

export function RejectForm({ contributionId }: { contributionId: string }) {
  const [state, action, pending] = useActionState(rejectContributionAction, initial);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="btn-quiet btn-quiet-sm" onClick={() => setOpen(true)}>
        Reject
      </button>
    );
  }

  return (
    <form action={action} className="mt-2 flex flex-col gap-3">
      <input type="hidden" name="contributionId" value={contributionId} />
      <label className="block">
        <span className="t-label">Reason (the contributor sees this)</span>
        <input
          className="input mt-2"
          name="reason"
          required
          placeholder="Fee schedule still shows $89 as of today's check"
        />
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="badFaith" />
        <span className="t-secondary">Bad faith — decay reputation</span>
      </label>
      <div className="flex gap-3">
        <button type="submit" className="btn btn-secondary" disabled={pending}>
          {pending ? "Saving…" : "Reject"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {state.error && (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-signal-red)" }}>
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="t-secondary" style={{ color: "var(--color-brick)" }}>
          {state.ok}
        </p>
      )}
    </form>
  );
}
