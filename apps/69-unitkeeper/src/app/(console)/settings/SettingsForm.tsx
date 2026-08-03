"use client";

import { ActionForm } from "@/components/ActionForm";
import { saveSettingsAction } from "@/app/(console)/actions";
import type { OwnerSettings } from "@/db/schema";

/**
 * The late ladder, editable. Four rungs, each with a day, and the fee for the one
 * rung that has one. Presented as a sentence per row rather than a JSON editor,
 * because this is the setting with legal consequences.
 */
export function SettingsForm({ settings }: { settings: OwnerSettings }) {
  const dayOf = (action: string) =>
    settings.lateLadder.find((s) => s.action === action)?.day ?? "";
  const feeCents = settings.lateLadder.find((s) => s.action === "late_fee")?.feeCents ?? 0;

  return (
    <ActionForm action={saveSettingsAction} submitLabel="Save settings">
      <label className="field">
        <span className="field-label">Legal name on leases and notices</span>
        <input className="input" name="legalName" defaultValue={settings.legalName} />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Rent due day</span>
          <input
            className="input input-mono"
            name="rentDueDay"
            type="number"
            min={1}
            max={28}
            defaultValue={settings.rentDueDay}
          />
          <span className="field-help">1–28, so it exists in February.</span>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Prorate rule</span>
          <select className="input" name="prorateRule" defaultValue={settings.prorateRule}>
            <option value="daily">Daily — first and last month prorated</option>
            <option value="full_month">Full month — no proration either end</option>
          </select>
        </label>
      </div>

      <fieldset style={{ border: 0, padding: 0, margin: "8px 0 0" }}>
        <legend className="field-label">The late ladder</legend>
        <p className="field-help" style={{ marginTop: 0, marginBottom: 12 }}>
          Days are counted from the day the tenant went late. Each rung fires exactly once per
          delinquency, and paying in full reverses all of them.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 12, alignItems: "end" }}>
          <span className="t-body">Retry the payment method on day</span>
          <input className="input input-mono" name="day_retry" type="number" min={0} max={365} defaultValue={dayOf("retry")} />

          <span className="t-body">Post a late fee on day</span>
          <input className="input input-mono" name="day_late_fee" type="number" min={0} max={365} defaultValue={dayOf("late_fee")} />

          <span className="t-body">Late fee amount</span>
          <input
            className="input input-mono"
            name="fee_late_fee"
            inputMode="decimal"
            defaultValue={(feeCents / 100).toFixed(2)}
          />

          <span className="t-body">Overlock the unit on day</span>
          <input className="input input-mono" name="day_overlock" type="number" min={0} max={365} defaultValue={dayOf("overlock")} />

          <span className="t-body">Flag as lien-eligible on day</span>
          <input
            className="input input-mono"
            name="day_lien_eligible"
            type="number"
            min={0}
            max={365}
            defaultValue={dayOf("lien_eligible")}
          />
        </div>
        <p className="field-help">
          Lien-eligible only <em>flags</em> the account on the delinquency board. Opening a case is
          always your decision.
        </p>
      </fieldset>

      <label className="field" style={{ marginTop: 16 }}>
        <span className="field-label">Facility rules printed on the lease</span>
        <textarea className="input" name="facilityTerms" rows={6} defaultValue={settings.facilityTerms} />
      </label>
    </ActionForm>
  );
}
