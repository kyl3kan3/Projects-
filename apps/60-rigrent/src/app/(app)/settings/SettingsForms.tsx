"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { IconPlus } from "@/components/icons";
import type { DamageFee } from "@/db/schema";
import type { FormState } from "@/lib/form";
import { useResetKey } from "@/lib/reset-key";
import type { AccountSettings } from "@/lib/settings";

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

export function SettingsForm({
  action,
  yardName,
  timezone,
  settings,
  disabled,
  disabledReason,
}: {
  action: Action;
  yardName: string;
  timezone: string;
  settings: AccountSettings;
  disabled: boolean;
  disabledReason?: string;
}) {
  const [state, setState] = useState<FormState>({});
  const key = useResetKey(state);
  const values = state.values ?? {};
  const [rows, setRows] = useState<DamageFee[]>(
    settings.damageFeeDefaults.length
      ? settings.damageFeeDefaults
      : [{ label: "", amountCents: 0 }],
  );
  const v = (name: string, fallback: string) => values[name] ?? fallback;

  return (
    <ActionForm
      action={action}
      submitLabel="Save settings"
      disabled={disabled}
      disabledReason={disabledReason}
      onState={setState}
    >
      <label className="field">
        <span className="field-label">Yard name</span>
        <input className="input" name="yardName" defaultValue={v("yardName", yardName)} />
        <span className="field-help">Printed at the top of every contract and run sheet.</span>
      </label>

      <label className="field">
        <span className="field-label">Timezone</span>
        <select
          key={`tz-${key}`}
          className="input"
          name="timezone"
          defaultValue={v("timezone", timezone)}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace("_", " ")}
            </option>
          ))}
        </select>
        <span className="field-help">
          Decides which day &ldquo;today&rdquo; is on the dashboard and the returns queue.
        </span>
      </label>

      <div className="field-row">
        <label className="field">
          <span className="field-label">Deposit %</span>
          <input
            className="input input-mono input-narrow"
            name="depositPercent"
            inputMode="decimal"
            defaultValue={v("depositPercent", (settings.depositPercentBps / 100).toString())}
          />
          <span className="field-help">of the rental subtotal</span>
        </label>
        <label className="field">
          <span className="field-label">Deposit floor</span>
          <input
            className="input input-mono input-narrow"
            name="depositMinimum"
            inputMode="decimal"
            defaultValue={v("depositMinimum", (settings.depositMinimumCents / 100).toFixed(2))}
          />
          <span className="field-help">so a small order still carries one</span>
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span className="field-label">Sales tax %</span>
          <input
            className="input input-mono input-narrow"
            name="taxRate"
            inputMode="decimal"
            defaultValue={v("taxRate", (settings.taxRateBps / 100).toString())}
          />
          <span className="field-help">skipped for tax-exempt customers</span>
        </label>
        <label className="field">
          <span className="field-label">Delivery fee</span>
          <input
            className="input input-mono input-narrow"
            name="deliveryFee"
            inputMode="decimal"
            defaultValue={v("deliveryFee", (settings.deliveryFeeCents / 100).toFixed(2))}
          />
          <span className="field-help">added to a delivery order</span>
        </label>
      </div>

      <fieldset style={{ border: 0, padding: 0, margin: "8px 0 16px" }}>
        <legend className="field-label" style={{ padding: 0 }}>
          Default damage fees
        </legend>
        <p className="field-help" style={{ marginTop: 0, marginBottom: 12 }}>
          Offered on every new item before its own schedule. A claim can only be priced from a fee
          the customer signed.
        </p>
        <div className="stack" style={{ gap: 8 }}>
          {rows.map((row, i) => (
            <div key={i} className="field-row" style={{ gap: 8 }}>
              <input
                className="input"
                name="feeLabel"
                defaultValue={row.label}
                placeholder="Cleaning — returned muddy"
                aria-label={`Default fee ${i + 1} label`}
              />
              <input
                className="input input-mono input-narrow"
                name="feeAmount"
                inputMode="decimal"
                defaultValue={row.amountCents ? (row.amountCents / 100).toFixed(2) : ""}
                placeholder="45.00"
                aria-label={`Default fee ${i + 1} amount`}
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
          Add a default fee
        </button>
      </fieldset>

      <label className="field">
        <span className="field-label">Rental terms</span>
        <textarea
          className="input"
          name="terms"
          style={{ minHeight: 200 }}
          defaultValue={v("terms", settings.terms)}
        />
      </label>

      <label className="field">
        <span className="field-label">Condition and damage clause</span>
        <textarea
          className="input"
          name="damageClause"
          style={{ minHeight: 160 }}
          defaultValue={v("damageClause", settings.damageClause)}
        />
        <span className="field-help">
          The customer initials this separately from the signature, and the initials are recorded on
          the contract.
        </span>
      </label>
    </ActionForm>
  );
}

export function AddUserForm({
  action,
  disabled,
  disabledReason,
}: {
  action: Action;
  disabled: boolean;
  disabledReason?: string;
}) {
  const [state, setState] = useState<FormState>({});
  const key = useResetKey(state);
  const values = state.values ?? {};

  return (
    <ActionForm
      action={action}
      submitLabel="Add teammate"
      variant="secondary"
      disabled={disabled}
      disabledReason={disabledReason}
      onState={setState}
    >
      <div className="field-row">
        <label className="field">
          <span className="field-label">Name</span>
          <input className="input" name="name" required defaultValue={values.name ?? ""} />
        </label>
        <label className="field">
          <span className="field-label">Role</span>
          <select
            key={`role-${key}`}
            className="input"
            name="role"
            defaultValue={values.role ?? "staff"}
          >
            <option value="staff">Staff — quotes, inventory, returns</option>
            <option value="driver">Driver — run sheets and check-off</option>
            <option value="owner">Owner — everything, including billing</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field-label">Email</span>
        <input
          className="input"
          name="email"
          type="email"
          required
          defaultValue={values.email ?? ""}
        />
      </label>
      <label className="field">
        <span className="field-label">Temporary password</span>
        <input className="input" name="password" type="password" required minLength={8} />
        <span className="field-help">At least 8 characters. They can change it later.</span>
      </label>
    </ActionForm>
  );
}
