"use client";

import { useState, useTransition } from "react";
import { IconAlert, IconCard, IconCheck } from "@/components/icons";
import { formatMoney } from "@/lib/money";
import { acceptAction, payDepositAction, type AcceptState } from "./actions";

/**
 * Accept and pay, on the homeowner's side.
 *
 * The typed name is the signature — the same instrument a contractor's paper
 * contract uses — and it is recorded with the timestamp and the IP. If a deposit is
 * due, acceptance and payment are one motion: the button that signs also opens the
 * payment page, because a second decision is a second chance to walk away.
 *
 * When the contractor has not connected a payment account, this says so plainly
 * rather than pretending a card can be taken.
 */
export function AcceptPanel({
  token,
  companyName,
  depositCents,
  totalCents,
  terms,
  accepted,
  acceptedByName,
  depositPaid,
}: {
  token: string;
  companyName: string;
  depositCents: number;
  totalCents: number;
  terms: string;
  accepted: boolean;
  acceptedByName: string | null;
  depositPaid: boolean;
}) {
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [state, setState] = useState<AcceptState>({});
  const [pending, startTransition] = useTransition();

  if (depositPaid) {
    return (
      <div className="panel" style={{ padding: 20 }}>
        <p className="t-title" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <IconCheck size={18} />
          Deposit received — thank you
        </p>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          {companyName} has your deposit of {formatMoney(depositCents)} and will be in touch to
          schedule. Your receipt is in your inbox, and this page stays available as your copy of the
          accepted proposal.
        </p>
      </div>
    );
  }

  if (accepted || state.accepted) {
    return (
      <div className="panel" style={{ padding: 20 }}>
        <p className="t-title" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <IconCheck size={18} />
          Accepted{acceptedByName ? ` by ${acceptedByName}` : ""}
        </p>
        {depositCents > 0 ? (
          <>
            <p className="t-secondary" style={{ marginTop: 8 }}>
              A deposit of {formatMoney(depositCents)} starts the work.
            </p>
            {state.checkoutUrl ? (
              <a className="btn btn-primary btn-full" href={state.checkoutUrl} style={{ marginTop: 16 }}>
                <IconCard size={18} />
                Pay the {formatMoney(depositCents)} deposit
              </a>
            ) : (
              <button
                className="btn btn-primary btn-full"
                type="button"
                style={{ marginTop: 16 }}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setState(await payDepositAction(token));
                  })
                }
              >
                <IconCard size={18} />
                {pending ? "Opening payment…" : `Pay the ${formatMoney(depositCents)} deposit`}
              </button>
            )}
            {state.depositNotice ? (
              <p className="t-secondary" style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <IconAlert size={18} style={{ flex: "none" }} />
                <span>{state.depositNotice}</span>
              </p>
            ) : null}
          </>
        ) : (
          <p className="t-secondary" style={{ marginTop: 8 }}>
            {companyName} has been notified and will be in touch to schedule.
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <p className="t-secondary" style={{ marginBottom: 16 }}>
        {terms}
      </p>
      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Type your full name to sign</span>
        <input
          className="field"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Marisol Vance"
          autoComplete="name"
        />
      </label>
      <label
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
          marginTop: 16,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          style={{ width: 22, height: 22, marginTop: 2, accentColor: "var(--color-ink)" }}
        />
        <span className="t-secondary">
          I have read the scope and terms above and I accept this proposal at{" "}
          {formatMoney(totalCents)}
          {depositCents > 0 ? `, with a ${formatMoney(depositCents)} deposit to start` : ""}.
        </span>
      </label>

      {state.error ? (
        <p
          className="t-secondary"
          role="alert"
          style={{ marginTop: 16, color: "#a8493b", display: "flex", gap: 8 }}
        >
          <IconAlert size={18} style={{ flex: "none" }} />
          <span>{state.error}</span>
        </p>
      ) : null}

      <button
        className="btn btn-primary btn-full"
        type="button"
        style={{ marginTop: 20 }}
        disabled={pending || name.trim().length < 3 || !agreed}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptAction(token, name);
            setState(result);
            if (result.checkoutUrl) window.location.href = result.checkoutUrl;
          })
        }
      >
        {pending
          ? "Signing…"
          : depositCents > 0
            ? `Accept & pay ${formatMoney(depositCents)} deposit`
            : "Accept this proposal"}
      </button>
      <p className="t-secondary" style={{ marginTop: 12, textAlign: "center" }}>
        Your name, the time and your IP address are recorded with the acceptance.
      </p>
    </div>
  );
}
