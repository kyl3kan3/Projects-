import type { Metadata } from "next";
import Link from "next/link";
import { HeroLadder } from "@/components/marketing/HeroLadder";
import { IconCheck, IconHandshake, IconScales, IconSend } from "@/components/icons";
import { DEFAULT_LADDER, LEVEL_LABEL, offsetLabel } from "@/lib/ladder";
import { PLAN_ORDER, PLANS } from "@/lib/plans";
import { formatMoney } from "@/lib/money";
import { stepCopy } from "@/lib/tone";

/**
 * The marketing page. Message architecture, per MARKETING_PLAYBOOK.md:
 *
 *   Enemy        — doing the work, then waiting 74 days, and the awkwardness of
 *                  asking for money you have already earned.
 *   One sentence — PaidWell asks for your money so you don't have to: politely,
 *                  relentlessly, in your voice.
 *   Device       — Day-74 money in by day 31.
 *   CTA          — "Run your aging audit", repeated verbatim.
 *
 * Every number here is either arithmetic the visitor can check or a cited public
 * statistic. There are no testimonials, no customer logos and no usage claims,
 * because this product is pre-launch and has none to report. The sample emails
 * are the product's own output, rendered by the same code that sends them.
 */

const CTA = "Run your aging audit";

export const metadata: Metadata = {
  title: "PaidWell — day-74 money in by day 31",
  description:
    "Polite, escalating invoice follow-up in your firm's voice, a client payment portal, and a cash-flow forecast built from how your clients actually pay. For agencies and service firms with no AR department.",
};

/** Fill a template with the representative invoice used across this page. */
function sample(text: string, daysOverdue: number): string {
  return text
    .replace(/\{\{contact_first_name\}\}/g, "Dana")
    .replace(/\{\{client_name\}\}/g, "Meridian Co")
    .replace(/\{\{firm_name\}\}/g, "Northbank Studio")
    .replace(/\{\{invoice_number\}\}/g, "INV-2041")
    .replace(/\{\{amount\}\}/g, "$12,400.00")
    .replace(/\{\{due_date\}\}/g, "19 Jun 2026")
    .replace(/\{\{days_overdue\}\}/g, String(Math.max(0, daysOverdue)))
    .replace(/\{\{days_until_due\}\}/g, String(Math.max(0, -daysOverdue)))
    .replace(/\{\{portal_link\}\}/g, "paidwell.app/portal/…")
    .replace(/\{\{signature\}\}/g, "Ana Reyes");
}

