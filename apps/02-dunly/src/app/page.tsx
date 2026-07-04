import Link from "next/link";
import { ActivityFeed } from "@/components/activity-feed";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icons";
import { ReturnTicker } from "@/components/return-ticker";
import { formatMoney } from "@/lib/format";
import { activityEvents, dashboardStats } from "@/lib/sample-data";

const CTA = "Connect Stripe";

export default function LandingPage() {
  return (
    <main>
      <section className="screen pb-20">
        <div className="shell">
          <header className="flex min-h-11 items-center justify-between">
            <Brand href="/" />
            <Link href="/dashboard" className="btn-quiet min-h-11 text-sm">
              Log in
            </Link>
          </header>

          <div className="mt-12 grid items-center gap-10 lg:grid-cols-[1fr_430px]">
            <div>
              <h1 className="t-display max-w-[12ch]">Recover failed payments before they become churn.</h1>
              <p className="t-body mt-5 max-w-[36ch] text-[var(--color-text-2)]">
                Dunly connects to Stripe, schedules safe retries, sends branded card-update emails, and shows which
                dollars came back because of you.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link href="/connect" className="btn btn-primary">
                  {CTA}
                </Link>
                <Link href="/dashboard" className="btn btn-secondary">
                  Watch dollars return
                </Link>
              </div>
              <p className="t-secondary mt-3">14-day trial. No free tier. The recovery preview sells itself.</p>
            </div>

            <div className="panel p-5">
              <div className="flex items-center justify-between gap-4">
                <p className="t-label">Recovered this period</p>
                <span className="status">
                  <span className="dot dot-banknote" />
                  <span className="t-label text-[var(--color-text)]">Live</span>
                </span>
              </div>
              <div className="mt-5">
                <ReturnTicker cents={dashboardStats.recoveredByDunlyCents} />
              </div>
              <div className="mt-8 grid grid-cols-2 gap-3">
                <div className="rounded-[8px] border border-[var(--color-hairline)] p-3">
                  <p className="t-label">At risk</p>
                  <p className="money mt-2 text-[var(--color-amber)]">{formatMoney(dashboardStats.atRiskMrrCents)}</p>
                </div>
                <div className="rounded-[8px] border border-[var(--color-hairline)] p-3">
                  <p className="t-label">In recovery</p>
                  <p className="money mt-2">{dashboardStats.activeFailures} invoices</p>
                </div>
              </div>
              <div className="mt-5">
                <ActivityFeed events={activityEvents.slice(0, 3)} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[var(--color-hairline)] px-5 py-16">
        <div className="shell grid gap-8 md:grid-cols-3">
          {[
            ["Retry safely", "Dunly suppresses retries when Stripe Smart Retries are active, then uses idempotency keys on every charge attempt."],
            ["Message cleanly", "Default dunning and card-expiry sequences use signed card-update links and per-domain deliverability controls."],
            ["Attribute honestly", "Baseline recoveries stay visible, but only Dunly-touched dollars count toward ROI and Performance billing."],
          ].map(([title, body]) => (
            <article key={title} className="hairline-top pt-5">
              <h2 className="t-title">{title}</h2>
              <p className="t-secondary mt-2">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="px-5 py-16">
        <div className="shell grid gap-10 md:grid-cols-[1fr_1.1fr]">
          <div>
            <h2 className="t-h2">The proof is the ledger.</h2>
            <p className="t-body mt-3 max-w-[42ch] text-[var(--color-text-2)]">
              The dashboard separates recovered-by-Dunly from would-have-recovered-anyway. That conservative number is
              why the subscription line item survives budget review.
            </p>
            <Link href="/statement" className="btn btn-secondary mt-6">
              <Icon name="download" className="h-[18px] w-[18px]" />
              View ROI statement
            </Link>
          </div>
          <div className="grid gap-3">
            {[
              ["Starter", "$49", "Up to $25k MRR. Smart retries, email dunning, card-update page."],
              ["Growth", "$149", "Up to $100k MRR. Adds SMS, pre-dunning, sender domain."],
              ["Scale", "$299", "Up to $500k MRR. Multi-account and priority support path."],
              ["Performance", "25%", "Recovered revenue share, capped at $2,000/mo."],
            ].map(([plan, price, detail]) => (
              <div key={plan} className="row grid grid-cols-[1fr_auto] gap-4">
                <div>
                  <h3 className="font-semibold">{plan}</h3>
                  <p className="t-secondary mt-1">{detail}</p>
                </div>
                <p className="money text-lg">{price}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-20">
        <div className="shell panel p-5 text-center">
          <h2 className="t-h2">Find the revenue already leaking out of Stripe.</h2>
          <Link href="/connect" className="btn btn-primary mt-5">
            {CTA}
          </Link>
        </div>
      </section>
    </main>
  );
}
