import type { Metadata } from "next";
import Link from "next/link";
import { HeroRidge } from "@/components/marketing/HeroRidge";
import { RevealOnView } from "@/components/marketing/RevealOnView";
import { PLAN_ORDER, PLANS } from "@/lib/plans";
import { POLICY_STATEMENTS } from "@/lib/aws/policy";
import { IconCheck, IconFlare, IconHash, IconPennant, IconPlug } from "@/components/icons";

/**
 * The landing page, built to MARKETING_PLAYBOOK.md.
 *
 * - **Enemy:** not a competitor — the bill you meet for the first time on the
 *   invoice, three weeks after the thing that caused it shipped.
 * - **One sentence:** the ridge is caught the night it starts growing.
 * - **Device:** 9 hours, not 28 days.
 * - **One CTA phrase, repeated verbatim:** "Watch my bill".
 * - **Receipts:** CloudSpend's own synthetic demo estate, labelled as a demo
 *   everywhere it appears. No testimonials, no logos, no usage numbers — this
 *   product is pre-launch and the page says so out loud.
 */

export const metadata: Metadata = {
  title: "CloudSpend — the ridge caught the night it started growing",
  description:
    "Near-real-time AWS cost monitoring for engineering teams: anomaly alerts in Slack with the deploy that caused them, budgets with burn-rate projections, and a dollar-ranked waste report. Flat pricing, never a percentage of your bill.",
};

const CTA = "Watch my bill";

function Cta({ variant = "primary" }: { variant?: "primary" | "secondary" }) {
  return (
    <Link className={`btn btn-${variant} btn-full`} href="/signup" style={{ maxWidth: 340 }}>
      {CTA}
    </Link>
  );
}

