import type { Metadata } from "next";
import Link from "next/link";
import { HeroGrid } from "@/components/marketing/HeroGrid";
import { Reveal } from "@/components/marketing/Reveal";
import { IconArrowDownNarrow, IconCheck, IconScale } from "@/components/icons";
import { PLANS, PLAN_ORDER } from "@/lib/plans";

/**
 * The landing page.
 *
 * Message architecture (MARKETING_PLAYBOOK law 1):
 *  - **Enemy:** bid leveling in a spreadsheet at midnight before the owner meeting.
 *  - **One sentence:** every trade's bids, collected and comparable, before you leave
 *    the office.
 *  - **Device:** five bids, leveled on one screen — and the low bid that loses.
 *  - Arc: hook (the grid running) → tension (the midnight spreadsheet) → proof (the
 *    portal and the arithmetic) → offer (pricing anchored against the incumbent).
 *
 * Four animated beats and no more: the grid assembling, the device landing, the math
 * writing itself, the objection section revealing. Everything else is static.
 *
 * Every number on this page is either arithmetic the reader can check or a cited
 * public price. There are no testimonials, no logos and no usage claims, because this
 * product is pre-launch and inventing them would be a debt it never pays off.
 */

export const metadata: Metadata = {
  title: "BidBoard — five bids, leveled on one screen",
  description:
    "Invite subs by trade, collect bids through a portal they never log into, and level them side by side with scope gaps visible. Bid management for small general contractors, from $149/mo.",
};

const CTA = "Level your next package";

