"use client";

/**
 * A PO draft card: `carton` fill, hairline, radius 12, line items with a 44px
 * editable quantity field, a mono total row, and the full-width primary send in the
 * card footer. Never nested in another card, per DESIGN.md.
 *
 * Quantity edits post on blur rather than on every keystroke — a supplier PO is not
 * a live-search box, and one round trip per digit would fight the merchant's typing.
 */

import { useActionState, useState } from "react";
import { HoldToConfirm } from "@/components/HoldToConfirm";
import { IconDownload, IconSend } from "@/components/icons";
// Pure formatting, no database reach — safe in a client component, and the only way
// money reads the same here as everywhere else in the app.
import { moneyExact } from "@/lib/format";
import {
  dismissDraftAction,
  sendDraftAction,
  setLineQtyAction,
  type PoState,
} from "./actions";

const initial: PoState = { error: null, note: null };

export interface DraftLineView {
  id: string;
  sku: string;
  title: string;
  suggestedQty: number;
  finalQty: number;
  unitCostCents: number;
  moq: number;
  packSize: number;
}

export function DraftCard({
  draftId,
  supplierName,
  supplierEmail,
  leadTimeDays,
  minOrderValueCents,
  lines,
  totalLabel,
  warnings,
  errors,
  csvHref,
  currency,
}: {
  draftId: string;
  supplierName: string;
  supplierEmail: string | null;
  leadTimeDays: number;
  minOrderValueCents: number;
  lines: DraftLineView[];
  totalLabel: string;
  warnings: string[];
  errors: string[];
  csvHref: string;
  currency: string;
}) {
  const [sendState, sendAction, sending] = useActionState(sendDraftAction, initial);
  const [dismissState, dismissAction] = useActionState(dismissDraftAction, initial);

  return (
    <article className="panel p-4">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="t-label" style={{ color: "var(--color-fg-2)" }}>
          {supplierName} · {leadTimeDays}D LEAD
        </h2>
        <span className="t-data" style={{ color: "var(--color-fg-3)" }}>
          {lines.length} LINE{lines.length === 1 ? "" : "S"}
        </span>
      </header>

      <div className="mt-4">
        {lines.map((line) => (
          <LineRow key={line.id} draftId={draftId} line={line} currency={currency} />
        ))}
      </div>

      <div className="hairline-t mt-1 flex items-baseline justify-between py-3">
        <span className="t-label">Total</span>
        <span className="t-data" style={{ fontSize: 15 }}>
          {totalLabel}
        </span>
      </div>

      {minOrderValueCents > 0 ? (
        <p className="t-data" style={{ color: "var(--color-fg-3)" }}>
          MINIMUM ORDER {moneyExact(minOrderValueCents, currency)}
        </p>
      ) : null}

      {warnings.length ? (
        <ul className="mt-3 flex flex-col gap-1">
          {warnings.map((warning) => (
            <li key={warning} className="t-secondary" style={{ color: "var(--color-kraft)" }}>
              {warning}
            </li>
          ))}
        </ul>
      ) : null}
      {errors.length ? (
        <ul className="mt-3 flex flex-col gap-1">
          {errors.map((error) => (
            <li key={error} className="t-secondary" style={{ color: "var(--color-rust)" }}>
              {error}
            </li>
          ))}
        </ul>
      ) : null}

      <footer className="mt-4 flex flex-col gap-3">
        {/* The address belongs above the button, not inside it: a long supplier email
            wrapped the label onto two lines and pushed the card's primary action out
            of shape. DESIGN.md asks for "Send to supplier" as the label. */}
        {supplierEmail ? (
          <p className="t-data" style={{ color: "var(--color-fg-3)" }}>
            TO {supplierEmail.toUpperCase()}
          </p>
        ) : null}
        <form action={sendAction}>
          <input type="hidden" name="draftId" value={draftId} />
          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={sending || errors.length > 0}
            title={errors.length ? errors[0] : undefined}
          >
            <IconSend size={18} />
            {sending ? "Sending…" : "Send to supplier"}
          </button>
        </form>

        <div className="flex items-center gap-4">
          <a href={csvHref} className="btn-quiet flex items-center gap-1.5" download>
            <IconDownload size={16} />
            Export CSV
          </a>
          <div className="ml-auto min-w-[150px]">
            <DismissControl draftId={draftId} action={dismissAction} />
          </div>
        </div>

        {sendState.note ? (
          <p className="t-secondary" role="status">
            {sendState.note}
          </p>
        ) : null}
        {sendState.error ? (
          <p className="t-secondary" style={{ color: "var(--color-rust)" }} role="alert">
            {sendState.error}
          </p>
        ) : null}
        {dismissState.note ? (
          <p className="t-secondary" role="status">
            {dismissState.note}
          </p>
        ) : null}
      </footer>
    </article>
  );
}

function DismissControl({
  draftId,
  action,
}: {
  draftId: string;
  action: (formData: FormData) => void;
}) {
  const [formRef, setFormRef] = useState<HTMLFormElement | null>(null);
  return (
    <form ref={setFormRef} action={action}>
      <input type="hidden" name="draftId" value={draftId} />
      <HoldToConfirm
        label="Dismiss"
        holdingLabel="Hold to dismiss…"
        doneLabel="Dismissed"
        className="btn btn-secondary btn-full"
        onConfirm={() => formRef?.requestSubmit()}
      />
    </form>
  );
}

function LineRow({
  draftId,
  line,
  currency,
}: {
  draftId: string;
  line: DraftLineView;
  currency: string;
}) {
  const [state, action] = useActionState(setLineQtyAction, initial);
  const [qty, setQty] = useState(String(line.finalQty));
  const [formRef, setFormRef] = useState<HTMLFormElement | null>(null);
  const edited = line.finalQty !== line.suggestedQty;

  return (
    <form
      ref={setFormRef}
      action={action}
      className="hairline-t flex items-center gap-3 py-3"
    >
      <input type="hidden" name="draftId" value={draftId} />
      <input type="hidden" name="lineId" value={line.id} />

      <div className="min-w-0 flex-1">
        <p className="t-title truncate" style={{ fontSize: 15 }}>
          {line.title}
        </p>
        <p className="t-data mt-1" style={{ color: "var(--color-fg-3)" }}>
          {line.sku} · MOQ {line.moq} · PACK {line.packSize} ·{" "}
          {moneyExact(line.unitCostCents, currency)}
        </p>
        {edited ? (
          <p className="t-data mt-1" style={{ color: "var(--color-fg-3)" }}>
            SUGGESTED {line.suggestedQty}
          </p>
        ) : null}
        {state.note ? (
          <p className="t-data mt-1" style={{ color: "var(--color-kraft)" }} role="status">
            {state.note}
          </p>
        ) : null}
        {state.error ? (
          <p className="t-data mt-1" style={{ color: "var(--color-rust)" }} role="alert">
            {state.error}
          </p>
        ) : null}
      </div>

      <label className="shrink-0">
        <span className="sr-only">Quantity for {line.sku}</span>
        <input
          className="input input-mono text-right"
          style={{ width: 88, height: 44 }}
          name="finalQty"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onBlur={() => {
            if (String(line.finalQty) !== qty) formRef?.requestSubmit();
          }}
        />
      </label>
    </form>
  );
}
