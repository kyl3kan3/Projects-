"use client";

/**
 * The first step of the quote builder: who it is for and when the gear is out.
 * The window drives every gauge on the next screen, so it is asked for first and
 * asked for plainly.
 *
 * The customer `<select>` carries a remount key. React 19 resets an uncontrolled
 * form when the action returns, and `defaultValue` on a `<select>` is applied at
 * mount — so without the key a rejected date would silently re-pick the first
 * customer in the list and the next submit would quote the wrong company.
 */

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import type { Customer } from "@/db/schema";
import type { FormState } from "@/lib/form";
import { useResetKey } from "@/lib/reset-key";

export function NewQuoteForm({
  customers,
  action,
  defaultOutOn,
  defaultDueBackOn,
}: {
  customers: Customer[];
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  defaultOutOn: string;
  defaultDueBackOn: string;
}) {
  const [state, setState] = useState<FormState>({});
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "new");
  const selectKey = useResetKey(state);
  const values = state.values ?? {};

  return (
    <ActionForm
      action={action}
      submitLabel="Start the quote"
      pendingLabel="Starting…"
      onState={setState}
    >
      <label className="field">
        <span className="field-label">Customer</span>
        <select
          key={`customer-${selectKey}`}
          className="input"
          name="customerId"
          defaultValue={values.customerId ?? customerId}
          onChange={(e) => setCustomerId(e.currentTarget.value)}
        >
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.company ? ` — ${c.company}` : ""}
              {c.taxExempt ? " (tax exempt)" : ""}
            </option>
          ))}
          <option value="new">+ New customer</option>
        </select>
      </label>

      {customerId === "new" ? (
        <div className="panel" style={{ padding: 16, marginBottom: 16 }}>
          <p className="t-label">New customer</p>
          <label className="field" style={{ marginTop: 12 }}>
            <span className="field-label">Name</span>
            <input
              className="input"
              name="newCustomerName"
              defaultValue={values.newCustomerName ?? ""}
              placeholder="Marisol Vega"
            />
          </label>
          <div className="field-row">
            <label className="field">
              <span className="field-label">Email</span>
              <input
                className="input"
                name="newCustomerEmail"
                type="email"
                defaultValue={values.newCustomerEmail ?? ""}
                placeholder="marisol@vegaevents.com"
              />
              <span className="field-help">The quote link goes here.</span>
            </label>
            <label className="field">
              <span className="field-label">Phone</span>
              <input
                className="input input-mono"
                name="newCustomerPhone"
                defaultValue={values.newCustomerPhone ?? ""}
                placeholder="512 555 0148"
              />
            </label>
          </div>
        </div>
      ) : null}

      <div className="field-row">
        <label className="field">
          <span className="field-label">Out on</span>
          <input
            className="input input-mono"
            name="outOn"
            type="date"
            required
            defaultValue={values.outOn ?? defaultOutOn}
          />
        </label>
        <label className="field">
          <span className="field-label">Due back on</span>
          <input
            className="input input-mono"
            name="dueBackOn"
            type="date"
            required
            defaultValue={values.dueBackOn ?? defaultDueBackOn}
          />
        </label>
      </div>
      <p className="field-help" style={{ marginTop: -8, marginBottom: 16 }}>
        The gear is unavailable to anyone else from the out date up to — but not including — the
        due-back date. A Saturday-only party goes out Saturday and comes back Sunday.
      </p>

      <label className="checkline" style={{ marginBottom: 16 }}>
        <input type="checkbox" name="delivery" defaultChecked={values.delivery === "on"} />
        <span className="t-body">We are delivering it</span>
      </label>

      <label className="field">
        <span className="field-label">Site address</span>
        <textarea
          className="input"
          name="address"
          defaultValue={values.address ?? ""}
          placeholder={"Pecan Grove Barn\n4180 FM 1626, Buda TX"}
        />
      </label>

      <label className="field">
        <span className="field-label">Notes for the crew</span>
        <textarea
          className="input"
          name="notes"
          defaultValue={values.notes ?? ""}
          placeholder="Gate code 4412. Unload at the north end, the ceremony is on the south lawn."
        />
      </label>
    </ActionForm>
  );
}
