import type { Metadata } from "next";
import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireFirm } from "@/lib/auth";
import { PAID_PLANS, PLANS, TRIAL_DAYS, formatPriceCents, plan } from "@/lib/plans";
import { has } from "@/lib/env";
import { StatusPill } from "@/components/StatusPill";
import { Check } from "@/components/icons";
import { BillingButton } from "./BillingButtons";
import { checkoutAction, portalAction } from "./actions";

export const metadata: Metadata = { title: "Plans and payment" };

const UPGRADE_REASONS: Record<string, string> = {
  workspace:
    "Pursuits, go/no-go scorecards and the answer library are included on Pursuit and above. Every plan keeps all the discovery feeds.",
  seats: "You are at your plan's seat limit. The next tier up adds more.",
  profiles: "Multi-profile portfolios are a Capture feature.",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ upgrade?: string; checkout?: string }>;
}) {
  const { firm, user, access, planName } = await requireFirm();
  const { upgrade, checkout } = await searchParams;
  const db = getDb();
  const [{ count: seatCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.firmId, firm.id));

  const current = plan(access.planId);
  const stripeConfigured = has("STRIPE_SECRET_KEY");
  const isAdmin = user.role === "admin";

  return (
    <main className="pt-4">
      <h1 className="t-h2">Plans and payment</h1>
      <p className="t-secondary mt-2">
        Currently on {planName}
        {access.planId === "trial" && access.trialDaysLeft !== null
          ? ` — ${access.trialDaysLeft} day${access.trialDaysLeft === 1 ? "" : "s"} of the ${TRIAL_DAYS}-day trial left`
          : ""}
        . {seatCount} seat{seatCount === 1 ? "" : "s"} in use of {current.seats}.
      </p>

      {checkout === "success" && (
        <p role="status" className="t-secondary mt-3" style={{ color: "var(--color-green-text)" }}>
          Checkout complete. The plan updates as soon as Stripe&apos;s webhook lands — usually within
          seconds. Reload if this page still shows the old tier.
        </p>
      )}
      {checkout === "cancelled" && (
        <p className="t-secondary mt-3">Checkout cancelled. Nothing was charged.</p>
      )}
      {upgrade && UPGRADE_REASONS[upgrade] && (
        <div className="card p-4 mt-4">
          <p className="t-body">{UPGRADE_REASONS[upgrade]}</p>
        </div>
      )}
      {access.reason && (
        <p className="t-secondary mt-3" style={{ color: "var(--color-amber-text)" }}>
          {access.reason}
        </p>
      )}

      {!stripeConfigured && (
        <div className="card p-4 mt-4">
          <p className="t-body">
            Stripe is not configured in this environment, so checkout is unavailable. Set{" "}
            <code className="t-mono">STRIPE_SECRET_KEY</code> and the three{" "}
            <code className="t-mono">STRIPE_PRICE_*</code> ids from <code className="t-mono">.env.example</code>.
          </p>
        </div>
      )}

      <section className="mt-6 flex flex-col gap-4 md:grid md:grid-cols-3">
        {PAID_PLANS.map((id) => {
          const tier = PLANS[id];
          const isCurrent = access.planId === id;
          return (
            <article key={id} className="card p-4 flex flex-col">
              <div className="flex items-start gap-2">
                <h2 className="t-title flex-1">{tier.name}</h2>
                {isCurrent && <StatusPill label="current" tone="accent" />}
              </div>
              <p className="t-stat mt-2" style={{ fontSize: "2rem" }}>
                {formatPriceCents(tier.priceCents)}
                <span className="t-secondary"> /mo</span>
              </p>
              <p className="t-secondary mt-1">
                {tier.seats} seats · {tier.profiles} profile{tier.profiles === 1 ? "" : "s"}
              </p>
              <p className="t-secondary mt-2">{tier.blurb}</p>

              <ul className="list-none p-0 mt-3 flex flex-col gap-2 flex-1">
                {tier.includes.map((line) => (
                  <li key={line} className="t-secondary flex items-start gap-2">
                    <span style={{ color: "var(--color-green-text)" }} className="mt-[2px] shrink-0">
                      <Check size={16} />
                    </span>
                    {line}
                  </li>
                ))}
              </ul>

              <p className="t-secondary mt-3">
                {formatPriceCents(Math.round(tier.priceCents / tier.seats))} per seat per month.
              </p>

              <div className="mt-3">
                {isAdmin && stripeConfigured ? (
                  <BillingButton
                    action={checkoutAction}
                    plan={id}
                    label={isCurrent ? "Current plan" : `Choose ${tier.name}`}
                    pendingLabel="Opening Stripe…"
                    variant={isCurrent ? "secondary" : "primary"}
                  />
                ) : (
                  <button className="btn btn-secondary w-full" disabled>
                    {isAdmin ? "Stripe not configured" : "Ask an admin"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <section className="mt-8">
        <h2 className="t-label">The arithmetic</h2>
        <p className="t-body mt-2" style={{ color: "var(--color-ink-2)" }}>
          The discovery incumbent, Deltek&apos;s GovWin IQ, has no public pricing; reported buyer data
          puts it around $29,000 a year on average. Loopio, on the response side, has a reported median
          near $22,800 a year. Pursuit does both jobs at{" "}
          {formatPriceCents(PLANS.pursuit.priceCents * 12)} a year.
        </p>
        <p className="t-secondary mt-2">
          Annual billing is two months free. One winnable tender found late is five figures; one doomed
          pursuit a scorecard would have killed is a proposal week.
        </p>
      </section>

      {firm.stripeCustomerId && isAdmin && (
        <section className="mt-8">
          <h2 className="t-label">Card, invoices, cancellation</h2>
          <div className="mt-2">
            <BillingButton
              action={portalAction}
              label="Open the Stripe billing portal"
              pendingLabel="Opening…"
              variant="secondary"
            />
          </div>
        </section>
      )}

      <p className="t-secondary mt-8">
        <Link href="/settings" className="btn-quiet">
          Back to settings
        </Link>
      </p>
    </main>
  );
}
