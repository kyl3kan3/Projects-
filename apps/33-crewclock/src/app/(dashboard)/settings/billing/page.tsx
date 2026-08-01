import type { Metadata } from "next";
import Link from "next/link";
import { requireOffice } from "@/lib/auth";
import { formatMoney, t } from "@/lib/i18n";
import {
  MONTHLY_FLOOR_CENTS,
  floorAdjustmentCents,
  monthlyInvoiceCents,
  planSpec,
  seatSubtotalCents,
  trialDaysLeft,
} from "@/lib/plans";
import { activeSeatCount, billingConfigured, getSubscription } from "@/lib/stripe";
import { checkoutAction, portalAction } from "../actions";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

/**
 * Billing, with the arithmetic on screen.
 *
 * The floor is the one thing about this pricing that surprises people, so the
 * page shows the multiplication and names the adjustment rather than presenting
 * a total the owner has to reverse-engineer.
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string; error?: string }>;
}) {
  const { user, org } = await requireOffice();
  const locale = user.locale;
  const params = await searchParams;

  const seats = await activeSeatCount(org.id);
  const subscription = await getSubscription(org.id);
  const spec = planSpec(org.plan);
  const subtotal = seatSubtotalCents(org.plan, seats);
  const total = monthlyInvoiceCents(org.plan, seats);
  const adjustment = floorAdjustmentCents(org.plan, seats);
  const daysLeft = trialDaysLeft(org.trialEndsAt);
  const configured = billingConfigured();

  return (
    <main className="screen">
      <header className="pt-8 pb-5">
        <p className="t-label">{org.name}</p>
        <h1 className="t-h2 mt-2">{t(locale, "billing.title")}</h1>
        <p className="t-secondary mt-1">
          {subscription
            ? `${spec.name} · ${subscription.status}`
            : daysLeft > 0
              ? t(locale, "billing.trial", { days: daysLeft })
              : t(locale, "billing.trialEnded")}
        </p>
      </header>

      <section className="panel mb-6 p-5">
        <div className="flex items-baseline justify-between">
          <span className="t-label">{t(locale, "billing.thisMonth")}</span>
          <span className="t-data-lg">{formatMoney(total, locale)}</span>
        </div>
        <p className="t-secondary mt-3">
          {adjustment > 0
            ? t(locale, "billing.floorNote", {
                seats,
                unit: formatMoney(spec.seatPriceCents, locale, true),
                subtotal: formatMoney(subtotal, locale),
                floor: formatMoney(MONTHLY_FLOOR_CENTS, locale),
              })
            : t(locale, "billing.noFloorNote", {
                seats,
                unit: formatMoney(spec.seatPriceCents, locale, true),
                subtotal: formatMoney(subtotal, locale),
              })}
        </p>
      </section>

      {params.upgraded ? (
        <p className="t-secondary mb-4" role="status" style={{ color: "var(--accent)" }}>
          {t(locale, "settings.saved")}
        </p>
      ) : null}
      {params.error === "not_configured" || !configured ? (
        <p className="t-secondary mb-4" style={{ color: "var(--fg-2)" }}>
          {t(locale, "billing.notConfigured")}
        </p>
      ) : null}

      <section className="mb-8">
        {(["crew", "company"] as const).map((planId) => {
          const candidate = planSpec(planId);
          const current = org.plan === planId;
          return (
            <div key={planId} className="row items-start">
              <div className="min-w-0 flex-1">
                <p className="t-title">
                  {candidate.name}
                  {current ? " · " : ""}
                  {current ? (
                    <span className="t-secondary">{t(locale, "billing.plan")}</span>
                  ) : null}
                </p>
                <p className="t-data mt-1" style={{ color: "var(--fg-2)" }}>
                  {formatMoney(candidate.seatPriceCents, locale, true)}/user ·{" "}
                  {formatMoney(MONTHLY_FLOOR_CENTS, locale)} minimum
                </p>
                <p className="t-secondary mt-1">
                  {planId === "crew"
                    ? "Geofenced punches, offline capture, EN/ES crew app, review and approve, overtime alerts, ADP and Gusto export."
                    : "Everything in Crew, plus bids, live labor cost against them, and the 80% and 100% budget alerts."}
                </p>
              </div>
              {!current && configured ? (
                <form action={checkoutAction} className="shrink-0">
                  <input type="hidden" name="plan" value={planId} />
                  <button className="chip" type="submit">
                    {t(locale, "billing.upgrade", { plan: candidate.name })}
                  </button>
                </form>
              ) : null}
            </div>
          );
        })}
      </section>

      {subscription && configured ? (
        <form action={portalAction} className="pb-4">
          <button className="btn btn-secondary" type="submit">
            {t(locale, "billing.manage")}
          </button>
        </form>
      ) : null}

      <p className="t-secondary pb-4">
        <Link href="/settings" style={{ color: "var(--fg-2)" }}>
          ← {t(locale, "settings.title")}
        </Link>
      </p>
    </main>
  );
}