export default function LandingPage() {
  return (
    <>
      <div className="page" style={{ paddingBottom: 120 }}>
        {/* ---------------------------------------------------------- hero */}
        <header
          className="gutter"
          style={{
            paddingTop: 20,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span className="t-label" style={{ color: "var(--color-steel)" }}>
            CloudSpend
          </span>
          <Link
            href="/login"
            className="t-secondary"
            style={{
              color: "var(--color-text-2)",
              minHeight: 44,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Sign in
          </Link>
        </header>

        <section className="gutter" style={{ paddingTop: 32 }}>
          <h1 className="t-h2" style={{ fontSize: "clamp(28px, 8vw, 44px)", lineHeight: 1.1 }}>
            Your bill grows a ridge before it becomes a number.
          </h1>
          <p className="t-body" style={{ color: "var(--color-text-2)", marginTop: 16 }}>
            CloudSpend watches AWS spend hour by hour and messages your channel the
            night something starts climbing — with the service, the region, the
            dollar rate, and the deploy that did it.
          </p>

          <div style={{ marginTop: 24 }}>
            <HeroRidge />
          </div>

          <div style={{ marginTop: 24, display: "grid", gap: 12, justifyItems: "start" }}>
            <Cta />
            <p className="t-secondary" style={{ margin: 0 }}>
              Two weeks on Startup. No card. Read-only access, and you can read the
              whole IAM policy before you click anything.
            </p>
          </div>
        </section>

        {/* -------------------------------------------------------- device */}
        <section className="gutter" style={{ paddingTop: 80 }}>
          <RevealOnView>
            <p className="t-label">The whole product, as arithmetic</p>
            <p
              className="t-display"
              style={{
                color: "var(--color-paper)",
                marginTop: 12,
                fontSize: "clamp(34px, 10vw, 56px)",
              }}
            >
              9 hours,
              <br />
              not 28 days.
            </p>
            <p className="t-body" style={{ color: "var(--color-text-2)", marginTop: 16 }}>
              A runaway that starts on the 3rd shows up in Cost Explorer as a slightly
              taller daily bar, and in your invoice on the 1st of next month. Nine
              hours in, it is three GPU instances nobody meant to launch. Twenty-eight
              days in, it is $9,500 and an argument about whose deploy it was.
            </p>
          </RevealOnView>
        </section>

        {/* ---------------------------------------------------------- math */}
        <section className="gutter" style={{ paddingTop: 64 }}>
          <RevealOnView>
            <h2 className="t-label">Your economics, not ours</h2>
            <div style={{ marginTop: 12 }}>
              {[
                ["One runaway caught at hour 9", "$128 spent", "var(--color-text)"],
                ["The same runaway found on the invoice", "$9,520 spent", "var(--color-amber)"],
                ["CloudSpend, Startup tier, for a year", "$1,188", "var(--color-text)"],
                ["Difference, one incident", "+$8,204 kept", "var(--color-green)"],
              ].map(([label, figure, color]) => (
                <div key={label} className="row">
                  <span className="t-body" style={{ flex: 1, minWidth: 0 }}>
                    {label}
                  </span>
                  <span className="t-data" style={{ color, flex: "none" }}>
                    {figure}
                  </span>
                </div>
              ))}
            </div>
            <p className="t-secondary" style={{ marginTop: 16 }}>
              The arithmetic uses on-demand list price for three g4dn.xlarge instances
              at $0.526/hour — the exact shape of the incident in the demo above. Your
              numbers will differ; the ratio will not.
            </p>
          </RevealOnView>
        </section>

        {/* ------------------------------------------------------ receipts */}
        <section className="gutter" style={{ paddingTop: 80 }}>
          <RevealOnView>
            <h2 className="t-h2">What lands in your channel</h2>
            <p className="t-secondary" style={{ marginTop: 8, marginBottom: 20 }}>
              Not &ldquo;spend is up&rdquo;. The dollar rate, when it started, the
              resource, the commit — and two buttons.
            </p>

            {/* The Slack card, mirrored from the product's own Block Kit builder. */}
            <div className="card" style={{ padding: 16 }}>
              <p className="t-title" style={{ margin: 0 }}>
                Cost anomaly — EC2 in us-east-1
              </p>
              <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                <div>
                  <p className="t-label">Delta</p>
                  <p className="t-data" style={{ color: "var(--color-amber)", marginTop: 4 }}>
                    +$340/day vs baseline
                  </p>
                </div>
                <div>
                  <p className="t-label">Since</p>
                  <p className="t-data" style={{ color: "var(--color-text)", marginTop: 4 }}>
                    Tue 16:00 UTC (9h)
                  </p>
                </div>
                <div>
                  <p className="t-label">Probable cause</p>
                  <p className="t-data" style={{ color: "var(--color-text)", marginTop: 4 }}>
                    Deploy 9f3c2ab of api-server, 2h before onset
                  </p>
                  <p className="t-data" style={{ color: "var(--color-text-3)", marginTop: 4 }}>
                    i-09f3c2ab7d41e8b60 · g4dn.xlarge · +$212/DAY
                  </p>
                </div>
              </div>
              <p className="t-data" style={{ color: "var(--color-text-3)", marginTop: 16 }}>
                CloudSpend · demo data · acct 4821-prod
              </p>
              <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
                <span className="btn btn-primary btn-full" aria-hidden="true">
                  <IconCheck size={18} />
                  Ack
                </span>
                <span className="btn btn-secondary btn-full" aria-hidden="true">
                  Investigate
                </span>
              </div>
            </div>
            <p className="t-secondary" style={{ marginTop: 12, color: "var(--color-text-3)" }}>
              A rendering of CloudSpend&rsquo;s own alert, from the demo estate above.
              Ack in Slack and the message edits itself in place; the dashboard already
              agrees.
            </p>
          </RevealOnView>
        </section>

        {/* ------------------------------------------------ the four things */}
        <section className="gutter" style={{ paddingTop: 80 }}>
          <h2 className="t-h2">Four screens, and none of them are for finance</h2>
          <div style={{ marginTop: 20 }}>
            {[
              {
                Icon: IconFlare,
                title: "Anomalies, not dashboards",
                body: "A service has to stay above its own day-of-week and hour baseline for four hours, and be worth at least $5 a day, before it says anything. That is what keeps it under one alert per account per week.",
              },
              {
                Icon: IconPennant,
                title: "The deploy on the timeline",
                body: "Point a GitHub webhook or one curl at CloudSpend and every deploy becomes a pennant. When a ridge starts inside six hours of one, the alert names the commit — and it never blames a deploy that landed after the spike.",
              },
              {
                Icon: IconHash,
                title: "Slack-native, no siren",
                body: "Severity is a label and a figure. Ack and Investigate are ordinary buttons. Nothing in this product has ever sent an emoji.",
              },
              {
                Icon: IconPlug,
                title: "Read-only in five minutes",
                body: "A CloudFormation quick-create with a unique external id. Cost reads, describe calls, CloudWatch metrics. It cannot start, stop, modify or delete anything you own.",
              },
            ].map(({ Icon, title, body }) => (
              <div key={title} className="row" style={{ alignItems: "flex-start", gap: 12 }}>
                <span style={{ flex: "none", color: "var(--color-steel)", paddingTop: 2 }}>
                  <Icon size={20} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="t-title" style={{ display: "block" }}>
                    {title}
                  </span>
                  <span className="t-secondary" style={{ display: "block", marginTop: 4 }}>
                    {body}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------ objection killer */}
        <section className="gutter" style={{ paddingTop: 80 }}>
          <h2 className="t-h2">&ldquo;Read-only is still access.&rdquo;</h2>
          <p className="t-body" style={{ color: "var(--color-text-2)", marginTop: 12 }}>
            Correct. So here is the entire policy the stack creates, with the reason
            for every line. If a permission does not have a reason you accept, we
            should not have it.
          </p>
          <div style={{ marginTop: 16 }}>
            {POLICY_STATEMENTS.map((statement) => (
              <div key={statement.sid} className="row" style={{ alignItems: "flex-start" }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="t-data" style={{ display: "block", color: "var(--color-text)" }}>
                    {statement.actions.join("  ")}
                  </span>
                  <span className="t-secondary" style={{ display: "block", marginTop: 4 }}>
                    {statement.why}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <p className="t-secondary" style={{ marginTop: 16 }}>
            The S3 statement is scoped to the one bucket and prefix you name, and is
            omitted entirely until you name one. There is no write permission in the
            policy at all.
          </p>
        </section>

        {/* ------------------------------------------------------- pricing */}
        <section className="gutter" style={{ paddingTop: 80 }}>
          <RevealOnView>
            <h2 className="t-h2">Flat. Never a percentage of your bill.</h2>
            <p className="t-body" style={{ color: "var(--color-text-2)", marginTop: 12 }}>
              The FinOps suites price as a share of what you spend, which means their
              revenue falls when they do their job. Ours does not move.
            </p>
            <div style={{ marginTop: 24, display: "grid", gap: 16 }}>
              {PLAN_ORDER.map((id) => {
                const plan = PLANS[id];
                return (
                  <div key={id} className="card" style={{ padding: 16 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        gap: 12,
                      }}
                    >
                      <span className="t-title">{plan.name}</span>
                      <span className="t-data-lg" style={{ color: "var(--color-paper)" }}>
                        ${plan.priceMonthly}
                        <span className="t-data" style={{ color: "var(--color-text-3)" }}>
                          /MO
                        </span>
                      </span>
                    </div>
                    <p className="t-secondary" style={{ marginTop: 8 }}>
                      {plan.blurb}
                    </p>
                    <p className="t-data" style={{ color: "var(--color-text-3)", marginTop: 8 }}>
                      {plan.accounts === 1 ? "1 ACCOUNT" : `${plan.accounts} ACCOUNTS`} · $
                      {(plan.priceMonthly * 12).toLocaleString("en-US")}/YEAR
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="t-secondary" style={{ marginTop: 16 }}>
              At $30k a month of AWS, a tool priced at 2% of spend costs $600 a month.
              Startup is $99, whatever your bill does next.
            </p>
            <div style={{ marginTop: 24 }}>
              <Cta />
            </div>
          </RevealOnView>
        </section>

        {/* ---------------------------------------------------- honest note */}
        <section className="gutter" style={{ paddingTop: 64 }}>
          <h2 className="t-label">Two things we will not pretend about</h2>
          <div style={{ marginTop: 12 }}>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="t-title" style={{ display: "block" }}>
                  AWS cost data lags
                </span>
                <span className="t-secondary" style={{ display: "block", marginTop: 4 }}>
                  Cost Explorer serves hourly figures with a delay, and the Cost &amp;
                  Usage Report lands 8–24 hours behind. CloudSpend catches a ridge in
                  hours, not minutes, and every screen shows the hour its data actually
                  reaches.
                </span>
              </span>
            </div>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="t-title" style={{ display: "block" }}>
                  We are pre-launch
                </span>
                <span className="t-secondary" style={{ display: "block", marginTop: 4 }}>
                  There are no customer logos on this page and no usage numbers,
                  because there are none to show yet. Every figure above comes from our
                  own synthetic estate and is labelled as a demo. The first three real
                  case studies will be named, with permission, when they exist.
                </span>
              </span>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ final CTA */}
        <section className="gutter" style={{ paddingTop: 80 }}>
          <h2 className="t-h2">Catch the next ridge the night it starts.</h2>
          <p className="t-body" style={{ color: "var(--color-text-2)", marginTop: 12 }}>
            Connect a read-only role, and the next thing that climbs arrives in your
            channel with the commit attached.
          </p>
          <div style={{ marginTop: 24 }}>
            <Cta />
          </div>
          <p className="t-secondary" style={{ marginTop: 32, color: "var(--color-text-3)" }}>
            CloudSpend · cost monitoring for engineering teams ·{" "}
            <Link href="/login" style={{ color: "var(--color-steel)" }}>
              Sign in
            </Link>
          </p>
        </section>
      </div>

      {/* The sticky mobile CTA: the same words, in the thumb zone. */}
      <div className="thumb-bar" style={{ bottom: 0 }}>
        <Link className="btn btn-primary btn-full" href="/signup">
          {CTA}
        </Link>
      </div>
    </>
  );
}
