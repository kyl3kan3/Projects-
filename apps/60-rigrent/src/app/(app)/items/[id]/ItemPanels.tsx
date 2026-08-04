"use client";

/**
 * The two panels on the item screen that submit their own forms: maintenance
 * holds and serialised units. They are client components only so the hold form
 * can echo its own values back after a rejected submit.
 */

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import type { Unit } from "@/db/schema";
import type { FormState } from "@/lib/form";
import { addDays } from "@/lib/dates";

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

export function HoldForms({
  itemId,
  holdId,
  addAction,
  removeAction,
  disabled = false,
  disabledReason,
  ownedCount,
  today,
}: {
  itemId: string;
  holdId?: string;
  addAction?: Action;
  removeAction?: Action;
  disabled?: boolean;
  disabledReason?: string;
  ownedCount?: number;
  today?: string;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  if (removeAction && holdId) {
    return (
      <ActionForm
        action={removeAction}
        submitLabel="Remove"
        variant="quiet"
        full={false}
        showMessage={false}
        disabled={disabled}
      >
        <input type="hidden" name="holdId" value={holdId} />
        <input type="hidden" name="itemId" value={itemId} />
      </ActionForm>
    );
  }

  if (!addAction) return null;

  const defaultStart = today ?? "";
  const defaultEnd = today ? addDays(today, 3) : "";

  return (
    <ActionForm
      action={addAction}
      submitLabel="Add a hold"
      variant="secondary"
      disabled={disabled}
      disabledReason={disabledReason}
      onState={(state) => {
        if (state.values) setValues(state.values);
      }}
    >
      <input type="hidden" name="itemId" value={itemId} />
      <div className="field-row">
        <label className="field">
          <span className="field-label">Units</span>
          <input
            className="input input-mono input-narrow"
            name="quantity"
            inputMode="numeric"
            required
            defaultValue={values.quantity ?? "1"}
          />
          {ownedCount ? <span className="field-help">of {ownedCount} owned</span> : null}
        </label>
        <label className="field">
          <span className="field-label">From</span>
          <input
            className="input input-mono"
            name="startsOn"
            type="date"
            required
            defaultValue={values.startsOn ?? defaultStart}
          />
        </label>
        <label className="field">
          <span className="field-label">Until</span>
          <input
            className="input input-mono"
            name="endsOn"
            type="date"
            required
            defaultValue={values.endsOn ?? defaultEnd}
          />
        </label>
      </div>
      <label className="field">
        <span className="field-label">Reason</span>
        <input
          className="input"
          name="reason"
          defaultValue={values.reason ?? ""}
          placeholder="Sidewall repair at Fabric Works"
        />
      </label>
    </ActionForm>
  );
}

export function UnitForms({
  itemId,
  units,
  addAction,
  statusAction,
  disabled,
  disabledReason,
}: {
  itemId: string;
  units: Unit[];
  addAction: Action;
  statusAction: Action;
  disabled: boolean;
  disabledReason?: string;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  return (
    <div>
      {units.length > 0 ? (
        <div className="stack" style={{ marginTop: 12 }}>
          {units.map((unit) => (
            <div key={unit.id} className="row">
              <span className="t-mono" style={{ flex: 1 }}>
                {unit.serial}
              </span>
              <span className="t-secondary">{unit.status.replace("_", " ")}</span>
              <ActionForm
                action={statusAction}
                submitLabel={unit.status === "in_service" ? "Mark maintenance" : "Back in service"}
                variant="quiet"
                full={false}
                showMessage={false}
                disabled={disabled}
              >
                <input type="hidden" name="unitId" value={unit.id} />
                <input type="hidden" name="itemId" value={itemId} />
                <input
                  type="hidden"
                  name="status"
                  value={unit.status === "in_service" ? "maintenance" : "in_service"}
                />
              </ActionForm>
            </div>
          ))}
        </div>
      ) : (
        <p className="t-secondary" style={{ marginTop: 8 }}>
          No serials recorded yet. Add the asset tags as they come off the shelf.
        </p>
      )}

      <div style={{ marginTop: 16 }}>
        <ActionForm
          action={addAction}
          submitLabel="Add a serial"
          variant="secondary"
          disabled={disabled}
          disabledReason={disabledReason}
          onState={(state) => {
            if (state.values) setValues(state.values);
          }}
        >
          <input type="hidden" name="itemId" value={itemId} />
          <label className="field">
            <span className="field-label">Serial or asset tag</span>
            <input
              className="input input-mono"
              name="serial"
              required
              defaultValue={values.serial ?? ""}
              placeholder="GEN-2200-014"
            />
          </label>
        </ActionForm>
      </div>
    </div>
  );
}
