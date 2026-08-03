"use client";

/**
 * Plan picker. Monthly or annual (two months free), with the per-month arithmetic
 * spelled out rather than implied — a seasonal trade prepays in January and wants
 * to see what that costs.
 */

import { useActionState, useState } from "react";
import {
  applyCreditAction,
  openBillingPortalAction,
  startCheckoutAction,
  type BillingState,
} from "../actions";
import { money } from "@/lib/format";
import { PLANS, PLAN_ORDER, annualCents, annualSavingCents } from "@/lib/plans";
import type { Plan, PlanInterval } from "@/db/schema";

const initial: BillingState = { error: null, ok: null };

export function PlanPicker({
  currentPlan,
  currentInterval,
  hasSubscription,
  billingConfigured,
  creditApplicableCents,
  creditCarriedCents,
}: {
  currentPlan: Plan;
  currentInterval: PlanInterval;
  hasSubscription: boolean;
  billingConfigured: boolean;
  creditApplicableCents: number;
  creditCarriedCents: number;
}) {
  const [interval, setInterval] = useState<PlanInterval>(currentInterval);
  const [checkoutState, checkout, checkingOut] = useActionState(startCheckoutAction, initial);
  const [portalState, portal, openingPortal] = useActionState(openBillingPortalAction, initial);
  const [creditState, applyCredit, applyingCredit] = useActionState(applyCreditAction, initial);

  return (
    <>
      <div className="chiprow mt-5" role="group" aria-label="Billing interval">
        <button
          type="button"
          className="chip"
          data-active={interval === "month"}
          onClick={() => setInterval("month")}
          aria-pressed={interval === "month"}
        >
          Monthly
        </button>
        <button
          type="button"
          className="chip"
          data-active={interval === "year"}
          onClick={() => setInterval("year")}
          aria-pressed={interval === "year"}
        >
          Annual — 2 months free
        </button>
      </div>

      {PLAN_ORDER.map((id) => {
        const plan = PLANS[id];
        const price = interval === "year" ? annualCents(id) : plan.monthlyCents;
        const isCurrent = id === currentPlan;
        return (
          <article key={id} className="card mt-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="t-label">{plan.name}</span>
              <span className="t-data">
                {money(price)}
                {interval === "year" ? "/yr" : "/mo"}
              </span>
            </div>
            <p className="t-body mt-2">{plan.headline}</p>
            <p className="t-data mt-2" style={{ color: "var(--color-fg-3)" }}>
              {plan.users} users · {plan.activeJobs === null ? "unlimited" : plan.activeJobs} active
              jobs · {plan.jurisdictionsWatched} jurisdictions watched
            </p>
            {interval === "year" && (
              <p className="t-secondary mt-1">
                {money(Math.round(price / 12))} a month, {money(annualSavingCents(id))} saved against
                monthly.
              </p>
            )}
            <ul className="mt-3 flex flex-col gap-1">
              {plan.features.map((feature) => (
                <li key={feature} className="t-secondary">
                  {feature}
                </li>
              ))}
            </ul>

            <form action={checkout} className="mt-4">
              <input type="hidden" name="plan" value={id} />
              <input type="hidden" name="interval" value={interval} />
              <button
                type="submit"
                className={isCurrent && interval === currentInterval ? "btn btn-secondary btn-full" : "btn btn-primary btn-full"}
                disabled={checkingOut || !billingConfigured}
              >
                {checkingOut
                  ? "Opening Stripe…"
                  : isCurrent && interval === currentInterval
                    ? "Your current plan"
                    : hasSubscription
                      ? `Switch to ${plan.name}`
                      : `Choose ${plan.name}`}
              </button>
            </form>
          </article>
        );
      })}

      {checkoutState.error && (
        <p className="t-secondary mt-4" role="alert" style={{ color: "var(--color-signal-red)" }}>
          {checkoutState.error}
        </p>
      )}

      {creditApplicableCents > 0 && (
        <section className="card mt-6">
          <p className="t-label">Contribution credit</p>
          <p className="t-body mt-2">
            <span className="t-mono">{money(creditApplicableCents)}</span> can go against your next
            invoice
            {creditCarriedCents > 0 && (
              <>
                {" "}
                and <span className="t-mono">{money(creditCarriedCents)}</span> carries forward — the
                cap is half an invoice
              </>
            )}
            .
          </p>
          <form action={applyCredit} className="mt-3">
            <button type="submit" className="btn btn-secondary" disabled={applyingCredit || !billingConfigured}>
              {applyingCredit ? "Applying…" : "Apply to next invoice"}
            </button>
          </form>
          {creditState.error && (
            <p className="t-secondary mt-2" role="alert" style={{ color: "var(--color-signal-red)" }}>
              {creditState.error}
            </p>
          )}
          {creditState.ok && (
            <p className="t-secondary mt-2" style={{ color: "var(--color-brick)" }}>
              {creditState.ok}
            </p>
          )}
        </section>
      )}

      {hasSubscription && (
        <form action={portal} className="mt-6">
          <button type="submit" className="btn btn-secondary btn-full" disabled={openingPortal || !billingConfigured}>
            {openingPortal ? "Opening…" : "Manage card and invoices"}
          </button>
          {portalState.error && (
            <p className="t-secondary mt-2" role="alert" style={{ color: "var(--color-signal-red)" }}>
              {portalState.error}
            </p>
          )}
        </form>
      )}
    </>
  );
}
