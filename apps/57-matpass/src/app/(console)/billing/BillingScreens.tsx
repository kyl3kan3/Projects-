"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { Empty, Pill, SectionHead } from "@/components/ui";
import { formatMoney } from "@/lib/plans";
import {
  addFamilyAction,
  archivePlanAction,
  connectAction,
  createPlanAction,
  pauseAction,
  subscribeAction,
} from "./actions";

export interface PlanRow {
  id: string;
  name: string;
  amountCents: number;
  interval: "month" | "year";
  kind: "per_student" | "family_flat";
}

export interface FamilyRow {
  id: string;
  name: string;
  email: string | null;
  students: { id: string; name: string }[];
  subscription: {
    id: string;
    status: string;
    planName: string;
    amountCents: number;
    interval: string;
    coveredCount: number;
    currentPeriodEnd: string | null;
  } | null;
}

export function BillingScreens({
  canManage,
  connected,
  plans,
  families,
}: {
  canManage: boolean;
  connected: boolean;
  plans: PlanRow[];
  families: FamilyRow[];
}) {
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [addingPlan, setAddingPlan] = useState(false);
  const [addingFamily, setAddingFamily] = useState(false);

  return (
    <>
      {canManage ? (
        <>
          <SectionHead>Your Stripe account</SectionHead>
          {connected ? (
            <p className="t-secondary">
              Connected. Tuition is charged on your account and settles to your bank — MatPass takes
              no cut of it and never holds it.
            </p>
          ) : (
            <div className="card" style={{ padding: 16 }}>
              <p className="t-secondary">
                Connect your own Stripe account and tuition bills there. No platform balance, no
                markup on processing — your money goes where it always did.
              </p>
              <div style={{ marginTop: 12 }}>
                <ActionForm action={connectAction} submitLabel="Connect Stripe" variant="secondary" />
              </div>
            </div>
          )}
        </>
      ) : null}

      <SectionHead
        right={
          canManage ? (
            <button type="button" className="btn-quiet" onClick={() => setAddingPlan(!addingPlan)}>
              {addingPlan ? "Close" : "New plan"}
            </button>
          ) : undefined
        }
      >
        Membership plans
      </SectionHead>

      {plans.length === 0 && !addingPlan ? (
        <p className="t-secondary fg-3">
          No plans yet. A per-student plan multiplies by covered students; a family rate is one charge
          for the household however many train.
        </p>
      ) : (
        <div>
          {plans.map((plan) => (
            <div key={plan.id} className="row">
              <div style={{ flex: 1 }}>
                <p className="t-title">{plan.name}</p>
                <p className="t-data fg-2" style={{ marginTop: 2 }}>
                  {formatMoney(plan.amountCents)} / {plan.interval} ·{" "}
                  {plan.kind === "family_flat" ? "family rate" : "per student"}
                </p>
              </div>
              {canManage ? (
                <ActionForm
                  action={archivePlanAction}
                  submitLabel="Archive"
                  variant="quiet"
                  hiddenFields={{ planId: plan.id }}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}

      {addingPlan ? (
        <div className="card sheet-enter" style={{ padding: 16, marginTop: 16 }}>
          <ActionForm action={createPlanAction} submitLabel="Create plan">
            <div className="field">
              <label className="t-label" htmlFor="pname">
                Name
              </label>
              <input
                id="pname"
                name="name"
                className="input"
                required
                placeholder="Family unlimited"
              />
            </div>
            <div className="split-even">
              <div className="field">
                <label className="t-label" htmlFor="pamount">
                  Amount
                </label>
                <input
                  id="pamount"
                  name="amount"
                  className="input input-mono"
                  required
                  placeholder="149"
                  inputMode="decimal"
                />
              </div>
              <div className="field">
                <label className="t-label" htmlFor="pinterval">
                  Every
                </label>
                <select id="pinterval" name="interval" className="input" defaultValue="month">
                  <option value="month">Month</option>
                  <option value="year">Year</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label className="t-label" htmlFor="pkind">
                Charged
              </label>
              <select id="pkind" name="kind" className="input" defaultValue="per_student">
                <option value="per_student">Per student</option>
                <option value="family_flat">One family rate</option>
              </select>
            </div>
          </ActionForm>
        </div>
      ) : null}

      <SectionHead
        right={
          canManage ? (
            <button
              type="button"
              className="btn-quiet"
              onClick={() => setAddingFamily(!addingFamily)}
            >
              {addingFamily ? "Close" : "New household"}
            </button>
          ) : undefined
        }
      >
        Households
      </SectionHead>

      {addingFamily ? (
        <div className="card sheet-enter" style={{ padding: 16, marginBottom: 16 }}>
          <ActionForm action={addFamilyAction} submitLabel="Add household">
            <div className="field">
              <label className="t-label" htmlFor="fname">
                Name
              </label>
              <input
                id="fname"
                name="name"
                className="input"
                required
                placeholder="The Okafor family"
              />
            </div>
            <div className="field">
              <label className="t-label" htmlFor="femail">
                Guardian email
              </label>
              <input
                id="femail"
                name="email"
                type="email"
                className="input"
                placeholder="dayo.okafor@example.com"
              />
              <p className="t-secondary fg-3">
                Invitations, dunning notices and announcements all go here — never to a child.
              </p>
            </div>
            <div className="field">
              <label className="t-label" htmlFor="fphone">
                Phone
              </label>
              <input id="fphone" name="phone" className="input" placeholder="(512) 555-0148" />
            </div>
          </ActionForm>
        </div>
      ) : null}

      {families.length === 0 ? (
        <Empty
          title="No households yet"
          body="Households arrive with the roster import — siblings sharing a surname or a family column collapse into one, with one payment method between them."
        />
      ) : (
        <div>
          {families.map((family) => (
            <div key={family.id} className="row-block">
              <div className="flex items-baseline justify-between gap-3">
                <p className="t-title">{family.name}</p>
                <span style={{ flex: "none" }}>
                  {family.subscription ? (
                    family.subscription.status === "past_due" ? (
                      <Pill tone="warn">Past due</Pill>
                    ) : family.subscription.status === "paused" ? (
                      <Pill tone="warn">Paused</Pill>
                    ) : family.subscription.status === "canceled" ? (
                      <Pill tone="quiet">Cancelled</Pill>
                    ) : (
                      <Pill tone="ok">Paid</Pill>
                    )
                  ) : (
                    <Pill tone="quiet">No plan</Pill>
                  )}
                </span>
              </div>
              <p className="t-secondary fg-3" style={{ marginTop: 2 }}>
                {family.students.length > 0
                  ? family.students.map((s) => s.name).join(", ")
                  : "no students yet"}
                {family.email ? ` · ${family.email}` : " · no email on file"}
              </p>
              {family.subscription ? (
                <p className="t-data fg-2" style={{ marginTop: 6 }}>
                  {family.subscription.planName} · {formatMoney(family.subscription.amountCents)} /{" "}
                  {family.subscription.interval} · covers {family.subscription.coveredCount}
                  {family.subscription.currentPeriodEnd
                    ? ` · next ${family.subscription.currentPeriodEnd}`
                    : ""}
                </p>
              ) : null}

              {canManage ? (
                <div className="flex items-center gap-4" style={{ marginTop: 8, flexWrap: "wrap" }}>
                  {plans.length > 0 && family.students.length > 0 ? (
                    <button
                      type="button"
                      className="btn-quiet"
                      onClick={() => setSubscribing(subscribing === family.id ? null : family.id)}
                    >
                      {family.subscription ? "Change membership" : "Start a membership"}
                    </button>
                  ) : null}
                  {family.subscription && family.subscription.status !== "canceled" ? (
                    <ActionForm
                      action={pauseAction}
                      submitLabel={family.subscription.status === "paused" ? "Resume" : "Pause"}
                      variant="quiet"
                      hiddenFields={{
                        subscriptionId: family.subscription.id,
                        resume: family.subscription.status === "paused" ? "1" : "",
                      }}
                    />
                  ) : null}
                </div>
              ) : null}

              {subscribing === family.id ? (
                <div className="card sheet-enter" style={{ padding: 16, marginTop: 12 }}>
                  <ActionForm
                    action={subscribeAction}
                    submitLabel="Send the payment link"
                    pendingLabel="Sending…"
                    hiddenFields={{ familyId: family.id }}
                  >
                    <div className="field">
                      <label className="t-label" htmlFor={`plan-${family.id}`}>
                        Plan
                      </label>
                      <select
                        id={`plan-${family.id}`}
                        name="membershipPlanId"
                        className="input"
                        required
                      >
                        {plans.map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.name} — {formatMoney(plan.amountCents)}/{plan.interval}
                          </option>
                        ))}
                      </select>
                    </div>
                    <fieldset className="field" style={{ border: "none", padding: 0, margin: 0 }}>
                      <legend className="t-label" style={{ marginBottom: 8 }}>
                        Covers
                      </legend>
                      {family.students.map((student) => (
                        <label
                          key={student.id}
                          className="flex items-center gap-3"
                          style={{ minHeight: 44 }}
                        >
                          <input
                            type="checkbox"
                            name="studentIds"
                            value={student.id}
                            className="check"
                            defaultChecked
                          />
                          <span className="t-body">{student.name}</span>
                        </label>
                      ))}
                    </fieldset>
                    <p className="t-secondary fg-3">
                      The parent enters the card on Stripe&rsquo;s own page. No card field exists
                      anywhere in MatPass.
                    </p>
                  </ActionForm>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
