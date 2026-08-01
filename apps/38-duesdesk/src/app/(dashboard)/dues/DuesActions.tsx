"use client";

/**
 * The two board actions that live on the dues screen: "Run reminders" as the
 * header's secondary, and "Record a payment" in the thumb zone — because the
 * check holdouts are the reason a treasurer opens this screen on a Tuesday
 * night, and recording one must be two taps from here.
 */

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { IconReceipt, IconSend } from "@/components/icons";
import { recordPaymentAction, runAutopayAction, runRemindersAction } from "./actions";

export function RemindersButton() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button className="btn-quiet" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Run reminders
      </button>
      {open ? (
        <div className="sheet absolute right-0 z-30 mt-2 w-[300px] p-4">
          <p className="t-title">Send the next step of the ladder</p>
          <p className="t-secondary mt-2">
            Each overdue invoice gets the one step it has newly crossed — gentle at 3 days, firm at
            14, board flag at 30. Nothing repeats a step it has already sent, so running this twice
            in a night sends nothing twice.
          </p>
          <div className="mt-4">
            <ActionForm
              action={runRemindersAction}
              submitLabel="Send reminders"
              pendingLabel="Sending…"
              variant="secondary"
              full
            >
              <span className="t-secondary flex items-center gap-2">
                <IconSend size={18} className="navy" />
                Email, plus SMS to anyone who opted in
              </span>
            </ActionForm>
          </div>
          <div className="hairline-t mt-4 pt-4">
            <ActionForm
              action={runAutopayAction}
              submitLabel="Charge autopay now"
              pendingLabel="Charging…"
              variant="quiet"
            >
              <p className="t-secondary">
                Autopay normally runs on the due date. Running it by hand is safe: one attempt per
                invoice, ever.
              </p>
            </ActionForm>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ThumbActions({
  households,
}: {
  households: { id: string; unitLabel: string }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="thumb-cta">
        <button className="btn btn-primary btn-full" onClick={() => setOpen(true)}>
          <IconReceipt size={18} />
          Record a payment
        </button>
      </div>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ background: "rgba(30, 39, 50, 0.32)" }}
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="sheet w-full max-h-[88vh] overflow-y-auto p-5"
            style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="t-label">Record a payment</p>
                <h2 className="t-h2 mt-1">Which household?</h2>
              </div>
              <button className="btn-quiet" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <p className="t-secondary mt-3">
              Pick the unit and you land on its oldest open invoice, where the check goes on in one
              more tap.
            </p>
            <div className="mt-4">
              {households.length === 0 ? (
                <p className="t-secondary py-3">
                  Nothing is outstanding, so there is no check to record.
                </p>
              ) : (
                households.map((h) => (
                  <a key={h.id} href={`/dues/${h.id}#record`} className="row">
                    <span className="t-title flex-1">{h.unitLabel}</span>
                    <span className="t-secondary">Record</span>
                  </a>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** The record-a-check form, rendered inline on a household. */
export function RecordPaymentForm({
  invoiceId,
  suggestedCents,
  todayIso,
}: {
  invoiceId: string;
  suggestedCents: number;
  todayIso: string;
}) {
  return (
    <ActionForm action={recordPaymentAction} submitLabel="Record it" pendingLabel="Recording…" full>
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <label className="field">
        <span className="t-label">Amount</span>
        <input
          className="input input-mono"
          name="amount"
          inputMode="decimal"
          defaultValue={(suggestedCents / 100).toFixed(2)}
          required
        />
      </label>
      <div className="flex gap-3">
        <label className="field flex-1">
          <span className="t-label">How it arrived</span>
          <select className="input" name="method" defaultValue="check">
            <option value="check">Check</option>
            <option value="cash">Cash</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="field flex-1">
          <span className="t-label">Received</span>
          <input
            className="input input-mono"
            name="receivedOn"
            type="date"
            defaultValue={todayIso}
            required
          />
        </label>
      </div>
      <label className="field">
        <span className="t-label">Reference</span>
        <input className="input input-mono" name="reference" placeholder="check 1841" />
      </label>
      <p className="t-secondary">
        Paying more than the balance is fine — the excess is held as credit for this household and
        shown on their portal.
      </p>
    </ActionForm>
  );
}
