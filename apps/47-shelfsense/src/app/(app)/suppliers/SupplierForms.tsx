"use client";

/**
 * Supplier editing and the CSV import. Both are ordinary forms driven by server
 * actions — nothing here holds a copy of the truth.
 */

import { useActionState, useState } from "react";
import { IconPlus } from "@/components/icons";
import {
  assignSupplierAction,
  importSupplierCsvAction,
  saveSupplierAction,
  type SupplierState,
} from "./actions";

/**
 * Declared here, not in actions.ts: a `"use server"` module may only export async
 * functions, so a constant exported from one arrives as undefined.
 */
const emptySupplierState: SupplierState = { error: null, note: null, issues: [] };

export interface SupplierView {
  id: string;
  name: string;
  email: string | null;
  leadTimeDays: number;
  minOrderValueCents: number;
  notes: string | null;
  skuCount: number;
}

function Feedback({ state }: { state: SupplierState }) {
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
      {state.issues.length ? (
        <ul className="mt-2 flex flex-col gap-1">
          {state.issues.map((issue) => (
            <li key={issue} className="t-secondary" style={{ color: "var(--color-kraft)" }}>
              {issue}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

export function SupplierForm({ supplier }: { supplier?: SupplierView }) {
  const [state, action, pending] = useActionState(saveSupplierAction, emptySupplierState);
  const [open, setOpen] = useState(!supplier);

  if (supplier && !open) {
    return (
      <button type="button" className="btn-quiet" onClick={() => setOpen(true)}>
        Edit lead time
      </button>
    );
  }

  return (
    <form action={action} className="mt-3 flex flex-col gap-3">
      {supplier ? <input type="hidden" name="id" value={supplier.id} /> : null}
      <label className="block">
        <span className="t-label">Supplier name</span>
        <input
          className="input mt-2"
          name="name"
          defaultValue={supplier?.name ?? ""}
          placeholder="Apex Goods Co."
          required
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="t-label">Lead time (days)</span>
          <input
            className="input input-mono mt-2"
            name="leadTimeDays"
            type="number"
            min={0}
            max={365}
            defaultValue={supplier?.leadTimeDays ?? 14}
            required
          />
        </label>
        <label className="block">
          <span className="t-label">Min order value</span>
          <input
            className="input input-mono mt-2"
            name="minOrderValue"
            type="number"
            min={0}
            step="0.01"
            defaultValue={supplier ? (supplier.minOrderValueCents / 100).toFixed(2) : "0.00"}
          />
        </label>
      </div>
      <label className="block">
        <span className="t-label">Email for POs</span>
        <input
          className="input mt-2"
          name="email"
          type="email"
          defaultValue={supplier?.email ?? ""}
          placeholder="orders@apexgoods.example"
        />
      </label>
      <label className="block">
        <span className="t-label">Notes</span>
        <textarea
          className="input mt-2"
          name="notes"
          defaultValue={supplier?.notes ?? ""}
          placeholder="Ships Tuesdays; cut-off 14:00 ET the day before."
        />
      </label>
      <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
        {pending ? "Saving…" : supplier ? "Save supplier" : "Add supplier"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function AddSupplierToggle() {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn btn-secondary btn-full" onClick={() => setOpen(true)}>
        <IconPlus size={18} />
        Add a supplier
      </button>
    );
  }
  return <SupplierForm />;
}

export function AssignForm({
  variantId,
  sku,
  suppliers,
  currentSupplierId,
  moq,
  packSize,
}: {
  variantId: string;
  sku: string;
  suppliers: { id: string; name: string; leadTimeDays: number }[];
  currentSupplierId: string | null;
  moq: number;
  packSize: number;
}) {
  const [state, action, pending] = useActionState(assignSupplierAction, emptySupplierState);

  return (
    <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
      <input type="hidden" name="variantId" value={variantId} />
      <label className="min-w-[150px] flex-1">
        <span className="sr-only">Supplier for {sku}</span>
        <select className="input" name="supplierId" defaultValue={currentSupplierId ?? ""}>
          <option value="">No supplier</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name} · {supplier.leadTimeDays}d
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="sr-only">MOQ for {sku}</span>
        <input
          className="input input-mono text-right"
          style={{ width: 76 }}
          name="moq"
          type="number"
          min={0}
          defaultValue={moq}
          aria-label={`Minimum order quantity for ${sku}`}
        />
      </label>
      <label>
        <span className="sr-only">Pack size for {sku}</span>
        <input
          className="input input-mono text-right"
          style={{ width: 76 }}
          name="packSize"
          type="number"
          min={1}
          defaultValue={packSize}
          aria-label={`Pack size for ${sku}`}
        />
      </label>
      <button type="submit" className="btn btn-secondary" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
      <div className="w-full">
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function ImportForm({ template }: { template: string }) {
  const [state, action, pending] = useActionState(importSupplierCsvAction, emptySupplierState);

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="block">
        <span className="t-label">CSV file</span>
        <input className="input mt-2 pt-3" name="file" type="file" accept=".csv,text/csv" />
      </label>
      <label className="block">
        <span className="t-label">…or paste the rows</span>
        <textarea
          className="input input-mono mt-2"
          name="csv"
          rows={6}
          style={{ fontSize: 13, minHeight: 132 }}
          placeholder={template}
        />
      </label>
      <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
        {pending ? "Applying rows…" : "Import"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
