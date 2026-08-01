"use client";

import { useActionState, useState } from "react";
import { IconAlert, IconCalendarCheck, IconCheck } from "@/components/icons";
import {
  portalPromiseAction,
  startPaymentAction,
  type PortalActionState,
} from "./actions";

function Feedback({ state }: { state: PortalActionState }) {
  if (!state.error && !state.notice) return null;
  return (
    <p
      className="t-secondary"
      role="status"
      style={{
        color: state.error ? "var(--color-red)" : "var(--color-banker)",
        display: "flex",
        gap: 8,
        marginTop: 12,
      }}
    >
      {state.error ? <IconAlert size={18} style={{ flex: "none" }} /> : <IconCheck size={18} style={{ flex: "none" }} />}
      <span>{state.error ?? state.notice}</span>
    </p>
  );
}

export function PortalPanel({
  token,
  invoiceId,
  amountLabel,
  amountValue,
  minPartial,
  today,
  suggestedDate,
  promisedForLabel,
}: {
  token: string;
  invoiceId: string;
  amountLabel: string;
  amountValue: string;
  minPartial: string;
  today: string;
  suggestedDate: string;
  /** Set when a date is already on record — the confirmation the client sees. */
  promisedForLabel: string | null;
}) {
  const [payState, pay, paying] = useActionState<PortalActionState, FormData>(startPaymentAction, {});
  const [promiseState, promise, promising] = useActionState<PortalActionState, FormData>(
    portalPromiseAction,
    {},
  );
  const [partialOpen, setPartialOpen] = useState(false);
  const [promiseOpen, setPromiseOpen] = useState(false);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <form action={pay}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="invoiceId" value={invoiceId} />
        {partialOpen ? (
          <label style={{ display: "grid", gap: 8, marginBottom: 12 }}>
            <span className="t-label">Amount to pay now</span>
            <input
              className="field"
              name="amount"
              defaultValue={amountValue}
              inputMode="decimal"
              style={{ fontFamily: "var(--font-mono)" }}
            />
            <span className="t-secondary">Part payments start at {minPartial}.</span>
          </label>
        ) : null}
        <button className="btn btn-primary btn-full" type="submit" disabled={paying}>
          {paying ? "Starting…" : partialOpen ? "Pay this amount" : `Pay ${amountLabel}`}
        </button>
      </form>

      {!partialOpen ? (
        <button className="btn-quiet" type="button" onClick={() => setPartialOpen(true)}>
          Pay part of it instead
        </button>
      ) : (
        <button
          className="btn-quiet"
          type="button"
          onClick={() => setPartialOpen(false)}
          style={{ color: "var(--color-text-2)" }}
        >
          Pay the full balance
        </button>
      )}
      <Feedback state={payState} />
      {payState.clientSecret ? (
        <p className="t-secondary" style={{ color: "var(--color-text-2)" }}>
          Card and bank details are collected by Stripe on the next step, on the firm&rsquo;s own
          account. PaidWell never sees them.
        </p>
      ) : null}

      {promisedForLabel ? (
        <p
          className="t-secondary"
          role="status"
          style={{ color: "var(--color-banker)", display: "flex", gap: 8 }}
        >
          <IconCheck size={18} style={{ flex: "none" }} />
          <span>
            Thank you — noted for {promisedForLabel}. No reminders are due before then.
          </span>
        </p>
      ) : promiseOpen ? (
        <form action={promise} className="panel" style={{ padding: 16, display: "grid", gap: 12 }}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <label style={{ display: "grid", gap: 8 }}>
            <span className="t-label">I&rsquo;ll pay on</span>
            <input
              className="field"
              type="date"
              name="promisedFor"
              defaultValue={suggestedDate}
              min={today}
              required
            />
          </label>
          <p className="t-secondary">
            Telling them a date is genuinely useful — reminders stop until then.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" type="submit" disabled={promising}>
              <IconCalendarCheck size={18} />
              {promising ? "Saving…" : "Tell them this date"}
            </button>
            <button
              className="btn-quiet"
              type="button"
              onClick={() => setPromiseOpen(false)}
              style={{ color: "var(--color-text-2)" }}
            >
              Cancel
            </button>
          </div>
          <Feedback state={promiseState} />
        </form>
      ) : (
        <button className="btn-quiet" type="button" onClick={() => setPromiseOpen(true)}>
          I&rsquo;ll pay on a date
        </button>
      )}
      {!promiseOpen ? <Feedback state={promiseState} /> : null}
    </div>
  );
}
