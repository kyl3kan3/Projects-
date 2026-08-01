"use client";

/**
 * Board-power actions on an invoice: apply a late fee, waive one, write the
 * invoice off, or split a balance into a payment plan.
 *
 * Every one of them is hold-to-confirm and every one of them is audit-logged
 * server-side. Waiving a fee is the action a board takes most often and the one a
 * member is most likely to ask about later, so the reason field is required, not
 * optional.
 */

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { formatMoney, splitCents } from "@/lib/money";
import {
  applyLateFeeAction,
  createPaymentPlanAction,
  waiveLateFeeAction,
  writeOffAction,
} from "../actions";

export function HouseholdPowerActions({
  invoiceId,
  householdId,
  hasLateFee = false,
  lateFeesAllowed = false,
  balanceCents = 0,
  todayIso,
}: {
  invoiceId?: string;
  householdId?: string;
  hasLateFee?: boolean;
  lateFeesAllowed?: boolean;
  balanceCents?: number;
  todayIso: string;
}) {
  const [panel, setPanel] = useState<null | "fee" | "waive" | "writeoff" | "plan">(null);

  if (householdId) {
    return <PlanForm householdId={householdId} balanceCents={balanceCents} todayIso={todayIso} />;
  }
  if (!invoiceId) return null;

  return (
    <div>
      <div className="flex flex-wrap gap-4">
        {hasLateFee ? (
          <button className="btn-quiet" onClick={() => setPanel(panel === "waive" ? null : "waive")}>
            Waive the late fee
          </button>
        ) : (
          <button
            className="btn-quiet"
            onClick={() => setPanel(panel === "fee" ? null : "fee")}
            disabled={!lateFeesAllowed}
          >
            Apply a late fee
          </button>
        )}
        {balanceCents > 0 ? (
          <button
            className="btn-quiet"
            onClick={() => setPanel(panel === "writeoff" ? null : "writeoff")}
          >
            Write it off
          </button>
        ) : null}
      </div>

      {panel === "fee" ? (
        <div className="mt-4">
          <ActionForm
            action={applyLateFeeAction}
            submitLabel="Apply the fee"
            variant="secondary"
            small
            confirmHold
          >
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <p className="t-secondary">
              Applies this invoice&apos;s own policy — the one that was in force when it was billed,
              not whatever the board voted since. Charged once, as its own line.
            </p>
          </ActionForm>
        </div>
      ) : null}

      {panel === "waive" ? (
        <div className="mt-4">
          <ActionForm
            action={waiveLateFeeAction}
            submitLabel="Waive the fee"
            variant="secondary"
            small
            confirmHold
          >
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <label className="field">
              <span className="t-label">Reason</span>
              <input
                className="input"
                name="reason"
                required
                placeholder="Board voted Apr 14; hospital stay"
              />
            </label>
            <p className="t-secondary">
              The fee stays on the record with the waiver beside it, so the invoice shows both what
              was charged and what the board forgave.
            </p>
          </ActionForm>
        </div>
      ) : null}

      {panel === "writeoff" ? (
        <div className="mt-4">
          <ActionForm
            action={writeOffAction}
            submitLabel="Write off the balance"
            variant="secondary"
            small
            confirmHold
          >
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <label className="field">
              <span className="t-label">Reason</span>
              <input
                className="input"
                name="reason"
                required
                placeholder="Uncollectable; unit sold at foreclosure"
              />
            </label>
            <p className="t-secondary">
              The invoice stays visible and stops counting toward what the association is owed.
            </p>
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}

function PlanForm({
  householdId,
  balanceCents,
  todayIso,
}: {
  householdId: string;
  balanceCents: number;
  todayIso: string;
}) {
  const [parts, setParts] = useState(3);
  const instalments = splitCents(balanceCents, parts);

  return (
    <ActionForm
      action={createPaymentPlanAction}
      submitLabel="Create the plan"
      variant="secondary"
      small
      confirmHold
    >
      <input type="hidden" name="householdId" value={householdId} />
      <div className="flex gap-3">
        <label className="field flex-1">
          <span className="t-label">Instalments</span>
          <select
            className="input"
            name="parts"
            value={parts}
            onChange={(e) => setParts(Number(e.target.value))}
          >
            {[2, 3, 4, 6, 12].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="field flex-1">
          <span className="t-label">First due</span>
          <input className="input input-mono" name="startOn" type="date" defaultValue={todayIso} />
        </label>
      </div>
      <p className="t-secondary">
        {instalments.map((cents) => formatMoney(cents)).join(" + ")} ={" "}
        {formatMoney(balanceCents)}
      </p>
    </ActionForm>
  );
}
