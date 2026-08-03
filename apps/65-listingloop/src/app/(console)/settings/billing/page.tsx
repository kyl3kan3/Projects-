import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { stripeConfigured } from "@/lib/env";
import { countOpenDeals } from "@/lib/deals";
import { PAID_PLANS, formatPlanPrice, planSpec, trialDaysLeft, trialExpired } from "@/lib/plans";
import { ChoosePlanButton, ManageBillingButton } from "./BillingActions";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; plan?: string }>;
}) {
  const { user, account } = await requireSession();
  const params = await searchParams;
  const openCount = await countOpenDeals(account.id);
  const stripeReady = stripeConfigured();
  const isOwner = user.role === "owner";

  return (
    <main className="mx-auto max-w-5xl px-5 pb-24 pt-6 lg:pb-10">
      <p className="t-label">
        <Link href="/settings" className="btn-quiet">
          Settings
        </Link>
      </p>
      <h1 className="t-display mt-2">Plans.</h1>
      <p className="t-body mt-2 text-dim">
        Per desk, not per file. Closed deals never count against the limit, so a busy year does not
        cost you more than a slow one.
      </p>

      {params.checkout === "done" ? (
        <p className="panel mt-6 p-4" role="status">
          <span className="t-body">
            Checkout finished. Stripe confirms by webhook, so the plan on this page updates within
            a few seconds of their callback landing.
          </span>
        </p>
      ) : null}
      {params.checkout === "cancelled" ? (
        <p className="panel mt-6 p-4" role="status">
          <span className="t-body">Checkout cancelled — nothing changed.</span>
        </p>
      ) : null}
      {params.plan === "set" ? (
        <p className="panel mt-6 p-4" role="status">
          <span className="t-body">
            Plan set directly, because this deployment has no Stripe keys.
          </span>
        </p>
      ) : null}

      <section className="mt-8">
        <h2 className="t-label">Now</h2>
        <p className="t-body mt-1">
          {planSpec(account.plan).name}
          {account.plan === "trial"
            ? trialExpired(account)
              ? " — the trial has ended, so the desk is read-only. Exports still work."
              : ` — ${trialDaysLeft(account)} days left, no card on file.`
            : ""}
          {" · "}
          {openCount} active {openCount === 1 ? "file" : "files"}
        </p>
        {account.stripeCustomerId && stripeReady && isOwner ? (
          <div className="mt-3">
            <ManageBillingButton />
          </div>
        ) : null}
        {!stripeReady ? (
          <p className="t-secondary mt-3">
            Stripe is not configured on this deployment. The plans below still apply their limits;
            choosing one writes the plan directly so the gates can be exercised without keys.
          </p>
        ) : null}
        {!isOwner ? (
          <p className="t-secondary mt-3">
            Only the account owner can change billing. Ask {""}
            whoever opened this desk.
          </p>
        ) : null}
      </section>

      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {PAID_PLANS.map((plan) => {
          const spec = planSpec(plan);
          return (
            <section key={plan} className="panel flex flex-col p-5">
              <h2 className="t-h2">{spec.name}</h2>
              <p className="t-stat mt-2">{formatPlanPrice(plan)}</p>
              <p className="t-secondary mt-2">{spec.blurb}</p>
              <ul className="mt-4 flex-1 list-none p-0">
                {spec.features.map((f) => (
                  <li key={f} className="t-body hairline-b py-2">
                    {f}
                  </li>
                ))}
              </ul>
              {isOwner ? (
                <ChoosePlanButton
                  plan={plan}
                  label={stripeReady ? `Choose ${spec.name}` : `Set ${spec.name}`}
                  stripeReady={stripeReady}
                  current={account.plan === plan}
                />
              ) : null}
            </section>
          );
        })}
      </div>

      <section className="mt-10">
        <h2 className="t-h2">What happens if you stop paying</h2>
        <p className="t-body mt-2 text-dim">
          The desk goes read-only: the timelines, the checklists and every document stay exactly
          where they are, and the closing-packet export keeps working. Nothing is deleted and
          nothing is held hostage — anti-lock-in is a promise, not a setting.
        </p>
      </section>
    </main>
  );
}
