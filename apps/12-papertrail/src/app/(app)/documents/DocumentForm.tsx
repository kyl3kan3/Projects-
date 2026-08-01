"use client";

/**
 * The proposal builder: blocks in, priced lines out.
 *
 * Phone-first. Every row is a stack of full-width fields rather than a table,
 * because a pricing table on a 390px screen is a spreadsheet nobody can tap.
 * The running total sits in the thumb zone above the primary action, so the
 * number you are about to ask a stranger for is never off-screen.
 */

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import {
  CURRENCY_CODES,
  DEPOSIT_CHOICES,
  NET_TERMS,
  describeFormTotal,
  type DocFormClause,
  type DocFormLine,
  type DocFormValues,
} from "@/lib/doc-form";
import { IconPlus, IconTrash } from "@/components/icons";
import type { ActionState } from "./actions";

interface ClientOption {
  id: string;
  name: string;
  email: string;
  company: string | null;
}

function newLine(): DocFormLine {
  return {
    id: `line-${Math.random().toString(36).slice(2, 10)}`,
    description: "",
    quantity: "1",
    unitAmount: "",
    optional: false,
    taxable: true,
  };
}

export function DocumentForm({
  initial,
  clients,
  action,
  documentId,
  submitLabel,
  templates,
  activeTemplateId,
}: {
  initial: DocFormValues;
  clients: ClientOption[];
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  documentId?: string;
  submitLabel: string;
  templates?: { id: string; name: string; summary: string }[];
  activeTemplateId?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [values, setValues] = useState<DocFormValues>(initial);

  const total = useMemo(
    () => describeFormTotal(values.lines, values.currency, values.taxPercent),
    [values.lines, values.currency, values.taxPercent],
  );

  function set<K extends keyof DocFormValues>(key: K, value: DocFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function setLine(index: number, patch: Partial<DocFormLine>) {
    setValues((v) => ({
      ...v,
      lines: v.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));
  }

  function setClause(index: number, patch: Partial<DocFormClause>) {
    setValues((v) => ({
      ...v,
      clauses: v.clauses.map((clause, i) => (i === index ? { ...clause, ...patch } : clause)),
    }));
  }

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <input type="hidden" name="payload" value={JSON.stringify(values)} />
      {documentId ? <input type="hidden" name="documentId" value={documentId} /> : null}

      {templates?.length ? (
        <section>
          <h2 className="t-label">Start from</h2>
          <div className="scroll-x mt-3 flex gap-2">
            {templates.map((t) => (
              <Link
                key={t.id}
                href={`/documents/new?template=${t.id}`}
                className="chip"
                data-active={t.id === activeTemplateId}
                scroll={false}
              >
                {t.name}
              </Link>
            ))}
            <Link href="/documents/new?template=blank" className="chip" data-active={activeTemplateId === "blank"}>
              Blank
            </Link>
          </div>
          <p className="t-secondary mt-2">
            {templates.find((t) => t.id === activeTemplateId)?.summary ??
              "A clean sheet: one priced line and a scope paragraph."}
          </p>
        </section>
      ) : null}

      {/* --- who it's for -------------------------------------------------- */}
      <section className="flex flex-col gap-4">
        <h2 className="t-label">Client</h2>
        {clients.length ? (
          <label className="flex flex-col gap-2">
            <span className="t-secondary">Existing client</span>
            <select
              className="input"
              value={values.clientId ?? ""}
              onChange={(e) => {
                const chosen = clients.find((c) => c.id === e.target.value);
                setValues((v) => ({
                  ...v,
                  clientId: chosen?.id ?? null,
                  clientName: chosen?.name ?? "",
                  clientEmail: chosen?.email ?? "",
                  clientCompany: chosen?.company ?? "",
                }));
              }}
            >
              <option value="">Someone new</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company ? `${c.company} — ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="flex flex-col gap-2">
          <span className="t-secondary">Contact name</span>
          <input
            className="input"
            value={values.clientName}
            onChange={(e) => set("clientName", e.target.value)}
            placeholder="Rosa Álvarez"
            required
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-secondary">Email</span>
          <input
            className="input"
            type="email"
            value={values.clientEmail}
            onChange={(e) => set("clientEmail", e.target.value)}
            placeholder="rosa@meridiancoffee.example"
            required
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-secondary">Company (optional)</span>
          <input
            className="input"
            value={values.clientCompany}
            onChange={(e) => set("clientCompany", e.target.value)}
            placeholder="Meridian Coffee"
          />
        </label>
      </section>

      {/* --- the document -------------------------------------------------- */}
      <section className="flex flex-col gap-4">
        <h2 className="t-label">Document</h2>
        <label className="flex flex-col gap-2">
          <span className="t-secondary">Title</span>
          <input
            className="input"
            value={values.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Website redesign — Meridian Coffee"
            required
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-secondary">Section heading</span>
          <input
            className="input"
            value={values.headline}
            onChange={(e) => set("headline", e.target.value)}
            placeholder="What we're building"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-secondary">Scope</span>
          <textarea
            className="input"
            rows={7}
            value={values.scope}
            onChange={(e) => set("scope", e.target.value)}
            placeholder="What you'll deliver, in plain language — and what is explicitly not included."
          />
        </label>
      </section>

      {/* --- pricing ------------------------------------------------------- */}
      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="t-label">Pricing</h2>
          <span className="t-secondary">Tick “add-on” to let the client choose</span>
        </div>

        {values.lines.map((line, i) => (
          <div key={line.id} className="hairline-b flex flex-col gap-3 pb-4">
            <input
              className="input"
              value={line.description}
              onChange={(e) => setLine(i, { description: e.target.value })}
              placeholder="Design — five pages, mobile and desktop"
            />
            <div className="flex gap-3">
              <label className="flex w-[92px] flex-col gap-1">
                <span className="t-label">Qty</span>
                <input
                  className="input input-money"
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(e) => setLine(i, { quantity: e.target.value })}
                />
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="t-label">Unit price</span>
                <input
                  className="input input-money"
                  inputMode="decimal"
                  value={line.unitAmount}
                  onChange={(e) => setLine(i, { unitAmount: e.target.value })}
                  placeholder="1800"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                className="chip"
                data-active={line.optional}
                aria-pressed={line.optional}
                onClick={() => setLine(i, { optional: !line.optional })}
              >
                Add-on
              </button>
              <button
                type="button"
                className="chip"
                data-active={line.taxable}
                aria-pressed={line.taxable}
                onClick={() => setLine(i, { taxable: !line.taxable })}
              >
                Taxable
              </button>
              {values.lines.length > 1 ? (
                <button
                  type="button"
                  className="btn-quiet btn-danger ml-auto flex items-center gap-1"
                  onClick={() =>
                    setValues((v) => ({ ...v, lines: v.lines.filter((_, j) => j !== i) }))
                  }
                >
                  <IconTrash size={16} />
                  Remove
                </button>
              ) : null}
            </div>
          </div>
        ))}

        <button
          type="button"
          className="btn-quiet flex items-center gap-2"
          onClick={() => setValues((v) => ({ ...v, lines: [...v.lines, newLine()] }))}
        >
          <IconPlus size={16} />
          Add a line
        </button>

        <div className="flex gap-3">
          <label className="flex w-[110px] flex-col gap-1">
            <span className="t-label">Currency</span>
            <select
              className="input"
              value={values.currency}
              onChange={(e) => set("currency", e.target.value)}
            >
              {CURRENCY_CODES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <label className="flex w-[92px] flex-col gap-1">
            <span className="t-label">Tax %</span>
            <input
              className="input input-money"
              inputMode="decimal"
              value={values.taxPercent}
              onChange={(e) => set("taxPercent", e.target.value)}
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="t-label">Tax label</span>
            <input
              className="input"
              value={values.taxLabel}
              onChange={(e) => set("taxLabel", e.target.value)}
              placeholder="VAT"
            />
          </label>
        </div>
      </section>

      {/* --- chain settings ------------------------------------------------ */}
      <section className="flex flex-col gap-4">
        <h2 className="t-label">On signature</h2>
        <div>
          <span className="t-secondary">Deposit invoiced when the contract is signed</span>
          <div className="scroll-x mt-2 flex gap-2">
            {DEPOSIT_CHOICES.map((pct) => (
              <button
                key={pct}
                type="button"
                className="chip"
                data-active={String(pct) === values.depositPercent}
                onClick={() => set("depositPercent", String(pct))}
              >
                {pct === 0 ? "No deposit" : `${pct}%`}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="t-secondary">Payment terms on the final invoice</span>
          <div className="scroll-x mt-2 flex gap-2">
            {NET_TERMS.map((days) => (
              <button
                key={days}
                type="button"
                className="chip"
                data-active={String(days) === values.netDays}
                onClick={() => set("netDays", String(days))}
              >
                {days === 0 ? "On receipt" : `Net ${days}`}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* --- terms --------------------------------------------------------- */}
      <section className="flex flex-col gap-4">
        <h2 className="t-label">Terms in the proposal</h2>
        <p className="t-secondary">
          The contract adds the standard clauses — fees, ownership, late payment, cancellation —
          generated from the figures above. Anything you add here is specific to this job.
        </p>
        {values.clauses.map((clause, i) => (
          <div key={`clause-${i}`} className="hairline-b flex flex-col gap-3 pb-4">
            <input
              className="input"
              value={clause.heading}
              onChange={(e) => setClause(i, { heading: e.target.value })}
              placeholder="Schedule"
            />
            <textarea
              className="input"
              rows={3}
              value={clause.body}
              onChange={(e) => setClause(i, { body: e.target.value })}
              placeholder="Four weeks from deposit to launch, assuming feedback within three working days."
            />
            <button
              type="button"
              className="btn-quiet btn-danger self-start"
              onClick={() =>
                setValues((v) => ({ ...v, clauses: v.clauses.filter((_, j) => j !== i) }))
              }
            >
              Remove clause
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn-quiet flex items-center gap-2"
          onClick={() =>
            setValues((v) => ({ ...v, clauses: [...v.clauses, { heading: "", body: "" }] }))
          }
        >
          <IconPlus size={16} />
          Add a clause
        </button>
      </section>

      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-vermilion)" }} role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="hairline-t flex items-center justify-between gap-4 pt-4">
        <div>
          <span className="t-label">Total</span>
          <div className="t-money mt-1" style={{ fontSize: 18 }}>
            {total}
          </div>
        </div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
