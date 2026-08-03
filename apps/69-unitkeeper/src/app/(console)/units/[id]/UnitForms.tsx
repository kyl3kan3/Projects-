"use client";

import { ActionForm } from "@/components/ActionForm";
import {
  completeMoveInAction,
  gateCodeAction,
  generateStatementAction,
  moveOutAction,
  postAdjustmentAction,
  recordPaymentAction,
  refundAction,
} from "@/app/(console)/units/[id]/actions";
import { updateUnitAction } from "@/app/(console)/actions";
import { UNIT_SIZES } from "@/lib/unit-shapes";

export function RecordPaymentForm({
  tenancyId,
  suggestedCents,
  today,
}: {
  tenancyId: string;
  suggestedCents: number;
  today: string;
}) {
  return (
    <ActionForm action={recordPaymentAction} submitLabel="Record the payment">
      <input type="hidden" name="tenancyId" value={tenancyId} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Amount</span>
          <input
            className="input input-mono"
            name="amount"
            inputMode="decimal"
            required
            defaultValue={suggestedCents > 0 ? (suggestedCents / 100).toFixed(2) : ""}
          />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Date received</span>
          <input className="input input-mono" name="occurredOn" defaultValue={today} required />
        </label>
      </div>
      <label className="field">
        <span className="field-label">Note</span>
        <input
          className="input"
          name="description"
          placeholder="Cash at the counter — receipt 4471"
        />
      </label>
      <p className="field-help">
        Paying the balance in full reverses every ladder step, lifts an overlock and resolves an open
        lien case — automatically, in this one action.
      </p>
    </ActionForm>
  );
}

export function AdjustmentForm({ tenancyId }: { tenancyId: string }) {
  return (
    <ActionForm action={postAdjustmentAction} submitLabel="Post the adjustment" variant="secondary">
      <input type="hidden" name="tenancyId" value={tenancyId} />
      <label className="field">
        <span className="field-label">Amount (negative to credit)</span>
        <input className="input input-mono" name="amount" inputMode="decimal" required placeholder="-20.00" />
      </label>
      <label className="field">
        <span className="field-label">Reason</span>
        <input
          className="input"
          name="description"
          required
          placeholder="Late fee waived — first time in three years"
        />
      </label>
      <p className="field-help">
        The ledger is append-only. This posts a new row; nothing is edited, because the lien packet
        prints these rows verbatim.
      </p>
    </ActionForm>
  );
}

export function RefundForm({ tenancyId, creditCents }: { tenancyId: string; creditCents: number }) {
  return (
    <ActionForm action={refundAction} submitLabel="Record the refund" variant="secondary">
      <input type="hidden" name="tenancyId" value={tenancyId} />
      <label className="field">
        <span className="field-label">Refund amount</span>
        <input
          className="input input-mono"
          name="amount"
          inputMode="decimal"
          required
          defaultValue={(creditCents / 100).toFixed(2)}
        />
      </label>
      <label className="field">
        <span className="field-label">Note</span>
        <input className="input" name="description" placeholder="Check 2214 mailed" />
      </label>
    </ActionForm>
  );
}

export function GateCodeForm({
  tenancyId,
  status,
}: {
  tenancyId: string;
  status: "active" | "revoked" | "overlocked";
}) {
  return (
    <div className="flex flex-col gap-3">
      <ActionForm
        action={gateCodeAction}
        submitLabel="Issue a new code"
        variant="secondary"
        full={false}
      >
        <input type="hidden" name="tenancyId" value={tenancyId} />
        <input type="hidden" name="intent" value="reissue" />
      </ActionForm>
      {status !== "overlocked" ? (
        <ActionForm
          action={gateCodeAction}
          submitLabel="Overlock now"
          variant="danger"
          hold
          full={false}
        >
          <input type="hidden" name="tenancyId" value={tenancyId} />
          <input type="hidden" name="intent" value="overlocked" />
        </ActionForm>
      ) : (
        <ActionForm
          action={gateCodeAction}
          submitLabel="Lift the overlock"
          variant="secondary"
          full={false}
        >
          <input type="hidden" name="tenancyId" value={tenancyId} />
          <input type="hidden" name="intent" value="active" />
        </ActionForm>
      )}
    </div>
  );
}

export function StatementForm({ tenancyId }: { tenancyId: string }) {
  return (
    <ActionForm
      action={generateStatementAction}
      submitLabel="Generate a statement PDF"
      variant="secondary"
      full={false}
    >
      <input type="hidden" name="tenancyId" value={tenancyId} />
    </ActionForm>
  );
}

export function CompleteMoveInForm({
  tenancyId,
  amountCents,
  hasMethod,
}: {
  tenancyId: string;
  amountCents: number;
  hasMethod: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <ActionForm
        action={completeMoveInAction}
        submitLabel={`Charge the saved method — $${(amountCents / 100).toFixed(2)}`}
        variant="primary"
        disabled={!hasMethod}
        disabledReason={
          hasMethod ? undefined : "No payment method saved yet — the tenant adds one on the link."
        }
      >
        <input type="hidden" name="tenancyId" value={tenancyId} />
        <input type="hidden" name="method" value="saved" />
      </ActionForm>
      <ActionForm
        action={completeMoveInAction}
        submitLabel={`Paid at the counter — $${(amountCents / 100).toFixed(2)}`}
        variant="secondary"
      >
        <input type="hidden" name="tenancyId" value={tenancyId} />
        <input type="hidden" name="method" value="cash" />
      </ActionForm>
    </div>
  );
}

export function MoveOutForm({
  tenancyId,
  today,
  items,
}: {
  tenancyId: string;
  today: string;
  items: readonly string[];
}) {
  return (
    <ActionForm action={moveOutAction} submitLabel="Move the tenant out" variant="danger" hold>
      <input type="hidden" name="tenancyId" value={tenancyId} />
      <label className="field">
        <span className="field-label">Move-out date</span>
        <input className="input input-mono" name="endedOn" defaultValue={today} required />
      </label>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label">Make-ready</legend>
        {items.map((item) => (
          <label className="checkline" key={item}>
            <input type="checkbox" name={`mr_${item}`} />
            <span className="t-body">{item}</span>
          </label>
        ))}
      </fieldset>
      <p className="field-help">
        The unit goes back to vacant, the gate code is revoked, and any unused days of the last month
        are credited if your prorate rule is daily.
      </p>
    </ActionForm>
  );
}

export function UnitEditForm({
  unitId,
  size,
  rateCents,
  notes,
  maintenance,
  canMaintain,
}: {
  unitId: string;
  size: string;
  rateCents: number;
  notes: string;
  maintenance: boolean;
  canMaintain: boolean;
}) {
  return (
    <ActionForm action={updateUnitAction} submitLabel="Save the unit" variant="secondary">
      <input type="hidden" name="unitId" value={unitId} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Size</span>
          <select className="input" name="size" defaultValue={size}>
            {UNIT_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
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
            defaultValue={(rateCents / 100).toFixed(2)}
          />
        </label>
      </div>
      <label className="field">
        <span className="field-label">Notes</span>
        <input className="input" name="notes" defaultValue={notes} placeholder="Door sticks in the wet" />
      </label>
      {canMaintain ? (
        <label className="checkline">
          <input type="checkbox" name="maintenance" defaultChecked={maintenance} />
          <span className="t-body">Out of service for maintenance</span>
        </label>
      ) : (
        <p className="field-help">
          A unit with a live tenancy cannot be marked out of service — move the tenant out first.
        </p>
      )}
    </ActionForm>
  );
}
