"use client";

import { ActionForm } from "@/components/ActionForm";
import { SectionHead } from "@/components/ui";
import { PLANS, PLAN_ORDER, type PlanTier } from "@/lib/plans";
import { choosePlanAction, portalAction } from "../actions";

export function PlanForms({
  canManage,
  currentTier,
  hasCustomer,
}: {
  canManage: boolean;
  currentTier: PlanTier;
  hasCustomer: boolean;
}) {
  if (!canManage) {
    return (
      <p className="t-secondary fg-3" style={{ marginTop: 32 }}>
        Only the owner can change the plan.
      </p>
    );
  }

  return (
    <>
      <SectionHead>Change plan</SectionHead>
      <div className="card" style={{ padding: 16 }}>
        <ActionForm action={choosePlanAction} submitLabel="Continue to checkout">
          <div className="field">
            <label className="t-label" htmlFor="tier">
              Plan
            </label>
            <select id="tier" name="tier" className="input" defaultValue={currentTier}>
              {PLAN_ORDER.map((tier) => (
                <option key={tier} value={tier}>
                  {PLANS[tier].name} — up to {PLANS[tier].studentLimit} students
                </option>
              ))}
            </select>
          </div>
        </ActionForm>
      </div>

      {hasCustomer ? (
        <div style={{ marginTop: 16 }}>
          <ActionForm action={portalAction} submitLabel="Manage billing in Stripe" variant="secondary" />
        </div>
      ) : null}
    </>
  );
}
