"use client";

/**
 * The forms on the order screen. Client components only so they can echo
 * submitted values back after a rejection — React 19 clears an uncontrolled form
 * when a server action returns, error or not.
 */

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import type { Item } from "@/db/schema";
import type { FormState } from "@/lib/form";
import { useResetKey } from "@/lib/reset-key";

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

export function WindowForm({
  orderId,
  outOn,
  dueBackOn,
  delivery,
  address,
  action,
  disabled,
}: {
  orderId: string;
  outOn: string;
  dueBackOn: string;
  delivery: boolean;
  address: string | null;
  action: Action;
  disabled: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  return (
    <ActionForm
      action={action}
      submitLabel="Update the window"
      variant="secondary"
      disabled={disabled}
      onState={(state) => {
        if (state.values) setValues(state.values);
      }}
    >
      <input type="hidden" name="orderId" value={orderId} />
      <div className="field-row">
        <label className="field">
          <span className="field-label">Out on</span>
          <input
            className="input input-mono"
            name="outOn"
            type="date"
            required
            defaultValue={values.outOn ?? outOn}
          />
        </label>
        <label className="field">
          <span className="field-label">Due back on</span>
          <input
            className="input input-mono"
            name="dueBackOn"
            type="date"
            required
            defaultValue={values.dueBackOn ?? dueBackOn}
          />
        </label>
      </div>
      <label className="checkline">
        <input
          type="checkbox"
          name="delivery"
          defaultChecked={values.delivery ? values.delivery === "on" : delivery}
        />
        <span className="t-body">We are delivering it</span>
      </label>
      <label className="field">
        <span className="field-label">Site address</span>
        <textarea
          className="input"
          name="address"
          defaultValue={values.address ?? address ?? ""}
        />
      </label>
      <p className="field-help" style={{ marginTop: -8 }}>
        Changing the window re-prices every line — a Friday-to-Monday weekend is a different price
        from three weekdays.
      </p>
    </ActionForm>
  );
}

export function AddLineForm({
  orderId,
  items,
  action,
  disabled,
}: {
  orderId: string;
  items: Array<Pick<Item, "id" | "name" | "category" | "ownedCount">>;
  action: Action;
  disabled: boolean;
}) {
  const [state, setState] = useState<FormState>({});
  const selectKey = useResetKey(state);
  const values = state.values ?? {};

  return (
    <ActionForm
      action={action}
      submitLabel="Add to the quote"
      variant="secondary"
      disabled={disabled}
      onState={setState}
    >
      <input type="hidden" name="orderId" value={orderId} />
      <div className="field-row">
        <label className="field" style={{ flex: "2 1 200px" }}>
          <span className="field-label">Item</span>
          <select
            key={`item-${selectKey}`}
            className="input"
            name="itemId"
            defaultValue={values.itemId ?? items[0]?.id ?? ""}
          >
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.ownedCount} owned)
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex: "0 0 110px" }}>
          <span className="field-label">How many</span>
          <input
            className="input input-mono"
            name="quantity"
            inputMode="numeric"
            required
            defaultValue={values.quantity ?? "1"}
          />
        </label>
      </div>
    </ActionForm>
  );
}

/**
 * The quantity stepper on a line. It posts a whole form rather than patching
 * state, because the gauge beside it has to be recomputed by the availability
 * query — a client-side guess at what is free is exactly the whiteboard this
 * product replaces.
 */
export function LineQuantityForm({
  orderId,
  lineId,
  quantity,
  action,
  removeAction,
  disabled,
}: {
  orderId: string;
  lineId: string;
  quantity: number;
  action: Action;
  removeAction: Action;
  disabled: boolean;
}) {
  // Three sibling forms, never nested: a `<form>` inside a `<form>` is dropped by
  // the browser and its submit runs the outer action, so a decrement would
  // silently remove the line.
  return (
    <div className="stepper">
      <StepForm
        action={action}
        orderId={orderId}
        lineId={lineId}
        quantity={Math.max(0, quantity - 1)}
        label="−"
        disabled={disabled}
      />
      <span className="stepper-value" aria-label={`Quantity ${quantity}`}>
        {quantity}
      </span>
      <StepForm
        action={action}
        orderId={orderId}
        lineId={lineId}
        quantity={quantity + 1}
        label="+"
        disabled={disabled}
      />
      <ActionForm
        action={removeAction}
        submitLabel="Remove"
        variant="quiet"
        full={false}
        showMessage={false}
        disabled={disabled}
        className="stack"
      >
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="lineId" value={lineId} />
      </ActionForm>
    </div>
  );
}

