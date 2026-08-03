"use client";

import { ActionForm } from "@/components/ActionForm";
import { addUnitRowAction } from "@/app/(console)/actions";
import { UNIT_SIZES } from "@/lib/unit-shapes";

/**
 * The map editor, as one form: a row letter, how many doors, the size, the street
 * rate. Drawing a 160-unit yard is six of these, which is the ten minutes the
 * empty state promises.
 */
export function AddRowForm({
  facilityId,
  nextRow,
  suggestedPrefix,
}: {
  facilityId: string;
  nextRow: number;
  suggestedPrefix: string;
}) {
  return (
    <ActionForm action={addUnitRowAction} submitLabel="Add the row">
      <input type="hidden" name="facilityId" value={facilityId} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Row letter</span>
          <input
            className="input input-mono"
            name="prefix"
            defaultValue={suggestedPrefix}
            maxLength={3}
            required
          />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Row number</span>
          <input
            className="input input-mono"
            name="row"
            type="number"
            min={1}
            max={40}
            defaultValue={nextRow}
            required
          />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">How many doors</span>
          <input
            className="input input-mono"
            name="count"
            type="number"
            min={1}
            max={60}
            defaultValue={12}
            required
          />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">First number</span>
          <input
            className="input input-mono"
            name="startAt"
            type="number"
            min={1}
            defaultValue={1}
            required
          />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Size</span>
          <select className="input" name="size" defaultValue="10x10" required>
            {UNIT_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Street rate</span>
          <input
            className="input input-mono"
            name="rate"
            inputMode="decimal"
            placeholder="129"
            required
          />
        </label>
      </div>
      <p className="field-help">
        Labels come out as {suggestedPrefix}-01, {suggestedPrefix}-02 and so on. The street rate is
        what a new move-in is quoted; a signed tenancy keeps its own rate.
      </p>
    </ActionForm>
  );
}
