"use client";

import { useActionState, useRef, useState } from "react";
import { IconAlert, IconCheck, IconHandshake, IconPause, IconPlay, IconSend } from "@/components/icons";
import {
  disputeAction,
  logPromiseAction,
  pauseRunAction,
  resumeRunAction,
  sendNextStepAction,
  writeOffAction,
  type InvoiceActionState,
} from "./actions";

function Feedback({ state }: { state: InvoiceActionState }) {
  if (!state.error && !state.notice) return null;
  return (
    <p
      className="t-secondary"
      role="status"
      style={{
        color: state.error ? "var(--color-red)" : "var(--color-banker)",
        display: "flex",
        gap: 8,
        marginTop: 8,
      }}
    >
      {state.error ? <IconAlert size={18} style={{ flex: "none" }} /> : <IconCheck size={18} style={{ flex: "none" }} />}
      <span>{state.error ?? state.notice}</span>
    </p>
  );
}

/**
 * Hold-to-confirm, 600ms radial fill, for the two actions that cannot be undone
 * from a phone in a hurry: sending a step early and writing money off.
 */
function HoldButton({
  label,
  holdingLabel,
  onConfirm,
  disabled,
  tone = "ink",
  icon,
}: {
  label: string;
  holdingLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  tone?: "ink" | "danger";
  icon?: React.ReactNode;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = () => {
    if (disabled) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      setHolding(false);
      onConfirm();
    }, 600);
  };
  const cancel = () => {
    setHolding(false);
    if (timer.current) clearTimeout(timer.current);
  };

  return (
    <button
      type="button"
      className={tone === "danger" ? "btn btn-secondary btn-full" : "btn btn-primary btn-full"}
      style={{ position: "relative", overflow: "hidden", color: tone === "danger" ? "var(--color-red)" : undefined }}
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") start();
      }}
      onKeyUp={cancel}
      onBlur={cancel}
    >
      <span className="hold-progress" data-holding={holding} aria-hidden="true" />
      {icon}
      <span style={{ position: "relative" }}>{holding ? holdingLabel : label}</span>
    </button>
  );
}

export function InvoiceActionBar({
  invoiceId,
  canSend,
  sendLabel,
  isPaused,
  isStopped,
  canPromise,
  suggestedDate,
  today,
}: {
  invoiceId: string;
  canSend: boolean;
  sendLabel: string;
  isPaused: boolean;
  isStopped: boolean;
  canPromise: boolean;
  /** Pre-filled date: a date parsed from their reply, else a week out. */
  suggestedDate: string;
  /** The earliest date that can be promised. Not the suggestion — today. */
  today: string;
}) {
  const [promiseOpen, setPromiseOpen] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);

  const [sendState, send] = useActionState<InvoiceActionState, FormData>(sendNextStepAction, {});
  const [promiseState, promise, promisePending] = useActionState<InvoiceActionState, FormData>(
    logPromiseAction,
    {},
  );
  const [pauseState, pause] = useActionState<InvoiceActionState, FormData>(pauseRunAction, {});
  const [resumeState, resume] = useActionState<InvoiceActionState, FormData>(resumeRunAction, {});
  const [writeOffState, writeOff] = useActionState<InvoiceActionState, FormData>(writeOffAction, {});
  const [disputeState, dispute] = useActionState<InvoiceActionState, FormData>(disputeAction, {});

  const sendForm = useRef<HTMLFormElement>(null);
  const writeOffForm = useRef<HTMLFormElement>(null);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {promiseOpen ? (
        <form action={promise} className="panel" style={{ padding: 16, display: "grid", gap: 12 }}>
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <p className="t-label">They said they would pay on</p>
          <input
            className="field"
            type="date"
            name="promisedFor"
            defaultValue={suggestedDate}
            min={today}
            required
          />
          <input className="field" name="note" placeholder="Who said it, and where (optional)" />
          <p className="t-secondary">
            Logging a promise pauses every follow-up on this invoice until that date. If the
            date passes unpaid, the ladder resumes one step firmer with copy that names the
            date they gave.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" type="submit" disabled={promisePending}>
              {promisePending ? "Logging…" : "Log the promise"}
            </button>
            <button className="btn-quiet" type="button" onClick={() => setPromiseOpen(false)}>
              Cancel
            </button>
          </div>
          <Feedback state={promiseState} />
        </form>
      ) : null}

      {dangerOpen ? (
        <div className="panel" style={{ padding: 16, display: "grid", gap: 16 }}>
          <div>
            <p className="t-label" style={{ marginBottom: 8 }}>
              Write this off
            </p>
            <form ref={writeOffForm} action={writeOff} style={{ display: "grid", gap: 8 }}>
              <input type="hidden" name="invoiceId" value={invoiceId} />
              <input className="field" name="reason" placeholder="Reason for the record" />
              <HoldButton
                label="Hold to write off"
                holdingLabel="Keep holding…"
                tone="danger"
                onConfirm={() => writeOffForm.current?.requestSubmit()}
              />
            </form>
            <Feedback state={writeOffState} />
          </div>
          <div>
            <p className="t-label" style={{ marginBottom: 8 }}>
              Or flag a dispute
            </p>
            <form action={dispute} style={{ display: "grid", gap: 8 }}>
              <input type="hidden" name="invoiceId" value={invoiceId} />
              <input className="field" name="note" placeholder="What is being disputed" />
              <button className="btn btn-secondary btn-full" type="submit">
                Mark disputed and stop follow-up
              </button>
            </form>
            <Feedback state={disputeState} />
          </div>
          <button className="btn-quiet" type="button" onClick={() => setDangerOpen(false)}>
            Close
          </button>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 8 }}>
        {canPromise ? (
          <button
            className="btn btn-secondary btn-full"
            type="button"
            onClick={() => setPromiseOpen((v) => !v)}
          >
            <IconHandshake size={18} />
            Log a promise
          </button>
        ) : null}

        <form ref={sendForm} action={send}>
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <HoldButton
            label={sendLabel}
            holdingLabel="Keep holding…"
            disabled={!canSend}
            icon={<IconSend size={18} />}
            onConfirm={() => sendForm.current?.requestSubmit()}
          />
        </form>
        <Feedback state={sendState} />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "space-between" }}>
          {isStopped || isPaused ? (
            <form action={resume}>
              <input type="hidden" name="invoiceId" value={invoiceId} />
              <button className="btn-quiet" type="submit">
                <IconPlay size={18} />
                Resume follow-up
              </button>
            </form>
          ) : (
            <form action={pause}>
              <input type="hidden" name="invoiceId" value={invoiceId} />
              <button className="btn-quiet" type="submit">
                <IconPause size={18} />
                Stop follow-up
              </button>
            </form>
          )}
          <button
            className="btn-quiet"
            type="button"
            style={{ color: "var(--color-text-2)" }}
            onClick={() => setDangerOpen((v) => !v)}
          >
            Write off or dispute
          </button>
        </div>
        <Feedback state={pauseState} />
        <Feedback state={resumeState} />
      </div>
    </div>
  );
}
