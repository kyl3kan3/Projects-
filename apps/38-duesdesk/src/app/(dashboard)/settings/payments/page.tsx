import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/plans";
import { stripeConfigured } from "@/lib/stripe";
import { enrollmentStats } from "@/lib/autopay";
import { Notice, Pill } from "@/components/ledger";
import { IconBank, IconCard, IconChevronLeft } from "@/components/icons";
import { connectStripeAction } from "../actions";
import { RefreshConnectForm } from "../SettingsForms";

export const metadata: Metadata = { title: "Stripe for dues" };
export const dynamic = "force-dynamic";

export default async function PaymentsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; refresh?: string }>;
}) {
  const { user, association } = await requireUser();
  const params = await searchParams;
  const canEdit = can(user.role, "settings");
  const configured = stripeConfigured();
  const autopay = await enrollmentStats(association.id);

  return (
    <main className="screen">
      <header className="pt-8">
        <Link href="/settings" className="btn-quiet inline-flex items-center gap-1">
          <IconChevronLeft size={18} />
          Settings
        </Link>
        <h1 className="t-h2 mt-6">Where the dues land.</h1>
        <p className="t-secondary mt-2">
          Association money goes into the association&apos;s own Stripe account. It never passes
          through a DuesDesk balance, which is the only arrangement a volunteer board should accept.
        </p>
      </header>

      {params.connected ? (
        <section className="mt-6">
          <Notice>
            Stripe sent you back here. Use &ldquo;check with Stripe again&rdquo; below to confirm the
            account can accept payments — DuesDesk only believes Stripe, never the redirect.
          </Notice>
        </section>
      ) : null}

      <section className="mt-8">
        <div className="panel p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="t-label">Connected account</p>
              <p className="t-title mt-1">
                {association.stripeAccountId ?? "Not created yet"}
              </p>
            </div>
            {association.stripeAccountReady ? (
              <Pill tone="good">Ready</Pill>
            ) : association.stripeAccountId ? (
              <Pill tone="warn">Onboarding</Pill>
            ) : (
              <Pill tone="quiet">Not started</Pill>
            )}
          </div>

          {!configured ? (
            <div className="mt-4">
              <Notice tone="warn">
                This deployment has no <span className="t-data">STRIPE_SECRET_KEY</span>, so
                onboarding cannot start and online payments are unavailable. Everything else works:
                you can still invoice, record checks, apply fees, and run the delinquency ladder.
              </Notice>
            </div>
          ) : null}

          {canEdit && configured ? (
            <div className="mt-4 flex flex-col gap-4">
              <form action={connectStripeAction}>
                <button className="btn btn-primary btn-full" type="submit">
                  {association.stripeAccountId
                    ? "Continue Stripe onboarding"
                    : "Connect the association's Stripe account"}
                </button>
              </form>
              <RefreshConnectForm />
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="t-h2">What it costs a household</h2>
        <div className="panel mt-4 p-5">
          <div className="flex items-start gap-3 py-2">
            <IconBank size={20} className="green" />
            <div>
              <p className="t-title">Bank transfer (ACH)</p>
              <p className="t-secondary mt-1">
                About 0.8% capped near $5. On $180 quarterly dues that is roughly $1.44. This is the
                option DuesDesk lists first in checkout, on purpose.
              </p>
            </div>
          </div>
          <div className="hairline-t flex items-start gap-3 py-2 pt-3">
            <IconCard size={20} className="ink-2" />
            <div>
              <p className="t-title">Card</p>
              <p className="t-secondary mt-1">
                About 2.9% plus 30 cents — roughly $5.52 on the same $180. Convenient, and worth
                offering, but not the default.
              </p>
            </div>
          </div>
          <p className="t-secondary hairline-t mt-3 pt-3">
            Stripe&apos;s fees, at Stripe&apos;s rates, charged to the association&apos;s own
            account. DuesDesk takes nothing from a dues payment.
          </p>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="t-h2">Autopay</h2>
        <div className="panel mt-4 p-5">
          <p className="t-body">
            {autopay.enrolled} of {autopay.households} households enrolled
            {autopay.ach > 0 ? `, ${autopay.ach} by bank transfer` : ""}.
          </p>
          <p className="t-secondary mt-2">
            Households enrol themselves from their own payment link, and only after an emailed
            step-up confirms they control the inbox — a forwarded link is never enough to store a
            bank account against a household.
          </p>
          <p className="t-secondary mt-2">
            On each due date every enrolled household is charged exactly once. A failure retries once
            three days later, then the invoice becomes an ordinary unpaid invoice on the reminder
            ladder and the treasurer is emailed. There is no silent gap.
          </p>
        </div>
      </section>
    </main>
  );
}
