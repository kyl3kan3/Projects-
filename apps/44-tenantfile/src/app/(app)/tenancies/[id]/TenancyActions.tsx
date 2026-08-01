"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import {
  adjustChargeAction,
  endTenancyAction,
  recordPaymentAction,
  saveLateFeeRuleAction,
  sendReminderNowAction,
  updateContactsAction,
  waiveChargeAction,
} from "@/app/(app)/actions";
import { formatMoney } from "@/lib/money";
import type { RuleWarning } from "@/lib/state-rules";

interface OpenCharge {
  id: string;
  label: string;
  outstandingCents: number;
  amountCents: number;
  dueOn: string;
}

/**
 * Everything a landlord does to a ledger, in the thumb zone: record a payment
 * (primary), then the quieter things — nudge, waive, adjust, set the late-fee rule,
 * fix the tenant's contact details, end the tenancy.
 *
 * "Record a payment" defaults to the oldest open charge and to Zelle, because that
 * is what actually happens: the money arrived somewhere else and the ledger has to
 * catch up.
 */
export function TenancyActions({
  tenancyId,
  openCharges,
  rule,
  ruleSummary,
  stateWarnings,
  stateName,
  legalDisclaimer,
  rentCents,
  tenantEmails,
  tenantPhones,
  canEnd,
}: {
  tenancyId: string;
  openCharges: OpenCharge[];
  rule: {
    graceDays: number;
    kind: "flat" | "percent";
    amount: number;
    maxPerMonthCents: number | null;
    enabled: boolean;
    stateCapAck: boolean;
  } | null;
  ruleSummary: string;
  stateWarnings: RuleWarning[];
  stateName: string;
  legalDisclaimer: string;
  rentCents: number;
  tenantEmails: string;
  tenantPhones: string;
  canEnd: boolean;
}) {
  const [pane, setPane] = useState<"pay" | "fee" | "contacts" | "end" | "none">("pay");
  const [kind, setKind] = useState<"flat" | "percent">(rule?.kind ?? "flat");
  const oldest = openCharges[0];

  return (
    <section className="flex flex-col gap-6">
      <nav className="scroll-x flex gap-2 pb-1">
        <button type="button" className="chip" data-active={pane === "pay"} onClick={() => setPane("pay")}>
          Record a payment
        </button>
        <button type="button" className="chip" data-active={pane === "fee"} onClick={() => setPane("fee")}>
          Late fees
        </button>
        <button type="button" className="chip" data-active={pane === "contacts"} onClick={() => setPane("contacts")}>
          Contacts
        </button>
        {canEnd ? (
          <button type="button" className="chip" data-active={pane === "end"} onClick={() => setPane("end")}>
            End tenancy
          </button>
        ) : null}
      </nav>

      {pane === "pay" ? (
        <div className="flex flex-col gap-6">
          <ActionForm action={recordPaymentAction} submitLabel="Record the payment" pendingLabel="Recording…">
            <input type="hidden" name="tenancyId" value={tenancyId} />

            <label className="field">
              <span className="t-label">Against</span>
              <select className="input" name="chargeId" defaultValue={oldest?.id ?? ""}>
                {openCharges.map((charge) => (
                  <option key={charge.id} value={charge.id}>
                    {charge.label} — {formatMoney(charge.outstandingCents)} owing
                  </option>
                ))}
                <option value="">Nothing in particular (apply to the oldest debt)</option>
              </select>
            </label>

            <div className="flex gap-3">
              <label className="field flex-1">
                <span className="t-label">Amount</span>
                <input
                  className="input input-mono"
                  name="amount"
                  required
                  inputMode="decimal"
                  defaultValue={oldest ? (oldest.outstandingCents / 100).toFixed(2) : ""}
                  placeholder="1850.00"
                />
              </label>
              <label className="field flex-1">
                <span className="t-label">Paid on</span>
                <input className="input input-mono" name="paidOn" type="date" />
              </label>
            </div>

            <label className="field">
              <span className="t-label">How</span>
              <select className="input" name="method" defaultValue="manual_zelle">
                <option value="manual_zelle">Zelle</option>
                <option value="manual_check">Check</option>
                <option value="manual_cash">Cash</option>
                <option value="ach">Bank transfer</option>
                <option value="card">Card</option>
              </select>
            </label>

            <label className="field">
              <span className="t-label">Reference</span>
              <input className="input input-mono" name="reference" placeholder="Zelle 8841 / check #2214" />
            </label>

            <p className="t-secondary">
              A part payment is fine — the ledger records exactly what arrived and keeps the rest owing. Pay more than the
              charge and the extra rolls onto the next one.
            </p>
          </ActionForm>

          {oldest ? (
            <div className="flex flex-col gap-4">
              <ActionForm action={sendReminderNowAction} submitLabel="Send a reminder now" variant="quiet" full={false} className="flex flex-col gap-2">
                <input type="hidden" name="tenancyId" value={tenancyId} />
                <input type="hidden" name="chargeId" value={oldest.id} />
              </ActionForm>

              <details>
                <summary className="btn-quiet cursor-pointer list-none">Waive or adjust a charge</summary>
                <div className="mt-4 flex flex-col gap-6">
                  <ActionForm action={waiveChargeAction} submitLabel="Waive it" variant="secondary" hold>
                    <input type="hidden" name="tenancyId" value={tenancyId} />
                    <label className="field">
                      <span className="t-label">Which charge</span>
                      <select className="input" name="chargeId" defaultValue={oldest.id}>
                        {openCharges.map((charge) => (
                          <option key={charge.id} value={charge.id}>
                            {charge.label} — {formatMoney(charge.outstandingCents)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="t-label">Why</span>
                      <input className="input" name="reason" placeholder="Storm knocked the power out for four days" />
                    </label>
                    <p className="t-secondary">
                      A waived charge stays on the ledger at zero, with your reason. Nothing is deleted.
                    </p>
                  </ActionForm>

                  <ActionForm action={adjustChargeAction} submitLabel="Change the amount" variant="secondary">
                    <input type="hidden" name="tenancyId" value={tenancyId} />
                    <label className="field">
                      <span className="t-label">Which charge</span>
                      <select className="input" name="chargeId" defaultValue={oldest.id}>
                        {openCharges.map((charge) => (
                          <option key={charge.id} value={charge.id}>
                            {charge.label} — {formatMoney(charge.amountCents)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex gap-3">
                      <label className="field flex-1">
                        <span className="t-label">New amount</span>
                        <input className="input input-mono" name="amount" required inputMode="decimal" />
                      </label>
                    </div>
                    <label className="field">
                      <span className="t-label">Why</span>
                      <input className="input" name="reason" placeholder="Agreed $100 off while the boiler was out" />
                    </label>
                  </ActionForm>
                </div>
              </details>
            </div>
          ) : null}
        </div>
      ) : null}

      {pane === "fee" ? (
        <div className="flex flex-col gap-4">
          <div className="card p-4">
            <p className="t-title">{ruleSummary}</p>
            {stateWarnings.map((warning, i) => (
              <p
                key={i}
                className="t-secondary mt-2"
                style={{ color: warning.level === "warn" ? "var(--color-amber)" : undefined }}
              >
                {warning.text}
              </p>
            ))}
          </div>

          <ActionForm action={saveLateFeeRuleAction} submitLabel="Save the rule">
            <input type="hidden" name="tenancyId" value={tenancyId} />

            <label className="flex items-center gap-3">
              <input type="checkbox" name="enabled" defaultChecked={rule?.enabled ?? false} />
              <span className="t-body">Charge a late fee automatically</span>
            </label>

            <div className="flex gap-3">
              <label className="field w-[130px]">
                <span className="t-label">Grace days</span>
                <input
                  className="input input-mono"
                  name="graceDays"
                  type="number"
                  min={0}
                  max={60}
                  defaultValue={rule?.graceDays ?? 5}
                />
              </label>
              <label className="field flex-1">
                <span className="t-label">Kind</span>
                <select className="input" name="kind" value={kind} onChange={(e) => setKind(e.target.value as "flat" | "percent")}>
                  <option value="flat">A flat amount</option>
                  <option value="percent">A percentage of what is unpaid</option>
                </select>
              </label>
            </div>

            {kind === "flat" ? (
              <label className="field">
                <span className="t-label">Fee</span>
                <input
                  className="input input-mono"
                  name="flatAmount"
                  inputMode="decimal"
                  defaultValue={rule && rule.kind === "flat" ? (rule.amount / 100).toFixed(2) : "50.00"}
                />
              </label>
            ) : (
              <label className="field">
                <span className="t-label">Percent</span>
                <input
                  className="input input-mono"
                  name="percentAmount"
                  type="number"
                  step="0.25"
                  min={0}
                  max={25}
                  defaultValue={rule && rule.kind === "percent" ? rule.amount / 100 : 5}
                />
                <span className="t-secondary">
                  Taken on what is still owed, not the full rent. At {formatMoney(rentCents)} a whole month unpaid would be{" "}
                  {formatMoney(Math.round(rentCents * 0.05))} at 5%.
                </span>
              </label>
            )}

            <label className="field">
              <span className="t-label">Never more than, per month</span>
              <input className="input input-mono" name="maxPerMonth" inputMode="decimal" placeholder="leave blank for no cap" />
            </label>

            <label className="flex items-start gap-3">
              <input type="checkbox" name="stateCapAck" defaultChecked={rule?.stateCapAck ?? false} className="mt-1" />
              <span className="t-body">
                I have read what is commonly cited for {stateName || "my state"} and I want this rule
                <span className="t-secondary block">{legalDisclaimer}</span>
              </span>
            </label>
          </ActionForm>
        </div>
      ) : null}

      {pane === "contacts" ? (
        <ActionForm action={updateContactsAction} submitLabel="Save">
          <input type="hidden" name="tenancyId" value={tenancyId} />
          <label className="field">
            <span className="t-label">Email for reminders</span>
            <input className="input input-mono" name="tenantEmails" defaultValue={tenantEmails} placeholder="marta@example.com" />
          </label>
          <label className="field">
            <span className="t-label">Mobile for texts</span>
            <input className="input input-mono" name="tenantPhones" defaultValue={tenantPhones} placeholder="+19375550142" />
          </label>
          <p className="t-secondary">
            A reminder with nowhere to go is cancelled rather than silently dropped — you will see the reason on the
            reminder list.
          </p>
        </ActionForm>
      ) : null}

      {pane === "end" ? (
        <ActionForm action={endTenancyAction} submitLabel="End the tenancy" variant="danger" hold>
          <input type="hidden" name="tenancyId" value={tenancyId} />
          <label className="field">
            <span className="t-label">Last day</span>
            <input className="input input-mono" name="endsOn" type="date" required />
          </label>
          <p className="t-secondary">
            The unit goes vacant and no more rent is generated. The File and the whole ledger stay exactly as they are —
            that is the part you will want if the deposit is ever argued about.
          </p>
        </ActionForm>
      ) : null}
    </section>
  );
}
