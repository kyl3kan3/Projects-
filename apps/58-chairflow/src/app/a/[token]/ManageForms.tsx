"use client";

import { useActionState, useState } from "react";
import {
  cancelByTokenAction,
  rescheduleByTokenAction,
  type ManageValues,
} from "@/app/a/[token]/actions";
import { FormError } from "@/components/ui";
import { emptyState, type FormState } from "@/lib/forms";

/**
 * The two things a client can do to their own appointment.
 *
 * Cancelling states the consequence **before** the tap, in the sentence the server computed
 * from the policy they agreed to. No surprise charges, ever — which is also the only version
 * of this that survives a chargeback.
 *
 * Two separate top-level forms: an inner form would be dropped by the browser and its submit
 * would run the outer action, which here would mean "reschedule" quietly cancelling.
 */
export function RescheduleForm({
  token,
  slots,
}: {
  token: string;
  slots: Array<{ iso: string; label: string; day: string }>;
}) {
  const initial: FormState<ManageValues> = emptyState({ token, startsAt: slots[0]?.iso ?? "" });
  const [state, action, pending] = useActionState(rescheduleByTokenAction, initial);

  if (slots.length === 0) {
    return (
      <p className="t-secondary" style={{ margin: 0 }}>
        There is nothing else free in the next two weeks. Cancelling and rebooking later is
        your best option.
      </p>
    );
  }

  return (
    <form action={action} className="stack" style={{ gap: 12 }}>
      <input type="hidden" name="token" value={token} />
      <FormError message={state.error} />
      <label className="field">
        <span className="t-label">Move it to</span>
        <select className="input" name="startsAt" defaultValue={state.values.startsAt}>
          {slots.map((s) => (
            <option key={s.iso} value={s.iso}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Moving…" : "Move my appointment"}
      </button>
    </form>
  );
}

export function CancelForm({
  token,
  consequence,
  feeLabel,
}: {
  token: string;
  consequence: string;
  feeLabel: string | null;
}) {
  const initial: FormState<ManageValues> = emptyState({ token, startsAt: "" });
  const [state, action, pending] = useActionState(cancelByTokenAction, initial);
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={action} className="stack" style={{ gap: 12 }}>
      <input type="hidden" name="token" value={token} />
      <FormError message={state.error} />
      <p className="t-secondary" style={{ margin: 0 }}>
        {consequence}
      </p>
      {!confirming ? (
        <button
          type="button"
          className="btn btn-secondary btn-full"
          onClick={() => setConfirming(true)}
        >
          Cancel my appointment
        </button>
      ) : (
        <>
          <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
            {pending
              ? "Cancelling…"
              : feeLabel
                ? `Yes, cancel and charge ${feeLabel}`
                : "Yes, cancel it"}
          </button>
          <button
            type="button"
            className="btn-quiet"
            style={{ justifySelf: "center" }}
            onClick={() => setConfirming(false)}
          >
            Keep my appointment
          </button>
        </>
      )}
    </form>
  );
}
