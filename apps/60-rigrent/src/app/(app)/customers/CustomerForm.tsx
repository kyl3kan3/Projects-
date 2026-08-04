"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import type { Customer } from "@/db/schema";
import type { FormState } from "@/lib/form";

export function CustomerForm({
  customer,
  action,
}: {
  customer: Customer | null;
  action: (prev: FormState, form: FormData) => Promise<FormState>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const v = (name: string, fallback: string) => values[name] ?? fallback;

  return (
    <ActionForm
      action={action}
      submitLabel={customer ? "Save customer" : "Add customer"}
      onState={(state) => {
        if (state.values) setValues(state.values);
      }}
    >
      {customer ? <input type="hidden" name="customerId" value={customer.id} /> : null}

      <label className="field">
        <span className="field-label">Name</span>
        <input
          className="input"
          name="name"
          required
          defaultValue={v("name", customer?.name ?? "")}
          placeholder="Marisol Vega"
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span className="field-label">Email</span>
          <input
            className="input"
            name="email"
            type="email"
            defaultValue={v("email", customer?.email ?? "")}
            placeholder="marisol@vegaevents.com"
          />
          <span className="field-help">Quote links and receipts go here.</span>
        </label>
        <label className="field">
          <span className="field-label">Phone</span>
          <input
            className="input input-mono"
            name="phone"
            defaultValue={v("phone", customer?.phone ?? "")}
            placeholder="512 555 0148"
          />
        </label>
      </div>

      <label className="field">
        <span className="field-label">Company</span>
        <input
          className="input"
          name="company"
          defaultValue={v("company", customer?.company ?? "")}
          placeholder="Vega Events"
        />
      </label>

      <label className="checkline" style={{ marginBottom: 16 }}>
        <input
          type="checkbox"
          name="taxExempt"
          defaultChecked={
            values.taxExempt ? values.taxExempt === "on" : (customer?.taxExempt ?? false)
          }
        />
        <span className="t-body">Tax exempt — no sales tax on their quotes</span>
      </label>

      <label className="field">
        <span className="field-label">Notes</span>
        <textarea
          className="input"
          name="notes"
          defaultValue={v("notes", customer?.notes ?? "")}
          placeholder="Books the Pecan Grove barn every spring. Wants tables set, not stacked."
        />
      </label>
    </ActionForm>
  );
}
