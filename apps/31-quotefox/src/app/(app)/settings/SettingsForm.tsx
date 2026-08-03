"use client";

import { useActionState, useState } from "react";
import { IconAlert, IconCheck } from "@/components/icons";
import { updateSettingsAction, type SettingsState } from "./actions";
import type { DepositType } from "@/db/schema";

export interface SettingsDefaults {
  name: string;
  licenseNumber: string;
  insuranceLine: string;
  phone: string;
  address: string;
  defaultMarkupPct: number;
  taxRatePct: string;
  defaultDepositType: DepositType;
  defaultDepositValue: string;
  termsText: string;
}

export function SettingsForm({ defaults }: { defaults: SettingsDefaults }) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    updateSettingsAction,
    {},
  );
  const [depositType, setDepositType] = useState<DepositType>(defaults.defaultDepositType);

  return (
    <form action={formAction} style={{ display: "grid", gap: 24, paddingBottom: 24 }}>
      <section style={{ display: "grid", gap: 16 }}>
        <p className="t-label">On every proposal</p>
        <label style={{ display: "grid", gap: 8 }}>
          <span className="t-secondary">Company name</span>
          <input className="field" name="name" defaultValue={defaults.name} required />
        </label>
        <label style={{ display: "grid", gap: 8 }}>
          <span className="t-secondary">License number</span>
          <input className="field" name="licenseNumber" defaultValue={defaults.licenseNumber} />
        </label>
        <label style={{ display: "grid", gap: 8 }}>
          <span className="t-secondary">Insurance line</span>
          <input className="field" name="insuranceLine" defaultValue={defaults.insuranceLine} />
        </label>
        <label style={{ display: "grid", gap: 8 }}>
          <span className="t-secondary">Phone</span>
          <input className="field" name="phone" inputMode="tel" defaultValue={defaults.phone} />
        </label>
        <label style={{ display: "grid", gap: 8 }}>
          <span className="t-secondary">Shop address</span>
          <input className="field" name="address" defaultValue={defaults.address} />
        </label>
      </section>

      <section style={{ display: "grid", gap: 16 }}>
        <p className="t-label">Estimate defaults</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 8 }}>
            <span className="t-secondary">Markup %</span>
            <input
              className="field field-mono"
              name="defaultMarkupPct"
              inputMode="decimal"
              defaultValue={String(defaults.defaultMarkupPct)}
            />
          </label>
          <label style={{ display: "grid", gap: 8 }}>
            <span className="t-secondary">Sales tax %</span>
            <input
              className="field field-mono"
              name="taxRatePct"
              inputMode="decimal"
              defaultValue={defaults.taxRatePct}
            />
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 8 }}>
            <span className="t-secondary">Deposit</span>
            <select
              className="field"
              name="defaultDepositType"
              value={depositType}
              onChange={(event) => setDepositType(event.target.value as DepositType)}
            >
              <option value="percent">Percent of total</option>
              <option value="fixed">Fixed amount</option>
              <option value="none">No deposit</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 8 }}>
            <span className="t-secondary">{depositType === "fixed" ? "Amount" : "Percent"}</span>
            <input
              className="field field-mono"
              name="defaultDepositValue"
              inputMode="decimal"
              defaultValue={defaults.defaultDepositValue}
              disabled={depositType === "none"}
            />
          </label>
        </div>
      </section>

      <section style={{ display: "grid", gap: 8 }}>
        <p className="t-label">Terms on the proposal</p>
        <textarea className="field" name="termsText" rows={5} defaultValue={defaults.termsText} />
        <p className="t-secondary" style={{ color: "var(--color-text-3)" }}>
          Leave this blank and QuoteFox uses a plain-English default: 30-day validity, work starts on
          deposit, change orders quoted separately, balance due on completion.
        </p>
      </section>

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
      {state.saved ? (
        <p className="t-secondary" style={{ color: "var(--color-hi-vis)", display: "flex", gap: 8 }}>
          <IconCheck size={18} />
          Saved.
        </p>
      ) : null}

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
