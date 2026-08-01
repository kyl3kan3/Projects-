import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getSubscription } from "@/lib/billing";
import { countClientPortals } from "@/lib/portals";
import { PAID_PLANS, PLANS, plan } from "@/lib/plans";
import { stripeConfigured } from "@/lib/invoices";
import { stampDate } from "@/lib/format";
import { ActionForm } from "@/components/ActionForm";
import { SignageChip } from "@/components/SignageChip";
import { billingPortalAction, checkoutAction, connectStripeAction } from "../actions";

export const metadata: Metadata = { title: "Plan and billing" };

const LINES: Record<string, string[]> = {
  solo: ["10 client portals", "Your logo and colours", "Your own portal domain"],
  agency: [
    "50 client portals",
    "Full white-label — no ClientDock anywhere",
    "Client-side e-approvals with an audit trail",
    "Stripe invoices paid inside the portal",
    "Notifications from your own domain",
  ],
  studio: ["Unlimited portals", "Team roles", "Per-client adoption analytics", "Everything in Agency"],
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string; connected?: string }>;
}) {
  const { workspace } = await requireUser();
  const query = await searchParams;
  const subscription = await getSubscription(workspace.id);
  const current = plan(workspace.plan);
  const portalCount = await countClientPortals(workspace.id);
  const stripeReady = stripeConfigured();

  return (
    <main className="screen screen-app" style={{ maxWidth: 640 }}>
      <header className="pt-10 pb-6">
        <Link href="/settings" className="btn-quiet">
          Settings
        </Link>
        <h1 className="t-display mt-4">Plan and billing</h1>
        <p className="t-secondary mt-3">
          Priced per business. Add the whole team and the number doesn&apos;t move — the thing
          incumbents charge per internal seat for.
        </p>
      </header>

      {query.upgraded ? (
        <p className="t-secondary mb-6" style={{ color: "var(--color-green)" }}>
          Payment received. Your plan updates the moment Stripe confirms the subscription.
        </p>
      ) : null}
      {query.connected ? (
        <p className="t-secondary mb-6" style={{ color: "var(--color-green)" }}>
          Stripe connected. Invoices you raise now carry a payment link into the portal.
        </p>
      ) : null}

      <section className="card p-5">
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1">
            <span className="t-title block">{current.name}</span>
            <span className="t-data mt-1 block" style={{ color: "var(--color-ink-2)" }}>
              ${current.priceMonthly}/MO · {portalCount} OF{" "}
              {current.portals === Number.POSITIVE_INFINITY ? "∞" : current.portals} PORTALS
            </span>
          </span>
          <SignageChip tone={workspace.plan === "trial" ? "amber" : "green"}>
            {workspace.plan === "trial" ? "trial" : (subscription?.status ?? "active")}
          </SignageChip>
        </div>
        {workspace.plan === "trial" && workspace.trialEndsAt ? (
          <p className="t-data mt-3" style={{ color: "var(--color-ink-3)" }}>
            TRIAL ENDS {stampDate(workspace.trialEndsAt)}
          </p>
        ) : null}
        {subscription?.currentPeriodEnd ? (
          <p className="t-data mt-3" style={{ color: "var(--color-ink-3)" }}>
            {subscription.cancelAtPeriodEnd ? "ENDS" : "RENEWS"}{" "}
            {stampDate(subscription.currentPeriodEnd)}
          </p>
        ) : null}
        {subscription ? (
          <ActionForm
            action={billingPortalAction}
            submitLabel="Manage card and invoices"
            variant="secondary"
            className="mt-4 flex flex-col gap-3"
          />
        ) : null}
      </section>

      {!stripeReady ? (
        <p className="t-secondary mt-6" style={{ color: "var(--color-amber)" }}>
          Stripe isn&apos;t configured on this deployment, so checkout will refuse rather than fail
          halfway. Set STRIPE_SECRET_KEY and the three price IDs.
        </p>
      ) : null}

      <section className="mt-8">
        <p className="t-label mb-3">Plans</p>
        {PAID_PLANS.map((id) => {
          const p = PLANS[id];
          const isCurrent = workspace.plan === id;
          return (
            <div key={id} className="hairline-b py-5">
              <div className="flex items-baseline gap-3">
                <span className="t-h2 flex-1">{p.name}</span>
                <span className="t-data">${p.priceMonthly}/MO</span>
              </div>
              <ul className="mt-3">
                {LINES[id].map((line) => (
                  <li key={line} className="t-secondary py-1">
                    {line}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <p className="t-label mt-3" style={{ color: "var(--color-green)" }}>
                  your plan
                </p>
              ) : (
                <ActionForm
                  action={checkoutAction}
                  hiddenFields={{ plan: id }}
                  submitLabel={`Move to ${p.name}`}
                  pendingLabel="Opening Stripe…"
                  variant={id === "agency" ? "primary" : "secondary"}
                  className="mt-4 flex flex-col gap-3"
                />
              )}
            </div>
          );
        })}
      </section>

      <section className="hairline-t mt-8 py-6">
        <p className="t-label mb-1">Your Stripe account</p>
        <p className="t-secondary mb-3">
          Invoices are raised on your account through Connect, so client payments go straight to you.
          The money never touches us.
        </p>
        {workspace.stripeConnectId ? (
          <p className="t-data" style={{ color: "var(--color-ink-2)" }}>
            CONNECTED · {workspace.stripeConnectId}
          </p>
        ) : (
          <ActionForm
            action={connectStripeAction}
            submitLabel="Connect Stripe"
            pendingLabel="Opening Stripe…"
            variant="secondary"
          />
        )}
      </section>

      <p className="t-secondary mt-6">
        A downgrade never deletes a portal. Anything over the new limit is archived — the newest
        first — and comes straight back when you upgrade again.
      </p>
    </main>
  );
}
