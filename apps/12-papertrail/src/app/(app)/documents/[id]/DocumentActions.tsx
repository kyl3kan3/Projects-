"use client";

/**
 * The action sheet for one document: Send, Copy link, Remind, Record payment,
 * Invoice the balance, Duplicate, Void.
 *
 * DESIGN.md puts these in a bottom sheet with a grab handle; the primary action
 * stays pinned in the thumb zone. Every gesture has a button equivalent — there
 * are no swipe-only paths.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  IconBanknote,
  IconBell,
  IconCopy,
  IconFileText,
  IconSend,
  IconX,
} from "@/components/icons";
import type { ActionState } from "../actions";

export interface DocumentActionsProps {
  documentId: string;
  shareUrl: string;
  primary: { label: string; kind: "send" | "remind" | "balance" | "none" };
  canSend: boolean;
  canRemind: boolean;
  canBalance: boolean;
  canVoid: boolean;
  canRecordPayment: boolean;
  outstandingLabel?: string;
  actions: {
    send: (id: string) => Promise<ActionState>;
    remind: (id: string) => Promise<ActionState>;
    balance: (id: string) => Promise<ActionState>;
    void: (id: string) => Promise<ActionState>;
    duplicate: (id: string) => Promise<ActionState>;
  };
  recordPayment: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}

export function DocumentActions(props: DocumentActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<ActionState>({});
  const [pending, start] = useTransition();

  function run(fn: (id: string) => Promise<ActionState>) {
    start(async () => {
      const result = await fn(props.documentId);
      setNotice(result);
      setOpen(false);
      router.refresh();
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(props.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice({ error: "Couldn't copy — select the link above instead." });
    }
  }

  return (
    <>
      {notice.error || notice.message ? (
        <p
          className="t-secondary mt-4"
          role="status"
          style={{ color: notice.error ? "var(--color-vermilion)" : "var(--color-wax)" }}
        >
          {notice.error ?? notice.message}
        </p>
      ) : null}

      <div className="thumb-cta flex gap-2">
        {props.primary.kind !== "none" ? (
          <button
            className="btn btn-primary flex-1"
            disabled={pending}
            onClick={() =>
              run(
                props.primary.kind === "send"
                  ? props.actions.send
                  : props.primary.kind === "remind"
                    ? props.actions.remind
                    : props.actions.balance,
              )
            }
          >
            {pending ? "Working…" : props.primary.label}
          </button>
        ) : null}
        <button
          className="btn btn-secondary"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          style={{ background: "var(--color-ivory)", flex: props.primary.kind === "none" ? 1 : undefined }}
        >
          {props.primary.kind === "none" ? "Actions" : "More"}
        </button>
      </div>

      {open ? (
        <>
          <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="bottom-sheet" role="dialog" aria-label="Document actions">
            <div className="grab-handle" />
            <div className="flex items-center justify-between">
              <h2 className="t-label">Actions</h2>
              <button className="btn-quiet" onClick={() => setOpen(false)} aria-label="Close">
                <IconX size={18} />
              </button>
            </div>

            <div className="mt-2 flex flex-col">
              <button className="row" style={{ textAlign: "left" }} onClick={copyLink}>
                <IconCopy size={18} />
                <span className="flex-1">{copied ? "Link copied" : "Copy client link"}</span>
              </button>

              {props.canSend ? (
                <button
                  className="row"
                  style={{ textAlign: "left" }}
                  disabled={pending}
                  onClick={() => run(props.actions.send)}
                >
                  <IconSend size={18} />
                  <span className="flex-1">Send to the client again</span>
                </button>
              ) : null}

              {props.canRemind ? (
                <button
                  className="row"
                  style={{ textAlign: "left" }}
                  disabled={pending}
                  onClick={() => run(props.actions.remind)}
                >
                  <IconBell size={18} />
                  <span className="flex-1">Send the next reminder now</span>
                </button>
              ) : null}

              {props.canRecordPayment ? (
                <button
                  className="row"
                  style={{ textAlign: "left" }}
                  onClick={() => {
                    setOpen(false);
                    setPayOpen(true);
                  }}
                >
                  <IconBanknote size={18} />
                  <span className="flex-1">
                    Record a payment {props.outstandingLabel ? `(${props.outstandingLabel} due)` : ""}
                  </span>
                </button>
              ) : null}

              {props.canBalance ? (
                <button
                  className="row"
                  style={{ textAlign: "left" }}
                  disabled={pending}
                  onClick={() => run(props.actions.balance)}
                >
                  <IconBanknote size={18} />
                  <span className="flex-1">Mark complete and invoice the balance</span>
                </button>
              ) : null}

              <button
                className="row"
                style={{ textAlign: "left" }}
                disabled={pending}
                onClick={() => run(props.actions.duplicate)}
              >
                <IconFileText size={18} />
                <span className="flex-1">Duplicate as a new draft</span>
              </button>

              {props.canVoid ? (
                <button
                  className="row"
                  style={{ textAlign: "left", color: "var(--color-vermilion)" }}
                  disabled={pending}
                  onClick={() => {
                    if (confirm("Void this document? The client's link will say so. This cannot be undone.")) {
                      run(props.actions.void);
                    }
                  }}
                >
                  <IconX size={18} />
                  <span className="flex-1">Void this document</span>
                </button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {payOpen ? (
        <>
          <div className="scrim" onClick={() => setPayOpen(false)} aria-hidden="true" />
          <div className="bottom-sheet" role="dialog" aria-label="Record a payment">
            <div className="grab-handle" />
            <h2 className="t-label">Record a payment</h2>
            <p className="t-secondary mt-1">
              For money that arrived outside Stripe — a bank transfer, a cheque.
              {props.outstandingLabel ? ` ${props.outstandingLabel} outstanding.` : ""}
            </p>
            <PaymentForm
              documentId={props.documentId}
              action={props.recordPayment}
              onDone={() => {
                setPayOpen(false);
                router.refresh();
              }}
            />
          </div>
        </>
      ) : null}
    </>
  );
}

function PaymentForm({
  documentId,
  action,
  onDone,
}: {
  documentId: string;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  onDone: () => void;
}) {
  const [state, setState] = useState<ActionState>({});
  const [pending, start] = useTransition();

  return (
    <form
      className="mt-4 flex flex-col gap-3"
      action={(formData) =>
        start(async () => {
          const result = await action({}, formData);
          setState(result);
          if (result.ok) onDone();
        })
      }
    >
      <input type="hidden" name="documentId" value={documentId} />
      <label className="flex flex-col gap-2">
        <span className="t-label">Amount received</span>
        <input className="input input-money" name="amount" inputMode="decimal" placeholder="1440" required />
      </label>
      <label className="flex flex-col gap-2">
        <span className="t-label">Note</span>
        <input className="input" name="note" placeholder="Bank transfer, ref MERIDIAN-1" />
      </label>
      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-vermilion)" }} role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Recording…" : "Record payment"}
      </button>
    </form>
  );
}
