"use client";

/**
 * Suggest an edit. Structured fields, not a comment box: a corrected fee, a real
 * timeline, a quirk, or the inspection desk's actual habit — plus how you know.
 * Accepted edits earn $10 of account credit and put a fresh verification stamp on
 * the record.
 */

import { useActionState } from "react";
import { suggestEditAction, type SuggestState } from "@/app/(app)/jurisdictions/actions";

const initial: SuggestState = { error: null, ok: null };

export function SuggestForm({
  recordId,
  slug,
  currentFeeLabel,
  currentFeeDollars,
  currentTimeline,
}: {
  recordId: string;
  slug: string;
  currentFeeLabel: string;
  currentFeeDollars: string;
  currentTimeline: string;
}) {
  const [state, action, pending] = useActionState(suggestEditAction, initial);

  if (state.ok) {
    return (
      <div className="card mt-6">
        <p className="t-label">In moderation</p>
        <p className="t-body mt-2">{state.ok}</p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 flex flex-col gap-5">
      <input type="hidden" name="recordId" value={recordId} />
      <input type="hidden" name="slug" value={slug} />

      <fieldset className="flex flex-col gap-3">
        <legend className="t-label">Fee correction</legend>
        <label className="block">
          <span className="t-secondary">What the fee is called</span>
          <input className="input mt-2" name="feeLabel" defaultValue={currentFeeLabel} />
        </label>
        <label className="block">
          <span className="t-secondary">Amount in dollars</span>
          <input
            className="input input-mono mt-2"
            name="feeDollars"
            inputMode="decimal"
            placeholder={currentFeeDollars}
          />
        </label>
      </fieldset>

      <label className="block">
        <span className="t-label">Review timeline</span>
        <input
          className="input mt-2"
          name="reviewTimeline"
          placeholder={currentTimeline}
        />
      </label>

      <label className="block">
        <span className="t-label">Local quirk</span>
        <textarea
          className="input mt-2"
          name="quirks"
          placeholder="Counter now asks for the gas isometric on every tankless conversion, even a like-for-like."
        />
      </label>

      <label className="block">
        <span className="t-label">Inspection desk</span>
        <input
          className="input mt-2"
          name="inspectionContact"
          placeholder="Ask for the mechanical desk directly — the main line routes to voicemail after 3pm"
        />
      </label>

      <label className="block">
        <span className="t-label">Inspection lead time (days)</span>
        <input className="input input-mono mt-2" name="inspectionLeadTimeDays" type="number" min={0} max={60} />
      </label>

      <label className="block">
        <span className="t-label">How you know</span>
        <textarea
          className="input mt-2"
          name="evidence"
          required
          minLength={10}
          placeholder="Plan reviewer confirmed by phone 6/12, and our submittal was rejected for it on 6/09 — rejection letter attached to job 4471."
        />
        <span className="t-secondary mt-2 block">
          Required. Every accepted edit re-stamps the record with a verifier and a date, so the
          evidence is what a curator checks first.
        </span>
      </label>

      {state.error && (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-signal-red)" }}>
          {state.error}
        </p>
      )}

      <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
        {pending ? "Sending…" : "Send to moderation"}
      </button>
    </form>
  );
}
