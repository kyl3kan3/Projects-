"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { addUnitAction } from "@/app/(app)/actions";

/**
 * One form for both cases: a brand-new property, or another unit in a building
 * that is already on file. The state field is a plain text input rather than a
 * dropdown of fifty — the guardrail list only covers some states, and pretending
 * otherwise with a picker would imply coverage we do not have.
 */
export function NewUnitForm({
  properties,
  states,
}: {
  properties: { id: string; label: string }[];
  states: string[];
}) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "new");
  const isNew = propertyId === "new";

  return (
    <ActionForm action={addUnitAction} submitLabel="Add the unit" pendingLabel="Adding…">
      {properties.length > 0 ? (
        <label className="field">
          <span className="t-label">Property</span>
          <select className="input" name="propertyId" value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value="new">A different property…</option>
          </select>
        </label>
      ) : (
        <input type="hidden" name="propertyId" value="new" />
      )}

      {isNew ? (
        <>
          <label className="field">
            <span className="t-label">Street address</span>
            <input className="input" name="address" required placeholder="114 Maple Street" autoComplete="off" />
          </label>
          <div className="flex gap-3">
            <label className="field flex-1">
              <span className="t-label">City</span>
              <input className="input" name="city" required placeholder="Dayton" />
            </label>
            <label className="field w-[110px]">
              <span className="t-label">State</span>
              <input
                className="input input-mono"
                name="state"
                required
                maxLength={2}
                placeholder="OH"
                style={{ textTransform: "uppercase" }}
              />
            </label>
            <label className="field w-[120px]">
              <span className="t-label">ZIP</span>
              <input className="input input-mono" name="postalCode" placeholder="45402" inputMode="numeric" />
            </label>
          </div>
          <p className="t-secondary">
            Late-fee guidance is on file for {states.join(", ")}. Any other state works fine — you just will not see a
            limit reminder when you set a fee.
          </p>
          <label className="field">
            <span className="t-label">Building</span>
            <select className="input" name="type" defaultValue="single">
              <option value="single">One home on the lot</option>
              <option value="multi">More than one unit</option>
            </select>
          </label>
        </>
      ) : null}

      <label className="field">
        <span className="t-label">Unit label</span>
        <input className="input input-mono" name="label" required placeholder="2B" maxLength={40} />
      </label>

      <div className="flex gap-3">
        <label className="field flex-1">
          <span className="t-label">Beds</span>
          <input className="input input-mono" name="beds" type="number" min={0} max={12} defaultValue={2} />
        </label>
        <label className="field flex-1">
          <span className="t-label">Baths</span>
          <input className="input input-mono" name="baths" type="number" min={0} max={12} defaultValue={1} />
        </label>
        <label className="field flex-1">
          <span className="t-label">Sq ft</span>
          <input className="input input-mono" name="sqft" type="number" min={0} placeholder="890" />
        </label>
      </div>

      <div className="flex gap-3">
        <label className="field flex-1">
          <span className="t-label">Monthly rent</span>
          <input className="input input-mono" name="rent" required placeholder="1850" inputMode="decimal" />
        </label>
        <label className="field flex-1">
          <span className="t-label">Deposit</span>
          <input className="input input-mono" name="deposit" placeholder="1850" inputMode="decimal" />
        </label>
      </div>
      <p className="t-secondary">Type amounts however you like: 1850, 1,850 or $1850.00 all work.</p>
    </ActionForm>
  );
}