function StepForm({
  action,
  orderId,
  lineId,
  quantity,
  label,
  disabled,
}: {
  action: Action;
  orderId: string;
  lineId: string;
  quantity: number;
  label: string;
  disabled: boolean;
}) {
  return (
    <ActionForm
      action={action}
      submitLabel={label}
      variant="quiet"
      full={false}
      showMessage={false}
      disabled={disabled}
      className="stack"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="lineId" value={lineId} />
      <input type="hidden" name="quantity" value={quantity} />
    </ActionForm>
  );
}

export function DepositForm({
  orderId,
  depositCents,
  action,
  disabled,
  disabledReason,
}: {
  orderId: string;
  depositCents: number;
  action: Action;
  disabled: boolean;
  disabledReason?: string;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <ActionForm
      action={action}
      submitLabel="Set the deposit"
      variant="secondary"
      full={false}
      disabled={disabled}
      disabledReason={disabledReason}
      onState={(state) => {
        if (state.values) setValues(state.values);
      }}
    >
      <input type="hidden" name="orderId" value={orderId} />
      <label className="field" style={{ marginBottom: 0 }}>
        <span className="field-label">Security deposit</span>
        <input
          className="input input-mono"
          name="deposit"
          inputMode="decimal"
          defaultValue={values.deposit ?? (depositCents / 100).toFixed(2)}
        />
        <span className="field-help">
          Held as an authorisation on the customer's card. It is not a charge, and money only moves
          against a documented claim.
        </span>
      </label>
    </ActionForm>
  );
}

export function ClaimForm({
  orderId,
  claimId,
  description,
  amountCents,
  updateAction,
  waiveAction,
  disabled,
}: {
  orderId: string;
  claimId: string;
  description: string;
  amountCents: number;
  updateAction: Action;
  waiveAction: Action;
  disabled: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <div className="stack" style={{ gap: 12 }}>
      <ActionForm
        action={updateAction}
        submitLabel="Save claim"
        variant="secondary"
        full={false}
        disabled={disabled}
        onState={(state) => {
          if (state.values) setValues(state.values);
        }}
      >
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="claimId" value={claimId} />
        <label className="field" style={{ marginBottom: 8 }}>
          <span className="field-label">What happened</span>
          <textarea
            className="input"
            name="description"
            defaultValue={values.description ?? description}
          />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Amount</span>
          <input
            className="input input-mono input-narrow"
            name="amount"
            inputMode="decimal"
            defaultValue={values.amount ?? (amountCents / 100).toFixed(2)}
          />
        </label>
      </ActionForm>
      <ActionForm
        action={waiveAction}
        submitLabel="Waive it"
        variant="quiet"
        full={false}
        disabled={disabled}
      >
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="claimId" value={claimId} />
      </ActionForm>
    </div>
  );
}

export function NewClaimForm({
  orderId,
  lines,
  action,
  disabled,
  disabledReason,
}: {
  orderId: string;
  lines: Array<{ id: string; itemName: string }>;
  action: Action;
  disabled: boolean;
  disabledReason?: string;
}) {
  const [state, setState] = useState<FormState>({});
  const selectKey = useResetKey(state);
  const values = state.values ?? {};

  return (
    <ActionForm
      action={action}
      submitLabel="Draft a claim"
      variant="secondary"
      disabled={disabled}
      disabledReason={disabledReason}
      onState={setState}
    >
      <input type="hidden" name="orderId" value={orderId} />
      <div className="field-row">
        <label className="field" style={{ flex: "2 1 180px" }}>
          <span className="field-label">Line</span>
          <select
            key={`line-${selectKey}`}
            className="input"
            name="orderLineId"
            defaultValue={values.orderLineId ?? lines[0]?.id ?? ""}
          >
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.itemName}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex: "1 1 130px" }}>
          <span className="field-label">Kind</span>
          <select
            key={`kind-${selectKey}`}
            className="input"
            name="kind"
            defaultValue={values.kind ?? "damage"}
          >
            <option value="damage">Damaged</option>
            <option value="missing">Missing</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field-label">What happened</span>
        <textarea
          className="input"
          name="description"
          required
          defaultValue={values.description ?? ""}
          placeholder="Two chairs came back with torn seat fabric — see the in-photos."
        />
      </label>
      <label className="field">
        <span className="field-label">Amount</span>
        <input
          className="input input-mono input-narrow"
          name="amount"
          inputMode="decimal"
          required
          defaultValue={values.amount ?? ""}
          placeholder="30.00"
        />
      </label>
    </ActionForm>
  );
}