export default function LandingPage() {
  return (
    <div style={{ paddingBottom: 96 }}>
      {/* ------------------------------------------------------------- hero --- */}
      <header className="gutter wrap-wide" style={{ paddingTop: "var(--s6)" }}>
        <nav
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "var(--s4)",
          }}
        >
          <span className="t-label" style={{ letterSpacing: "0.16em", color: "var(--fg)" }}>
            BIDBOARD
          </span>
          <Link href="/login" className="t-secondary">
            Sign in
          </Link>
        </nav>

        <h1 className="t-hero" style={{ marginTop: "var(--s7)", maxWidth: "22ch" }}>
          Five bids, leveled on one screen.
        </h1>
        <p
          className="t-body"
          style={{ marginTop: "var(--s4)", maxWidth: "44ch", color: "var(--fg-2)" }}
        >
          Invite your subs by trade. They bid through a link with no account and no
          password. The numbers arrive already comparable — and the scope one of them
          left out is visible before you award, not after.
        </p>

        <div style={{ marginTop: "var(--s6)" }}>
          <Link href="/signup" className="btn btn-primary btn-full" style={{ maxWidth: 360 }}>
            {CTA}
          </Link>
          <p className="t-secondary" style={{ marginTop: "var(--s3)" }}>
            14 days free. No card. Your subs never pay and never sign up.
          </p>
        </div>
      </header>

      <section className="gutter wrap-wide" style={{ marginTop: "var(--s8)" }}>
        <HeroGrid />
      </section>

      {/* ----------------------------------------------------------- the enemy --- */}
      <section className="gutter wrap" style={{ marginTop: "var(--s10)" }}>
        <p className="t-label">THE NIGHT BEFORE THE OWNER MEETING</p>
        <h2 className="t-h2" style={{ marginTop: "var(--s3)", maxWidth: "26ch" }}>
          Nine bids. Three formats. One spreadsheet you are retyping at 11pm.
        </h2>
        <p className="t-body" style={{ marginTop: "var(--s4)", color: "var(--fg-2)" }}>
          Sub A included dumpsters. Sub B excluded them and never said so on the cover
          sheet. Sub C sent a lump sum and a PDF. By the time the columns line up it is
          midnight, and the difference between the low bid and the right bid is a
          six-figure change order you will not find until framing.
        </p>
        <p className="t-body" style={{ marginTop: "var(--s4)", color: "var(--fg-2)" }}>
          The spreadsheet is not the problem. The spreadsheet is where the differences
          go to hide.
        </p>
      </section>

      {/* ---------------------------------------------------------- the device --- */}
      <Reveal className="gutter wrap" >
        <div style={{ marginTop: "var(--s10)" }}>
          <p className="t-label">THE ARITHMETIC</p>
          <p
            className="t-stat"
            style={{ marginTop: "var(--s4)", color: "var(--fg)" }}
          >
            9 subs · 3 formats · 1 grid
          </p>
          <p className="t-body" style={{ marginTop: "var(--s4)", color: "var(--fg-2)" }}>
            Because every bidder fills <em>your</em> bid form, the rows already match
            when the bids land. Anything a sub adds in their own words queues up to be
            mapped once — and BidBoard remembers that correction for their next project.
          </p>

          <ul
            className="stack"
            style={{ gap: "var(--s4)", marginTop: "var(--s6)", listStyle: "none" }}
          >
            {[
              {
                head: "The low bid that loses",
                body: "Apparent low is computed on adjusted totals, after plugs for the lines a sub skipped. A plug renders italic with a superscript p and is footnoted in the export — it can never pass for somebody's price.",
              },
              {
                head: "Scope gaps, in red, before the award",
                body: "The inclusion/exclusion matrix puts one bidder's exclusion next to another's inclusion. That row is the reason bad awards happen, and it is the first row on the screen.",
              },
              {
                head: "An artifact you can hand an owner",
                body: "The export is a leveled comparison with every adjustment footnoted and every plug marked. It is designed to be shown, not cleaned up first.",
              },
            ].map((item) => (
              <li key={item.head} className="hairline-t" style={{ paddingTop: "var(--s4)" }}>
                <h3 className="t-title">
                  <IconArrowDownNarrow size={18} /> {item.head}
                </h3>
                <p className="t-secondary" style={{ marginTop: "var(--s2)" }}>
                  {item.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>

      {/* -------------------------------------------------------- the objection --- */}
      <Reveal className="gutter wrap">
        <div style={{ marginTop: "var(--s10)" }}>
          <p className="t-label">THE OBJECTION</p>
          <h2 className="t-h2" style={{ marginTop: "var(--s3)", maxWidth: "24ch" }}>
            &ldquo;My subs will not use software.&rdquo;
          </h2>
          <p className="t-body" style={{ marginTop: "var(--s4)", color: "var(--fg-2)" }}>
            They will not, and they should not have to. A BidBoard invite is an email
            with a link. The link opens the scope, the plans and a bid form on a phone in
            a truck. No account, no password, no network, no spam — and if they still
            want to send you a PDF, they can attach it, or you can type their number in
            yourself so the grid never has a hole.
          </p>

          <div className="card" style={{ marginTop: "var(--s6)", padding: "var(--s5)" }}>
            <p className="t-label">WHAT THE SUB SEES</p>
            <ul
              className="stack"
              style={{ gap: "var(--s3)", marginTop: "var(--s4)", listStyle: "none" }}
            >
              {[
                "Your company name and the project, at the top",
                "The scope notes and the plan set, downloadable",
                "Your line items, with a numeric keypad and a running total",
                "“Can’t price this?” — excluded, or included in another line",
                "One lump-sum field, if that is how they bid",
                "A plain statement that their numbers are never shown to other bidders",
              ].map((line) => (
                <li key={line} className="t-secondary" style={{ display: "flex", gap: "var(--s2)" }}>
                  <IconCheck size={16} />
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <p className="t-secondary" style={{ marginTop: "var(--s5)" }}>
            Bid confidentiality is not a feature line here. One sub&rsquo;s numbers are
            never rendered in another sub&rsquo;s portal — that is enforced at the query
            layer and proved by a test that drives each portal with the other
            bidder&rsquo;s ids. Every access is logged, which is what answers a
            bid-shopping accusation.
          </p>
        </div>
      </Reveal>

      {/* ------------------------------------------------------------- the math --- */}
      <Reveal className="gutter wrap">
        <div style={{ marginTop: "var(--s10)" }}>
          <p className="t-label">THE MATH</p>
          <h2 className="t-h2" style={{ marginTop: "var(--s3)", maxWidth: "26ch" }}>
            One estimator night, per package, per month.
          </h2>
          <div
            className="stack"
            style={{ gap: "var(--s3)", marginTop: "var(--s5)" }}
          >
            {[
              ["Leveling one package in a spreadsheet", "3–5 hours"],
              ["Packages a small GC levels each month", "4–10"],
              ["BidBoard, Crew plan", "$149/month"],
              ["BuildingConnected, published floor", "~$3,600/year"],
              ["BuildingConnected, real GC contracts", "$22,000+/year"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="hairline-t"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "var(--s4)",
                  paddingTop: "var(--s3)",
                }}
              >
                <span className="t-secondary" style={{ color: "var(--fg-2)" }}>
                  {label}
                </span>
                <span className="t-data" style={{ flex: "none" }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
          <p className="t-secondary" style={{ marginTop: "var(--s4)", color: "var(--fg-3)" }}>
            Incumbent pricing per downtobid.com and construction.autodesk.com, both public
            as of 2026. The hours are the ones estimators report; count your own and the
            arithmetic still works.
          </p>
        </div>
      </Reveal>

      {/* ------------------------------------------------------------- pricing --- */}
      <section className="gutter wrap" style={{ marginTop: "var(--s10)" }}>
        <p className="t-label">PRICING</p>
        <h2 className="t-h2" style={{ marginTop: "var(--s3)" }}>
          Priced by projects and seats. Never per sub.
        </h2>
        <p className="t-secondary" style={{ marginTop: "var(--s3)" }}>
          Subs are free forever, with no account. Annual billing is two months free.
        </p>

        <div className="stack" style={{ gap: "var(--s4)", marginTop: "var(--s6)" }}>
          {PLAN_ORDER.map((id) => {
            const plan = PLANS[id];
            return (
              <article key={id} className="card" style={{ padding: "var(--s5)" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: "var(--s3)",
                  }}
                >
                  <h3 className="t-title">{plan.name}</h3>
                  <span className="t-data" style={{ fontSize: 15 }}>
                    ${plan.priceMonthly}/mo
                  </span>
                </div>
                <p className="t-secondary" style={{ marginTop: "var(--s2)" }}>
                  {plan.blurb}
                </p>
                <p className="t-data" style={{ marginTop: "var(--s3)", color: "var(--fg-2)" }}>
                  {Number.isFinite(plan.activeProjects)
                    ? `${plan.activeProjects} ACTIVE PROJECTS`
                    : "UNLIMITED PROJECTS"}{" "}
                  · {plan.seats} SEATS · {plan.storageGb} GB
                </p>
                <ul
                  className="stack"
                  style={{ gap: "var(--s2)", marginTop: "var(--s4)", listStyle: "none" }}
                >
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="t-secondary"
                      style={{ display: "flex", gap: "var(--s2)" }}
                    >
                      <IconCheck size={16} />
                      {f}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        <div style={{ marginTop: "var(--s7)" }}>
          <Link href="/signup" className="btn btn-primary btn-full" style={{ maxWidth: 360 }}>
            {CTA}
          </Link>
        </div>
      </section>

      {/* ---------------------------------------------------------- final CTA --- */}
      <section className="gutter wrap" style={{ marginTop: "var(--s10)" }}>
        <h2 className="t-h2" style={{ maxWidth: "24ch" }}>
          <IconScale size={20} /> Put the job you are bidding this week through it.
        </h2>
        <p className="t-body" style={{ marginTop: "var(--s4)", color: "var(--fg-2)" }}>
          It is the only test that means anything: import your subs, send three invites,
          and see whether the bids come back comparable. If they do not, you have lost an
          afternoon. If they do, you have your Saturday back.
        </p>
        <div style={{ marginTop: "var(--s6)" }}>
          <Link href="/signup" className="btn btn-primary btn-full" style={{ maxWidth: 360 }}>
            {CTA}
          </Link>
        </div>
        <p className="t-secondary" style={{ marginTop: "var(--s5)", color: "var(--fg-3)" }}>
          BidBoard is pre-launch. There are no customer testimonials on this page because
          there are no customers yet — the grid above is our own staged package, and it
          is labelled as one.
        </p>
      </section>

      {/* Sticky mobile CTA: the same words, a fourth time. */}
      <div
        className="sticky-actions"
        style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30 }}
      >
        <Link href="/signup" className="btn btn-primary btn-full">
          {CTA}
        </Link>
      </div>
    </div>
  );
}
