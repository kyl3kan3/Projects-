"use client";

import { ActionForm, type FormState } from "@/components/ActionForm";

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

export function RecordPaymentForm({
  action,
  householdId,
  suggestCents,
}: {
  action: Action;
  householdId: string;
  suggestCents: number;
}) {
  return (
    <details className="disclosure panel mt-3 p-4">
      <summary className="t-title">Record a cheque or cash</summary>
      <div className="pt-4">
        <ActionForm action={action} submitLabel="Record payment" full>
          <input type="hidden" name="householdId" value={householdId} />
          <div className="field">
            <label className="t-label" htmlFor={`amount-${householdId}`}>
              Amount received
            </label>
            <input
              id={`amount-${householdId}`}
              name="amount"
              className="input input-mono"
              inputMode="decimal"
              defaultValue={suggestCents > 0 ? (suggestCents / 100).toFixed(2) : ""}
              required
            />
            <p className="t-secondary">
              It is applied across this family&apos;s open registrations oldest first. Anything left
              over stays as credit and cancels their next balance.
            </p>
          </div>
          <div className="field">
            <label className="t-label" htmlFor={`method-${householdId}`}>
              How it arrived
            </label>
            <select
              id={`method-${householdId}`}
              name="method"
              className="input"
              defaultValue="check"
            >
              <option value="check">Cheque</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="field">
            <label className="t-label" htmlFor={`reference-${householdId}`}>
              Reference
            </label>
            <input
              id={`reference-${householdId}`}
              name="reference"
              className="input"
              placeholder="Cheque 1042"
            />
          </div>
        </ActionForm>
      </div>
    </details>
  );
}

export function RefundForm({
  action,
  registrationId,
  maxCents,
}: {
  action: Action;
  registrationId: string;
  maxCents: number;
}) {
  return (
    <details className="disclosure panel mt-3 p-4">
      <summary className="t-title" style={{ color: "var(--bad)" }}>
        Refund
      </summary>
      <div className="pt-4">
        <ActionForm action={action} submitLabel="Refund" variant="danger" full confirmHold>
          <input type="hidden" name="registrationId" value={registrationId} />
          <div className="field">
            <label className="t-label" htmlFor={`refund-${registrationId}`}>
              Amount
            </label>
            <input
              id={`refund-${registrationId}`}
              name="amount"
              className="input input-mono"
              inputMode="decimal"
              defaultValue={(maxCents / 100).toFixed(2)}
              required
            />
            <p className="t-secondary">
              Newest payment first, on the club&apos;s own Stripe account. Our $1.50 goes back too.
            </p>
          </div>
          <div className="field">
            <label className="t-label" htmlFor={`reason-${registrationId}`}>
              Reason
            </label>
            <input
              id={`reason-${registrationId}`}
              name="reason"
              className="input"
              placeholder="Moved out of town"
            />
          </div>
          <label className="flex items-center gap-3">
            <input type="checkbox" name="cancel" className="check" />
            <span className="t-body">Cancel the registration and free the place</span>
          </label>
        </ActionForm>
      </div>
    </details>
  );
}

/**
 * Withdraw a place, whatever it cost.
 *
 * Separate from the refund form on purpose: a full-scholarship child has nothing
 * to refund, and burying "cancel" inside a money form left no way to withdraw
 * them at all. This hands back anything that was actually settled and frees the
 * place for the waitlist either way.
 */
export function CancelRegistrationForm({
  action,
  registrationId,
  settledCents,
}: {
  action: Action;
  registrationId: string;
  settledCents: number;
}) {
  return (
    <details className="disclosure panel mt-3 p-4">
      <summary className="t-title" style={{ color: "var(--bad)" }}>
        Withdraw this registration
      </summary>
      <div className="pt-4">
        <p className="t-secondary">
          {settledCents > 0
            ? `Frees the place for the waitlist and refunds the ${(settledCents / 100).toLocaleString(
                "en-US",
                { style: "currency", currency: "USD" },
              )} already paid.`
            : "Nothing has been paid on this place, so there is nothing to refund. It frees the place for the waitlist."}
        </p>
        <ActionForm action={action} submitLabel="Withdraw" variant="danger" full confirmHold>
          <input type="hidden" name="registrationId" value={registrationId} />
          <div className="field">
            <label className="t-label" htmlFor={`cancel-reason-${registrationId}`}>
              Reason
            </label>
            <input
              id={`cancel-reason-${registrationId}`}
              name="reason"
              className="input"
              placeholder="Moved out of town"
            />
          </div>
        </ActionForm>
      </div>
    </details>
  );
}

export function ResendLinkForm({
  action,
  householdId,
  seasonId,
}: {
  action: Action;
  householdId: string;
  seasonId: string;
}) {
  return (
    <ActionForm action={action} submitLabel="Send their family page link" variant="quiet">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="seasonId" value={seasonId} />
    </ActionForm>
  );
}

export function RevokeLinkForm({
  action,
  householdId,
}: {
  action: Action;
  householdId: string;
}) {
  return (
    <ActionForm action={action} submitLabel="Revoke their links" variant="quiet" confirmHold>
      <input type="hidden" name="householdId" value={householdId} />
    </ActionForm>
  );
}
