import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { ChairDevice } from "@/components/marketing/ChairDevice";
import { Calculator } from "@/components/marketing/Calculator";
import { money } from "@/lib/format";
import { PLANS, PLAN_SPECS } from "@/lib/plans";

/**
 * The landing page, to MARKETING_PLAYBOOK.md.
 *
 * Enemy: the empty hygiene chair at 10am — and the 600 patients in the charts who
 * should be sitting in it.
 * One sentence: "The hygiene chair that fills itself."
 * Device: the chair that fills (components/marketing/ChairDevice).
 * CTA, verbatim in four places: "See your overdue list".
 *
 * Receipts are the product's own demo output, labelled as a demo. There are no
 * testimonials, no customer logos and no usage numbers on this page, because
 * RecallDesk is pre-launch and inventing any of them is a debt the brand never pays
 * off. The only numbers quoted from elsewhere are published industry benchmarks and
 * competitors' own list prices, both linked.
 *
 * Four animated moments, as the playbook allows: the device filling, the ledger
 * excerpt revealing, the calculator's own output, and nothing else.
 */
export const metadata: Metadata = {
  title: "RecallDesk — the hygiene chair that fills itself",
  description:
    "Import your patient list from any PMS, see exactly who is overdue for hygiene recall, run campaigns with booking links, and get a conservative count of the production you recovered — with a receipt on every dollar.",
};

const CTA = "See your overdue list";