export default function LandingPage() {
  return (
    <div style={{ paddingBottom: 96 }}>
      <header className="gutter" style={{ maxWidth: 1120, margin: "0 auto", paddingTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p className="t-label">PaidWell</p>
          <Link href="/login" className="btn-quiet">
            Sign in
          </Link>
        </div>
      </header>

      {/* ---------------------------------------------------------- hero --- */}
      <section
        className="gutter"
        style={{ maxWidth: 1120, margin: "0 auto", paddingTop: 32, paddingBottom: 56 }}
      >
        <div
          style={{
            display: "grid",
            gap: 40,
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            alignItems: "start",
          }}
        >
          <div>
            <h1 className="t-display">Day-74 money, in by day 31.</h1>
            <p
              className="t-body"
              style={{ marginTop: 16, color: "var(--color-text-2)", maxWidth: "60ch" }}
            >
              You did the work. Then net-30 became net-60, and the third nudge never got sent
              because the second one already felt rude. PaidWell asks for your money so you
              don&rsquo;t have to &mdash; politely, relentlessly, in your firm&rsquo;s voice.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 32 }}>
              <Link href="/signup" className="btn btn-primary">
                {CTA}
              </Link>
              <Link href="#ladder" className="btn btn-secondary">
                Read the four emails
              </Link>
            </div>
            <p className="t-secondary" style={{ marginTop: 16 }}>
              No card. Connect read-only, see your real DSO and the exact follow-ups we would
              send &mdash; before a single one goes out.
            </p>
          </div>

          <HeroLadder />
        </div>
      </section>

      {/* -------------------------------------------------------- device --- */}
      <section
        className="gutter"
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          paddingTop: 56,
          paddingBottom: 56,
          borderTop: "1px solid var(--color-hairline)",
        }}
      >
        <p className="t-label">The device</p>
        <div style={{ display: "flex", gap: 20, alignItems: "baseline", flexWrap: "wrap", marginTop: 12 }}>
          <span className="t-stat row-enter" style={{ color: "var(--color-red)" }}>
            74d
          </span>
          <span className="t-stat" style={{ color: "var(--color-text-aa)" }} aria-hidden="true">
            →
          </span>
          <span
            className="t-stat row-enter"
            style={{ color: "var(--color-banker)", animationDelay: "200ms" }}
          >
            31d
          </span>
        </div>
        <p className="t-body" style={{ marginTop: 16, color: "var(--color-text-2)", maxWidth: "60ch" }}>
          Not a promise &mdash; an arithmetic target. Consistent, escalating follow-up is the only
          reliable lever on days-sales-outstanding for a firm with nobody owning collections,
          and it is the exact thing that does not happen when the founder is busy.
        </p>
      </section>

      {/* ----------------------------------------------------- the ladder --- */}
      <section
        id="ladder"
        className="gutter"
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          paddingTop: 56,
          paddingBottom: 56,
          borderTop: "1px solid var(--color-hairline)",
        }}
      >
        <p className="t-label">What actually gets sent</p>
        <h2 className="t-h2" style={{ marginTop: 8 }}>
          Four emails. Each pinned to a date, not to a mood.
        </h2>
        <p className="t-body" style={{ marginTop: 12, color: "var(--color-text-2)", maxWidth: "65ch" }}>
          This is the default ladder&rsquo;s real copy in the warm preset, rendered by the same
          function that sends it. Escalation happens in the wording, never in volume: no
          &ldquo;immediately&rdquo;, no legal language, and the last one says a person takes over
          from here.
        </p>

        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            marginTop: 32,
          }}
        >
          {DEFAULT_LADDER.map((step, index) => {
            const copy = stepCopy("warm", step.escalationLevel);
            return (
              <article key={index} className="panel" style={{ padding: 16 }}>
                <p className="t-label">
                  Step {index + 1} · {offsetLabel(step.offsetDaysFromDue)} ·{" "}
                  {LEVEL_LABEL[step.escalationLevel]}
                </p>
                <p className="t-title" style={{ marginTop: 8 }}>
                  {sample(copy.subject, step.offsetDaysFromDue)}
                </p>
                <p className="t-secondary" style={{ marginTop: 8 }}>
                  {sample(copy.body[1] ?? copy.body[0], step.offsetDaysFromDue)}
                </p>
              </article>
            );
          })}
        </div>
        <p className="t-secondary" style={{ marginTop: 20 }}>
          Three tone presets, and every step editable with merge fields &mdash; a broken template
          is refused before it can reach a client.
        </p>
      </section>

      {/* ------------------------------------------------------- the math --- */}
      <section
        className="gutter"
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          paddingTop: 56,
          paddingBottom: 56,
          borderTop: "1px solid var(--color-hairline)",
        }}
      >
        <p className="t-label">The math</p>
        <h2 className="t-h2" style={{ marginTop: 8 }}>
          One invoice you gave up on pays for a decade of this.
        </h2>
        <div style={{ marginTop: 24, maxWidth: 520 }}>
          {[
            ["A single written-off invoice", formatMoney(1_240_000)],
            ["PaidWell Firm, twelve months", formatMoney(PLANS.firm.priceCents * 12)],
            [
              "What that one invoice covers",
              `${Math.floor(1_240_000 / (PLANS.firm.priceCents * 12))} years`,
            ],
          ].map(([label, value]) => (
            <div key={label} className="row">
              <span className="t-body" style={{ flex: 1 }}>
                {label}
              </span>
              <span className="t-data" style={{ fontSize: 15 }}>
                {value}
              </span>
            </div>
          ))}
        </div>
        <p className="t-secondary" style={{ marginTop: 20, maxWidth: "65ch" }}>
          The wider picture, from public research rather than from us: 56% of US small
          businesses report money owed on unpaid invoices, averaging roughly $17.5k each, and
          late payment costs small firms around $39k a year (
          <a
            href="https://quickbooks.intuit.com/r/small-business-data/small-business-late-payments-report-2025/"
            style={{ color: "var(--color-banker)" }}
          >
            QuickBooks 2025 Late Payments Report
          </a>
          ). Net-30 is the stated term for about 60% of B2B companies while actual North
          American payment takes ~43 days (
          <a
            href="https://www.kaplancollectionagency.com/business-advice/54-statistics-on-the-b2b-payment-delays/"
            style={{ color: "var(--color-banker)" }}
          >
            Kaplan Group
          </a>
          ).
        </p>
      </section>

      {/* --------------------------------------------------- the objection --- */}
      <section
        className="gutter"
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          paddingTop: 56,
          paddingBottom: 56,
          borderTop: "1px solid var(--color-hairline)",
        }}
      >
        <p className="t-label">The objection</p>
        <h2 className="t-h2" style={{ marginTop: 8 }}>
          &ldquo;Will this annoy a client I need?&rdquo;
        </h2>
        <p className="t-body" style={{ marginTop: 12, color: "var(--color-text-2)", maxWidth: "65ch" }}>
          It is the right question, and it is exactly why the default is not autopilot.
        </p>
        <div
          style={{
            display: "grid",
            gap: 24,
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            marginTop: 32,
          }}
        >
          {[
            {
              Icon: IconSend,
              title: "Approval mode is the default",
              body: "Every new firm starts with each send queued for one tap, showing the exact words. Nothing reaches a client until a human agrees to it.",
            },
            {
              Icon: IconHandshake,
              title: "A reply stops everything",
              body: "The moment a client writes back, that invoice's ladder pauses and the thread surfaces for a person. A promise to pay does the same.",
            },
            {
              Icon: IconCheck,
              title: "A paid invoice is never chased",
              body: "The balance is re-read at the moment of sending, not when the queue was built. Mark a client VIP and the machine never writes to them at all.",
            },
            {
              Icon: IconScales,
              title: "One tap stops all of it",
              body: "A single control pauses every sequence for every client. Steps stay pinned to their dates, so nothing floods out when you switch back on.",
            },
          ].map(({ Icon, title, body }) => (
            <article key={title}>
              <Icon size={20} style={{ color: "var(--color-banker)" }} />
              <p className="t-title" style={{ marginTop: 8 }}>
                {title}
              </p>
              <p className="t-secondary" style={{ marginTop: 4 }}>
                {body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------- price --- */}
      <section
        className="gutter"
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          paddingTop: 56,
          paddingBottom: 56,
          borderTop: "1px solid var(--color-hairline)",
        }}
      >
        <p className="t-label">Price</p>
        <h2 className="t-h2" style={{ marginTop: 8 }}>
          Flat monthly. Never a percentage of your money.
        </h2>
        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            marginTop: 32,
          }}
        >
          {PLAN_ORDER.map((id) => {
            const features = PLANS[id];
            return (
              <article key={id} className="panel" style={{ padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <p className="t-title">{features.name}</p>
                  <p className="t-data" style={{ fontSize: 15 }}>
                    ${(features.priceCents / 100).toFixed(0)}/mo
                  </p>
                </div>
                <p className="t-secondary" style={{ marginTop: 8 }}>
                  {features.blurb}
                </p>
                <p className="t-data" style={{ marginTop: 12, color: "var(--color-text-aa)" }}>
                  {features.openInvoiceLimit === Number.MAX_SAFE_INTEGER
                    ? "unlimited open invoices"
                    : `${features.openInvoiceLimit} open invoices`}
                </p>
              </article>
            );
          })}
        </div>
        <p className="t-secondary" style={{ marginTop: 20, maxWidth: "65ch" }}>
          A 14-day trial that starts read-only: your own aging picture and the follow-ups we
          would send, before anything leaves. Client payments land in your own Stripe account
          &mdash; we never hold your money and never take a cut of it.
        </p>
      </section>

      {/* ------------------------------------------------------ final CTA --- */}
      <section
        className="gutter"
        style={{ maxWidth: 1120, margin: "0 auto", paddingTop: 56, borderTop: "1px solid var(--color-hairline)" }}
      >
        <h2 className="t-display">Stop deciding whether today is the day to ask.</h2>
        <p className="t-body" style={{ marginTop: 16, color: "var(--color-text-2)", maxWidth: "60ch" }}>
          Connect read-only and you will know your real DSO, your slowest payer, and what
          you&rsquo;d be holding today at 30 days flat &mdash; in about the time it takes to make
          coffee.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 32 }}>
          <Link href="/signup" className="btn btn-primary">
            {CTA}
          </Link>
          <Link href="/login" className="btn btn-secondary">
            Sign in
          </Link>
        </div>
        <p className="t-secondary" style={{ marginTop: 40, color: "var(--color-text-aa)", maxWidth: "65ch" }}>
          PaidWell is pre-launch. There are no customer testimonials or logos on this page
          because there are no customers yet. The sample emails above are the product&rsquo;s own
          output, generated by the code that sends them.
        </p>
      </section>

      {/* Sticky CTA in the thumb zone: mobile is most of the traffic. */}
      <div className="thumb-bar" style={{ bottom: 0 }}>
        <Link href="/signup" className="btn btn-primary btn-full">
          {CTA}
        </Link>
      </div>
    </div>
  );
}
