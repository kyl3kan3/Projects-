"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { IconAlert, IconCheck, IconChevronRight, IconClose } from "@/components/icons";
import { LEVEL_LABEL } from "@/lib/ladder";
import { shortenPortalLinks } from "@/lib/display";
import type { EscalationLevel } from "@/db/schema";
import {
  approveAllAction,
  approveOneAction,
  declineOneAction,
  type ApprovalActionState,
} from "./actions";

export interface TrayItem {
  messageId: string;
  invoiceId: string;
  clientName: string;
  invoiceNumber: string;
  amount: string;
  daysLate: number;
  level: number;
  promiseAware: boolean;
  toEmails: string[];
  subject: string;
  body: string;
}

function Feedback({ state }: { state: ApprovalActionState }) {
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
      {state.error ? <IconAlert size={18} /> : <IconCheck size={18} />}
      <span>{state.error ?? state.notice}</span>
    </p>
  );
}

/**
 * The approval tray. Every queued send is shown with the exact bytes that would
 * leave — subject, recipients and full body — because "approve" is meaningless if
 * the firm cannot read what they are approving.
 */
export function ApprovalTray({ items }: { items: TrayItem[] }) {
  const [allState, approveAllFormAction, approvingAll] = useActionState<ApprovalActionState, FormData>(
    approveAllAction,
    {},
  );

  return (
    <>
      <div>
        {items.map((item) => (
          <TrayRow key={item.messageId} item={item} />
        ))}
      </div>

      <div className="gutter" style={{ marginTop: 16 }}>
        <Feedback state={allState} />
      </div>

      <div className="thumb-bar">
        <form action={approveAllFormAction}>
          <button className="btn btn-primary btn-full" type="submit" disabled={approvingAll}>
            {approvingAll ? "Approving…" : `Approve all ${items.length}`}
          </button>
        </form>
      </div>
    </>
  );
}

function TrayRow({ item }: { item: TrayItem }) {
  const [open, setOpen] = useState(false);
  const [approveState, approve, approving] = useActionState<ApprovalActionState, FormData>(
    approveOneAction,
    {},
  );
  const [declineState, decline, declining] = useActionState<ApprovalActionState, FormData>(
    declineOneAction,
    {},
  );

  const levelLabel = LEVEL_LABEL[(item.level as EscalationLevel) ?? 1] ?? "Step";

  return (
    <article
      style={{ borderBottom: "1px solid var(--color-hairline)", padding: "16px var(--gutter)" }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span
          className="dot"
          style={{
            marginTop: 8,
            background: item.level >= 4 ? "var(--color-red)" : "var(--color-amber)",
          }}
          aria-hidden="true"
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="t-label">
            {levelLabel} · {item.invoiceNumber} · {item.daysLate}d late
            {item.promiseAware ? " · promise broken" : ""}
          </p>
          <p className="t-title" style={{ marginTop: 4 }}>
            {item.clientName}
          </p>
          <p className="t-secondary" style={{ marginTop: 2 }}>
            {item.subject}
          </p>
          <p className="t-data" style={{ marginTop: 6, color: "var(--color-text-aa)" }}>
            {item.amount} · to {item.toEmails.join(", ")}
          </p>
        </div>
      </div>

      <button
        className="btn-quiet"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        style={{ paddingLeft: 0 }}
      >
        {open ? "Hide the exact message" : "Read the exact message"}
        <IconChevronRight
          size={18}
          style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 120ms" }}
        />
      </button>

      {open ? (
        <div className="panel" style={{ padding: 16, marginTop: 8 }}>
          <p className="t-label">Subject</p>
          <p className="t-body" style={{ marginTop: 4 }}>
            {item.subject}
          </p>
          <p className="t-label" style={{ marginTop: 16 }}>
            Body
          </p>
          <div style={{ marginTop: 4, display: "grid", gap: 12 }}>
            {shortenPortalLinks(item.body)
              .split(/\n{2,}/)
              .map((paragraph, i) => (
                <p key={i} className="t-body" style={{ whiteSpace: "pre-wrap" }}>
                  {paragraph}
                </p>
              ))}
          </div>
          <p className="t-secondary" style={{ marginTop: 12, color: "var(--color-text-aa)" }}>
            The payment link is abbreviated here; the email carries the full signed link.
          </p>
          <Link
            href={`/invoices/${item.invoiceId}`}
            className="btn-quiet"
            style={{ paddingLeft: 0, marginTop: 8 }}
          >
            Open the invoice
          </Link>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
        <form action={approve}>
          <input type="hidden" name="messageId" value={item.messageId} />
          <button className="btn-quiet" type="submit" disabled={approving || declining}>
            <IconCheck size={18} />
            {approving ? "Sending…" : "Approve"}
          </button>
        </form>
        <form action={decline}>
          <input type="hidden" name="messageId" value={item.messageId} />
          <button
            className="btn-quiet"
            type="submit"
            disabled={approving || declining}
            style={{ color: "var(--color-text-2)" }}
          >
            <IconClose size={18} />
            {declining ? "Skipping…" : "Skip"}
          </button>
        </form>
      </div>

      <Feedback state={approveState} />
      <Feedback state={declineState} />
    </article>
  );
}