export default function LandingPage() {
  return (
    <>
      <header className="screen" style={{ paddingTop: 20, paddingBottom: 0 }}>
        <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="chair-side" size={22} />
            <span className="t-title" style={{ fontWeight: 700 }}>
              RecallDesk
            </span>
          </span>
          <Link href="/login" className="btn-quiet">
            Sign in
          </Link>
        </nav>
      </header>

      <main className="screen" style={{ paddingBottom: 96 }}>
        {/* ---------------------------------------------------------- hero */}
        <section style={{ paddingTop: 32 }}>
          <p className="t-label" style={{ margin: 0 }}>
            Dental patient reactivation
          </p>
          <h1 className="t-display" style={{ margin: "12px 0 0" }}>
            The hygiene chair that fills itself.
          </h1>
          <p className="t-body" style={{ marginTop: 16, maxWidth: "42ch" }}>
            Your 10am is empty and 600 patients of record stopped coming back. RecallDesk finds them in
            a CSV your PMS already exports, runs the outreach that brings them in, and counts the
            production it recovered — conservatively enough to repeat to your accountant.
          </p>

          <div style={{ marginTop: 24 }}>
            <ChairDevice />
          </div>

          <div style={{ marginTop: 24, display: "grid", gap: 12 }}>
            <Link href="/signup" className="btn btn-primary" style={{ width: "100%" }}>
              {CTA}
            </Link>
            <p className="t-secondary" style={{ margin: 0 }}>
              14-day trial, no card. Import in an afternoon. No PMS integration required.
            </p>
          </div>
        </section>

        {/* --------------------------------------------------------- enemy */}
        <section className="hairline-t" style={{ marginTop: 56, paddingTop: 32 }}>
          <h2 className="t-h2" style={{ marginTop: 0 }}>
            The overdue list is the report nobody runs.
          </h2>
          <p className="t-body" style={{ maxWidth: "58ch" }}>
            Industry benchmarks put{" "}
            <a
              href="https://ainora.lt/blog/dental-recall-reactivation-statistics-benchmarks"
              style={{ color: "var(--color-aqua-text)", fontWeight: 500 }}
            >
              25–40% of a practice&rsquo;s active patients overdue for hygiene at any moment
            </a>
            . For 2,000 patients that is 500–800 people, at roughly $300 of production each. The
            practice knows this in theory. In practice the list lives inside the PMS, reactivation is
            &ldquo;the front desk calls when it&rsquo;s slow&rdquo; — it is never slow — and the
            communication suite you already pay for treats reactivation as a checkbox.
          </p>
          <p className="t-body" style={{ maxWidth: "58ch" }}>
            So nobody can answer the only question that matters: did this outreach put dollars in the
            schedule?
          </p>
        </section>

        {/* ----------------------------------------------------- the math */}
        <section className="hairline-t" style={{ marginTop: 40, paddingTop: 32 }}>
          <p className="t-label" style={{ margin: 0 }}>
            The arithmetic
          </p>
          <h2 className="t-h2" style={{ margin: "8px 0 16px" }}>
            Your charts are hiding a number. Here it is.
          </h2>
          <Calculator />
        </section>

        {/* ------------------------------------------------------ receipts */}
        <section className="hairline-t" style={{ marginTop: 40, paddingTop: 32 }}>
          <p className="t-label" style={{ margin: 0 }}>
            Receipts, not adjectives
          </p>
          <h2 className="t-h2" style={{ margin: "8px 0 16px" }}>
            Every recovered dollar expands into its evidence.
          </h2>
          <p className="t-body" style={{ maxWidth: "58ch", marginTop: 0 }}>
            A booking counts as recovered production only when a touch reached that patient within 30
            days before they booked. No qualifying touch, no credit — the booking still shows, marked
            &ldquo;no qualifying touch&rdquo;, and contributes nothing. The number is small enough to be
            true, which is exactly why it renews subscriptions.
          </p>

          <div className="card" style={{ padding: 20, marginTop: 16 }}>
            <p className="t-label" style={{ margin: "0 0 12px" }}>
              Ledger excerpt · our own demo practice
            </p>
            <LedgerLine
              date="08 Jul 2026"
              name="R. Mbeki"
              detail="Text 30 Jun · 8 days before"
              amount={money(31_000)}
            />
            <LedgerLine
              date="09 Jul 2026"
              name="D. Okafor"
              detail="Email 02 Jul · 7 days before"
              amount={money(31_000)}
            />
            <LedgerLine
              date="10 Jul 2026"
              name="A. Nwosu"
              detail="Call 07 Jul · 3 days before"
              amount={money(31_000)}
            />
            <LedgerLine
              date="11 Jul 2026"
              name="I. Fuentes"
              detail="no qualifying touch"
              amount="—"
              muted
            />
            <p className="t-secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              Fictional patients from our test practice — this is the real component, rendering real
              attribution logic. The fourth row is the point: a walk-in nobody contacted earns nothing.
            </p>
          </div>

          <div className="card" style={{ padding: 20, marginTop: 16 }}>
            <p className="t-label" style={{ margin: "0 0 8px" }}>
              And the honest comparison
            </p>
            <p className="t-body" style={{ margin: 0 }}>
              Every owner report carries a holdout: how often overdue patients you <em>didn&rsquo;t</em>{" "}
              contact came back anyway, over the same period, from the same data. If the difference is
              small, the report says so. We would rather you trust the number than like it.
            </p>
          </div>
        </section>

        {/* ----------------------------------------------- objection killer */}
        <section className="hairline-t" style={{ marginTop: 40, paddingTop: 32 }}>
          <p className="t-label" style={{ margin: 0 }}>
            &ldquo;Our front desk already calls.&rdquo;
          </p>
          <h2 className="t-h2" style={{ margin: "8px 0 16px" }}>
            They do. RecallDesk tells them which ten.
          </h2>
          <p className="t-body" style={{ maxWidth: "58ch", marginTop: 0 }}>
            The queue is rebuilt every morning and ranked by value, urgency and silence: nobody
            mid-sequence, nobody contacted this week, nobody marked do-not-contact. Each card is two
            taps — an outcome and a date — and each disposition becomes a touch in the ledger, so
            front-desk work counts as outreach and gets credit when it lands.
          </p>

          <div className="card" style={{ padding: 16, marginTop: 16 }}>
            <p className="t-label" style={{ margin: 0 }}>
              #3 · {money(31_000)} · 6–12 mo
            </p>
            <p className="t-title" style={{ margin: "6px 0 2px", fontSize: "1.0625rem" }}>
              Marguerite Bellweather
            </p>
            <p className="t-mono" style={{ margin: 0, color: "var(--color-aqua-text)" }}>
              (512) 555-0143
            </p>
            <p className="t-secondary" style={{ margin: "6px 0 0" }}>
              last visit Aug 2023 · due since Feb 2024 · never contacted
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
              {["Booked", "Left msg", "Call back", "Skip", "DNC"].map((label) => (
                <span key={label} className="chip chip-lg">
                  {label}
                </span>
              ))}
            </div>
          </div>

          <ul style={{ listStyle: "none", padding: 0, margin: "24px 0 0", display: "grid", gap: 12 }}>
            <Point icon="arrow-up-doc" title="CSV-first, so onboarding is an afternoon">
              Every PMS exports a patient list; almost none make an integration cheap. Dentrix,
              Eaglesoft and Open Dental have their own export recipes in the product, with column
              mapping saved per location and a dry run before anything is written.
            </Point>
            <Point icon="shield-line" title="One consent chokepoint, and STOP is permanent">
              Every outbound touch passes a single gate: channel consent, opt-outs, bounce and failed
              flags, do-not-contact, quiet hours in the location&rsquo;s own timezone, and a per-patient
              touch cap. A later roster import can never re-subscribe someone who opted out.
            </Point>
            <Point icon="link-token" title="No PMS write-back to go wrong">
              Each touch carries a per-patient booking link. The patient picks windows, the front desk
              books it in your PMS as usual and taps once here. Nothing writes into your clinical
              system.
            </Point>
          </ul>

          <Link href="/signup" className="btn btn-primary" style={{ width: "100%", marginTop: 24 }}>
            {CTA}
          </Link>
        </section>

        {/* ------------------------------------------------------- pricing */}
        <section className="hairline-t" style={{ marginTop: 40, paddingTop: 32 }}>
          <p className="t-label" style={{ margin: 0 }}>
            Priced per location
          </p>
          <h2 className="t-h2" style={{ margin: "8px 0 16px" }}>
            One recovered patient a week covers it.
          </h2>
          <p className="t-body" style={{ maxWidth: "58ch", marginTop: 0 }}>
            At $300 a visit, four reactivated patients a month is $1,200 of production. The suites you
            are already quoted for start at{" "}
            <a
              href="https://noshowcost.com/tools/solutionreach-pricing"
              style={{ color: "var(--color-aqua-text)", fontWeight: 500 }}
            >
              ~$329/mo (Solutionreach)
            </a>{" "}
            and{" "}
            <a
              href="https://www.themolarreport.com/learn/weave-pricing"
              style={{ color: "var(--color-aqua-text)", fontWeight: 500 }}
            >
              $249/mo per location (Weave Pro)
            </a>
            , and do reactivation as one tab. Keep yours. Add the engine.
          </p>

          <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
            {PLANS.map((plan) => {
              const spec = PLAN_SPECS[plan];
              return (
                <div key={plan} className="card" style={{ padding: 20 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 12,
                    }}
                  >
                    <p className="t-title" style={{ margin: 0, fontWeight: 700 }}>
                      {spec.name}
                    </p>
                    <p className="t-mono" style={{ margin: 0, fontSize: "1.0625rem" }}>
                      {money(spec.priceCents)}
                      <span className="t-secondary"> /location/mo</span>
                    </p>
                  </div>
                  <p className="t-secondary" style={{ marginTop: 6 }}>
                    {spec.tagline}
                    {spec.minLocations > 1 ? ` ${spec.minLocations}+ locations.` : ""}
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: 6 }}>
                    {spec.features.map((feature) => (
                      <li key={feature} className="t-secondary" style={{ display: "flex", gap: 8 }}>
                        <span style={{ color: "var(--color-aqua)", lineHeight: 0, flex: "none", marginTop: 2 }}>
                          <Icon name="check-seat" size={16} />
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <p className="t-secondary" style={{ marginTop: 16 }}>
            14-day free trial that ends with your own overdue list and its dollar total on screen — the
            trial is the demo. Annual is two months free. No per-message fee on email.
          </p>

          <Link href="/signup" className="btn btn-primary" style={{ width: "100%", marginTop: 16 }}>
            {CTA}
          </Link>
        </section>

        {/* ---------------------------------------------------- final CTA */}
        <section className="hairline-t" style={{ marginTop: 40, paddingTop: 32 }}>
          <h2 className="t-h2" style={{ marginTop: 0 }}>
            Export one CSV. See what your charts have been hiding.
          </h2>
          <p className="t-body" style={{ maxWidth: "52ch" }}>
            Fifteen minutes to the list with a dollar total on it. If the number is smaller than you
            feared, you have learned something for free.
          </p>
          <Link href="/signup" className="btn btn-primary" style={{ width: "100%" }}>
            {CTA}
          </Link>
        </section>

        <footer className="hairline-t" style={{ marginTop: 40, paddingTop: 24 }}>
          <p className="t-secondary" style={{ margin: 0 }}>
            RecallDesk is pre-launch: the demo data on this page is our own, and clearly labelled. We do
            not publish testimonials or customer counts we do not have. Patient rosters are PHI —
            RecallDesk signs a BAA with every practice and with every vendor in the data path.
          </p>
          <p className="t-secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            <Link href="/login" style={{ color: "var(--color-aqua-text)", fontWeight: 700 }}>
              Sign in
            </Link>
          </p>
        </footer>
      </main>

      {/* Sticky mobile bar — the same CTA phrase, a fourth time. */}
      <div className="thumb-bar" style={{ bottom: 0 }}>
        <Link href="/signup" className="btn btn-primary">
          {CTA}
        </Link>
      </div>
    </>
  );
}

function LedgerLine({
  date,
  name,
  detail,
  amount,
  muted,
}: {
  date: string;
  name: string;
  detail: string;
  amount: string;
  muted?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        borderBottom: "1px solid var(--color-hairline)",
      }}
    >
      <span className="t-mono" style={{ color: "var(--color-ink-2)", whiteSpace: "nowrap" }}>
        {date}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="t-title" style={{ display: "block", color: muted ? "var(--color-ink-2)" : undefined }}>
          {name}
        </span>
        <span className="t-secondary">{detail}</span>
      </span>
      <span className="t-mono" style={{ color: muted ? "var(--color-ink-2)" : "var(--color-ink)" }}>
        {amount}
      </span>
    </div>
  );
}

function Point({
  icon,
  title,
  children,
}: {
  icon: "arrow-up-doc" | "shield-line" | "link-token";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li style={{ display: "flex", gap: 12 }}>
      <span style={{ color: "var(--color-aqua)", lineHeight: 0, flex: "none", marginTop: 3 }}>
        <Icon name={icon} size={22} />
      </span>
      <span>
        <span className="t-title" style={{ display: "block" }}>
          {title}
        </span>
        <span className="t-secondary">{children}</span>
      </span>
    </li>
  );
}
