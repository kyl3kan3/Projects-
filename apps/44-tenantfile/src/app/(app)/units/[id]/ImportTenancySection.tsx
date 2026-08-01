"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { importTenancyAction } from "@/app/(app)/actions";

/**
 * The mid-lease start. ROADMAP calls this "the common case" and it is: most people
 * arriving here already have somebody living in the unit. The copy is honest that
 * back-dated charges come from the lease terms, not from bank records.
 */
export function ImportTenancySection({
  unitId,
  rentCents,
  depositCents,
}: {
  unitId: string;
  rentCents: number;
  depositCents: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="t-label">Someone already lives here?</h2>
        {!open ? (
          <button type="button" className="btn-quiet" onClick={() => setOpen(true)}>
            Bring the tenancy in
          </button>
        ) : null}
      </div>

      {!open ? (
        <p className="t-secondary">
          Start the ledger from the real lease dates. No signing needed — they are already your tenant.
        </p>
      ) : (
        <ActionForm action={importTenancyAction} submitLabel="Start the ledger" pendingLabel="Setting up…">
          <input type="hidden" name="unitId" value={unitId} />

          <label className="field">
            <span className="t-label">Tenant names</span>
            <input className="input" name="tenantNames" required placeholder="Marta Alvarez, Diego Alvarez" />
            <span className="t-secondary">Separate more than one with a comma.</span>
          </label>

          <label className="field">
            <span className="t-label">Email for reminders</span>
            <input className="input input-mono" name="tenantEmails" type="email" placeholder="marta@example.com" />
          </label>

          <label className="field">
            <span className="t-label">Mobile for texts</span>
            <input className="input input-mono" name="tenantPhones" placeholder="+19375550142" inputMode="tel" />
            <span className="t-secondary">Rent texts go to this number. Leave it blank and they get email only.</span>
          </label>

          <div className="flex gap-3">
            <label className="field flex-1">
              <span className="t-label">Lease started</span>
              <input className="input input-mono" name="startsOn" type="date" required />
            </label>
            <label className="field flex-1">
              <span className="t-label">Ends</span>
              <input className="input input-mono" name="endsOn" type="date" />
            </label>
          </div>

          <div className="flex gap-3">
            <label className="field flex-1">
              <span className="t-label">Monthly rent</span>
              <input
                className="input input-mono"
                name="rent"
                required
                inputMode="decimal"
                defaultValue={(rentCents / 100).toFixed(0)}
              />
            </label>
            <label className="field flex-1">
              <span className="t-label">Deposit held</span>
              <input
                className="input input-mono"
                name="deposit"
                inputMode="decimal"
                defaultValue={(depositCents / 100).toFixed(0)}
              />
            </label>
            <label className="field w-[110px]">
              <span className="t-label">Due day</span>
              <input className="input input-mono" name="rentDueDay" type="number" min={1} max={31} defaultValue={1} />
            </label>
          </div>

          <label className="flex items-center gap-3">
            <input type="checkbox" name="prorateFirstMonth" defaultChecked />
            <span className="t-body">Prorate the first month if it started mid-month</span>
          </label>
          <label className="flex items-center gap-3">
            <input type="checkbox" name="prorateLastMonth" defaultChecked />
            <span className="t-body">Prorate the last month if it ends mid-month</span>
          </label>

          <div className="notice" data-tone="warn">
            <p className="t-secondary">
              Charges from before today are generated from these terms, not from your bank statements. Check the ledger
              against what was actually paid and record the payments — that is what makes the file worth having.
            </p>
          </div>
        </ActionForm>
      )}
    </section>
  );
}
