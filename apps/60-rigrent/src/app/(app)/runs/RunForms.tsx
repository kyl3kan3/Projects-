"use client";

/**
 * The run forms: create a run, assign a truck and driver, and add stops.
 *
 * Every `<select>` carries a remount key. React 19 resets an uncontrolled form
 * when the action returns and `defaultValue` on a select is applied at mount, so
 * without the key a rejected date would silently re-pick "delivery" and the shop
 * would plan a pickup run that collects nothing.
 */

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import type { FormState } from "@/lib/form";
import { useResetKey } from "@/lib/reset-key";

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

export function NewRunForm({
  action,
  drivers,
  defaultRunOn,
  disabled,
  disabledReason,
}: {
  action: Action;
  drivers: Array<{ id: string; name: string; role: string }>;
  defaultRunOn: string;
  disabled: boolean;
  disabledReason?: string;
}) {
  const [state, setState] = useState<FormState>({});
  const key = useResetKey(state);
  const values = state.values ?? {};

  return (
    <ActionForm
      action={action}
      submitLabel="Plan the run"
      variant="secondary"
      disabled={disabled}
      disabledReason={disabledReason}
      onState={setState}
    >
      <div className="field-row">
        <label className="field">
          <span className="field-label">Kind</span>
          <select
            key={`kind-${key}`}
            className="input"
            name="kind"
            defaultValue={values.kind ?? "delivery"}
          >
            <option value="delivery">Delivery — gear leaves the yard</option>
            <option value="pickup">Pickup — gear comes back</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Date</span>
          <input
            className="input input-mono"
            name="runOn"
            type="date"
            required
            defaultValue={values.runOn ?? defaultRunOn}
          />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span className="field-label">Truck</span>
          <input
            className="input"
            name="truckLabel"
            defaultValue={values.truckLabel ?? ""}
            placeholder="Truck 2 — 16ft box"
          />
        </label>
        <label className="field">
          <span className="field-label">Driver</span>
          <select
            key={`driver-${key}`}
            className="input"
            name="driverUserId"
            defaultValue={values.driverUserId ?? ""}
          >
            <option value="">Unassigned</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.role})
              </option>
            ))}
          </select>
        </label>
      </div>
    </ActionForm>
  );
}

export function AssignRunForm({
  runId,
  action,
  drivers,
  driverUserId,
  truckLabel,
  disabled,
}: {
  runId: string;
  action: Action;
  drivers: Array<{ id: string; name: string; role: string }>;
  driverUserId: string | null;
  truckLabel: string | null;
  disabled: boolean;
}) {
  const [state, setState] = useState<FormState>({});
  const key = useResetKey(state);
  const values = state.values ?? {};

  return (
    <ActionForm
      action={action}
      submitLabel="Save the assignment"
      variant="secondary"
      disabled={disabled}
      onState={setState}
    >
      <input type="hidden" name="runId" value={runId} />
      <div className="field-row">
        <label className="field">
          <span className="field-label">Truck</span>
          <input
            className="input"
            name="truckLabel"
            defaultValue={values.truckLabel ?? truckLabel ?? ""}
            placeholder="Truck 2 — 16ft box"
          />
        </label>
        <label className="field">
          <span className="field-label">Driver</span>
          <select
            key={`driver-${key}`}
            className="input"
            name="driverUserId"
            defaultValue={values.driverUserId ?? driverUserId ?? ""}
          >
            <option value="">Unassigned</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.role})
              </option>
            ))}
          </select>
        </label>
      </div>
    </ActionForm>
  );
}

export function AddStopForm({
  runId,
  candidates,
  action,
  disabled,
}: {
  runId: string;
  candidates: Array<{ id: string; number: number; customerName: string }>;
  action: Action;
  disabled: boolean;
}) {
  const [state, setState] = useState<FormState>({});
  const key = useResetKey(state);
  const values = state.values ?? {};

  if (candidates.length === 0) {
    return (
      <p className="t-secondary" style={{ marginTop: 8 }}>
        No unassigned orders for this date and kind. A delivery run takes confirmed orders going out
        that day; a pickup run takes orders on the road due back that day.
      </p>
    );
  }

  return (
    <ActionForm
      action={action}
      submitLabel="Add the stop"
      variant="secondary"
      disabled={disabled}
      onState={setState}
    >
      <input type="hidden" name="runId" value={runId} />
      <label className="field">
        <span className="field-label">Order</span>
        <select
          key={`order-${key}`}
          className="input"
          name="orderId"
          defaultValue={values.orderId ?? candidates[0].id}
        >
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.number} — {c.customerName}
            </option>
          ))}
        </select>
      </label>
    </ActionForm>
  );
}
