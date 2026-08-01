"use client";

import { useActionState } from "react";
import type { ShopSettings } from "@/db/schema";
import {
  saveSettingsAction,
  sendDigestNowAction,
  signOutAction,
  type SettingsState,
} from "./actions";

/** Here rather than in actions.ts: a `"use server"` module exports functions only. */
export const emptySettingsState: SettingsState = { error: null, note: null };

function Feedback({ state }: { state: SettingsState }) {
  return (
    <>
      {state.note ? (
        <p className="t-secondary mt-2" role="status">
          {state.note}
        </p>
      ) : null}
      {state.error ? (
        <p className="t-secondary mt-2" style={{ color: "var(--color-rust)" }} role="alert">
          {state.error}
        </p>
      ) : null}
    </>
  );
}

const WEEKDAYS = [
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
  [6, "Saturday"],
  [7, "Sunday"],
] as const;

export function SettingsForm({ settings }: { settings: ShopSettings }) {
  const [state, action, pending] = useActionState(saveSettingsAction, emptySettingsState);

  return (
    <form action={action} className="flex flex-col gap-4">
      <NumberField
        name="safetyDays"
        label="Safety days"
        hint="Buffer beyond the lead time that the reorder point has to cover."
        defaultValue={settings.safetyDays}
        min={0}
        max={120}
      />
      <NumberField
        name="defaultLeadTimeDays"
        label="Default lead time (days)"
        hint="Used for any SKU with no supplier assigned."
        defaultValue={settings.defaultLeadTimeDays}
        min={1}
        max={365}
      />
      <NumberField
        name="coverTargetDays"
        label="Cover target (days)"
        hint="How much cover a suggested PO quantity buys, on top of lead time and safety."
        defaultValue={settings.coverTargetDays}
        min={7}
        max={365}
      />
      <NumberField
        name="orderSoonDays"
        label="“Order this week” window (days)"
        hint="An order-by date inside this window moves the SKU to Order this week."
        defaultValue={settings.orderSoonDays}
        min={1}
        max={60}
      />
      <NumberField
        name="overstockCoverDays"
        label="Overstock threshold (days of cover)"
        hint="Still selling, but holding more than it needs."
        defaultValue={settings.overstockCoverDays}
        min={14}
        max={730}
      />
      <NumberField
        name="deadCoverDays"
        label="Dead-stock threshold (days of cover)"
        hint="Beyond this, and not accelerating, a SKU is treated as dead stock."
        defaultValue={settings.deadCoverDays}
        min={30}
        max={1095}
      />
      <NumberField
        name="riskHorizonDays"
        label="Revenue-at-risk horizon (days)"
        hint="The window the headline figure covers."
        defaultValue={settings.riskHorizonDays}
        min={7}
        max={180}
      />

      <label className="block">
        <span className="t-label">Weekly digest day</span>
        <select className="input mt-2" name="digestWeekday" defaultValue={settings.digestWeekday}>
          {WEEKDAYS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="hairline-t flex items-center justify-between gap-4 py-3">
        <span>
          <span className="t-title" style={{ fontSize: 15 }}>
            Weekly reorder summary
          </span>
          <span className="t-secondary block">
            What is at risk, what to order, and by when.
          </span>
        </span>
        <input
          type="checkbox"
          name="weeklyDigestEnabled"
          defaultChecked={settings.weeklyDigestEnabled}
          style={{ width: 22, height: 22, accentColor: "var(--color-kraft)" }}
        />
      </label>

      <label className="hairline-t flex items-center justify-between gap-4 py-3">
        <span>
          <span className="t-title" style={{ fontSize: 15 }}>
            Monthly dead-stock report
          </span>
          <span className="t-secondary block">Cash sitting on the shelf, ranked.</span>
        </span>
        <input
          type="checkbox"
          name="monthlyDeadStockEnabled"
          defaultChecked={settings.monthlyDeadStockEnabled}
          style={{ width: 22, height: 22, accentColor: "var(--color-kraft)" }}
        />
      </label>

      <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

function NumberField({
  name,
  label,
  hint,
  defaultValue,
  min,
  max,
}: {
  name: string;
  label: string;
  hint: string;
  defaultValue: number;
  min: number;
  max: number;
}) {
  return (
    <label className="block">
      <span className="t-label">{label}</span>
      <input
        className="input input-mono mt-2"
        name={name}
        type="number"
        min={min}
        max={max}
        defaultValue={defaultValue}
      />
      <span className="t-secondary mt-1 block">{hint}</span>
    </label>
  );
}

export function SendDigestButton({ kind, label }: { kind: string; label: string }) {
  const [state, action, pending] = useActionState(sendDigestNowAction, emptySettingsState);
  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="kind" value={kind} />
      <button type="submit" className="btn-quiet" disabled={pending}>
        {pending ? "Preparing…" : label}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button type="submit" className="btn btn-secondary btn-full">
        Sign out
      </button>
    </form>
  );
}
