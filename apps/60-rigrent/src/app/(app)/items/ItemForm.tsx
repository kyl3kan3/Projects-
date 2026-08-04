"use client";

/**
 * The item sheet: name, counts, rates, and the damage fee schedule that a
 * customer's contract prints and a damage claim prices from.
 *
 * The fee rows are local state so a shop can add three of them without a round
 * trip, and every text field echoes its submitted value back through
 * `defaultValue` — React 19 clears an uncontrolled form when the action returns,
 * so a rejected owned count would otherwise wipe the rates and the whole
 * schedule.
 */

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { IconPlus } from "@/components/icons";
import type { DamageFee, Item } from "@/db/schema";
import type { FormState } from "@/lib/form";
import { formatMoney } from "@/lib/money";

function moneyValue(cents: number | null | undefined): string {
  return cents === null || cents === undefined ? "" : (cents / 100).toFixed(2);
}

export function ItemForm({
  item,
  fees,
  createAction,
  updateAction,
  defaultFees,
}: {
  item: Item | null;
  fees: DamageFee[];
  createAction: (prev: FormState, form: FormData) => Promise<FormState>;
  updateAction: (prev: FormState, form: FormData) => Promise<FormState>;
  defaultFees: DamageFee[];
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<DamageFee[]>(
    fees.length ? fees : defaultFees.length ? defaultFees : [{ label: "", amountCents: 0 }],
  );

  const v = (name: string, fallback: string) => values[name] ?? fallback;

  return (
    <ActionForm
      action={item ? updateAction : createAction}
      submitLabel={item ? "Save item" : "Add to the catalogue"}
      pendingLabel="Saving…"
      onState={(state) => {
        if (state.values) setValues(state.values);
      }}
    >
      {item ? <input type="hidden" name="itemId" value={item.id} /> : null}

      <label className="field">
        <span className="field-label">Name</span>
        <input
          className="input"
          name="name"
          required
          defaultValue={v("name", item?.name ?? "")}
          placeholder="White folding chair"
        />
        <span className="field-help">What the yard calls it, not what the catalogue calls it.</span>
      </label>

      <div className="field-row">
        <label className="field">
          <span className="field-label">Category</span>
          <input
            className="input"
            name="category"
            defaultValue={v("category", item?.category ?? "")}
            placeholder="Seating"
          />
        </label>
        <label className="field">
          <span className="field-label">Owned count</span>
          <input
            className="input input-mono"
            name="ownedCount"
            inputMode="numeric"
            required
            defaultValue={v("ownedCount", String(item?.ownedCount ?? ""))}
            placeholder="200"
          />
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span className="field-label">Daily rate</span>
          <input
            className="input input-mono"
            name="dailyRate"
            inputMode="decimal"
            required
            defaultValue={v("dailyRate", moneyValue(item?.dailyRateCents))}
            placeholder="1.75"
          />
        </label>
        <label className="field">
          <span className="field-label">Weekend rate</span>
          <input
            className="input input-mono"
            name="weekendRate"
            inputMode="decimal"
            defaultValue={v("weekendRate", moneyValue(item?.weekendRateCents))}
            placeholder="2.50"
          />
          <span className="field-help">
            One flat price for a window of three days or less that touches a Saturday or Sunday.
            Leave it blank to always bill per day.
          </span>
        </label>
      </div>

      <label className="field">
        <span className="field-label">Replacement cost</span>
        <input
          className="input input-mono"
          name="replacement"
          inputMode="decimal"
          defaultValue={v("replacement", moneyValue(item?.replacementCents))}
          placeholder="24.00"
        />
        <span className="field-help">What a missing one is billed at. Printed on the contract.</span>
      </label>

      {item ? null : (
        <label className="field">
          <span className="field-label">Tracking</span>
          <select
            className="input"
            name="trackedBy"
            defaultValue={v("trackedBy", "quantity")}
            // A remount key is not needed here: this select is only rendered on
            // create, which redirects on success, and a failed create re-renders
            // with the echoed value applied at mount.
          >
            <option value="quantity">By quantity — 200 chairs are 200 chairs</option>
            <option value="serial">By serial — each unit has an asset tag</option>
          </select>
        </label>
      )}

      <fieldset style={{ border: 0, padding: 0, margin: "8px 0 0" }}>
        <legend className="field-label" style={{ padding: 0 }}>
          Damage fee schedule
        </legend>
        <p className="field-help" style={{ marginTop: 0, marginBottom: 12 }}>
          These prices are printed on the contract the customer signs, and a damage claim on this
          item is priced from them. A fee nobody agreed to is a fee nobody pays.
        </p>
        <div className="stack" style={{ gap: 8 }}>
          {rows.map((row, i) => (
            <div key={i} className="field-row" style={{ gap: 8 }}>
              <input
                className="input"
                name="feeLabel"
                defaultValue={row.label}
                placeholder="Torn seat fabric"
                aria-label={`Damage fee ${i + 1} label`}
              />
              <input
                className="input input-mono input-narrow"
                name="feeAmount"
                inputMode="decimal"
                defaultValue={row.amountCents ? (row.amountCents / 100).toFixed(2) : ""}
                placeholder="15.00"
                aria-label={`Damage fee ${i + 1} amount`}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn-quiet"
          style={{ marginTop: 12 }}
          onClick={() => setRows((r) => [...r, { label: "", amountCents: 0 }])}
        >
          <IconPlus />
          Add a fee line
        </button>
      </fieldset>

      {item && item.replacementCents ? (
        <p className="field-help">
          Missing units bill at {formatMoney(item.replacementCents)} each on top of these.
        </p>
      ) : null}
    </ActionForm>
  );
}
