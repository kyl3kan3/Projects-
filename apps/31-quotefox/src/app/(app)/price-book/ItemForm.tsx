"use client";

import { useActionState, useState, useTransition } from "react";
import { IconAlert, IconCheck, IconClose } from "@/components/icons";
import { KINDS, KIND_LABELS, UNITS, UNIT_LABELS } from "@/lib/item-fields";
import { applyMarkup, formatMoney, parseAmountToCents } from "@/lib/money";
import { archiveItemAction, type ItemFormState } from "./actions";
import type { PriceBookItemKind, Unit } from "@/db/schema";

export interface ItemDefaults {
  id?: string;
  category: string;
  name: string;
  description: string | null;
  kind: PriceBookItemKind;
  unit: Unit;
  unitCostCents: number;
  markupPct: number | null;
  source?: string;
}

/**
 * One form for both create and edit. The live "sells for" line is the point: a
 * contractor sets cost and markup, and needs to see the number the homeowner will
 * read before they save it.
 */
export function ItemForm({
  action,
  defaults,
  defaultMarkupPct,
  categories,
}: {
  action: (prev: ItemFormState, formData: FormData) => Promise<ItemFormState>;
  defaults: ItemDefaults;
  defaultMarkupPct: number;
  categories: string[];
}) {
  const [state, formAction, pending] = useActionState<ItemFormState, FormData>(action, {});
  const [cost, setCost] = useState(
    defaults.unitCostCents ? (defaults.unitCostCents / 100).toFixed(2) : "",
  );
  const [markup, setMarkup] = useState(
    defaults.markupPct === null || defaults.markupPct === undefined ? "" : String(defaults.markupPct),
  );
  const [unit, setUnit] = useState<Unit>(defaults.unit);
  const [archiving, startArchive] = useTransition();

  const costCents = parseAmountToCents(cost);
  const markupPct = markup === "" ? defaultMarkupPct : Number(markup);
  const sellsFor =
    costCents !== null && Number.isFinite(markupPct) ? applyMarkup(costCents, markupPct) : null;

  return (
    <form action={formAction} style={{ display: "grid", gap: 16, paddingBottom: 24 }}>
      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Item name</span>
        <input
          className="field"
          name="name"
          defaultValue={defaults.name}
          placeholder="Breaker, 20A AFCI"
          required
        />
      </label>

      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Category</span>
        <input
          className="field"
          name="category"
          list="category-options"
          defaultValue={defaults.category}
          placeholder="Materials"
          required
        />
        <datalist id="category-options">
          {categories.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={{ display: "grid", gap: 8 }}>
          <span className="t-label">Kind</span>
          <select className="field" name="kind" defaultValue={defaults.kind}>
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 8 }}>
          <span className="t-label">Unit</span>
          <select
            className="field"
            name="unit"
            value={unit}
            onChange={(event) => setUnit(event.target.value as Unit)}
          >
            {UNITS.map((option) => (
              <option key={option} value={option}>
                {UNIT_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={{ display: "grid", gap: 8 }}>
          <span className="t-label">Your cost</span>
          <input
            className="field field-mono"
            name="unitCost"
            inputMode="decimal"
            value={cost}
            onChange={(event) => setCost(event.target.value)}
            placeholder="68.00"
            required
          />
        </label>
        <label style={{ display: "grid", gap: 8 }}>
          <span className="t-label">Markup %</span>
          <input
            className="field field-mono"
            name="markupPct"
            inputMode="decimal"
            value={markup}
            onChange={(event) => setMarkup(event.target.value)}
            placeholder={String(defaultMarkupPct)}
          />
        </label>
      </div>

      <p className="t-secondary" style={{ color: "var(--color-text-3)" }}>
        {sellsFor !== null ? (
          <>
            Sells for{" "}
            <span className="t-data" style={{ color: "var(--color-hi-vis)", fontSize: 14 }}>
              {formatMoney(sellsFor)}
            </span>{" "}
            per {UNIT_LABELS[unit]}
            {markup === "" ? ` (your default ${defaultMarkupPct}% markup)` : ""}
          </>
        ) : (
          "Enter a cost to see what it sells for."
        )}
      </p>

      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Notes (optional)</span>
        <textarea
          className="field"
          name="description"
          rows={2}
          defaultValue={defaults.description ?? ""}
          placeholder="Includes trip charge within 20 miles"
        />
      </label>

      {defaults.source === "template" ? (
        <p className="t-secondary" style={{ color: "var(--color-amber)" }}>
          This is one of our starter numbers. Replace it with your supply-house cost the first time you
          quote it.
        </p>
      ) : null}

      {state.error ? (
        <p
          className="t-secondary"
          role="alert"
          style={{ color: "var(--color-red)", display: "flex", gap: 8 }}
        >
          <IconAlert size={18} />
          <span>{state.error}</span>
        </p>
      ) : null}

      {defaults.id ? (
        <button
          className="btn btn-danger"
          type="button"
          disabled={archiving}
          onClick={() =>
            startArchive(async () => void (await archiveItemAction(defaults.id as string)))
          }
        >
          <IconClose size={18} />
          {archiving ? "Archiving…" : "Archive this item"}
        </button>
      ) : null}

      <div className="thumb-bar">
        <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
          <IconCheck size={18} />
          {pending ? "Saving…" : defaults.id ? "Save item" : "Add to price book"}
        </button>
      </div>
    </form>
  );
}
