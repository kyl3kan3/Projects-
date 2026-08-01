import type { Metadata } from "next";
import Link from "next/link";
import { HeroDemo } from "@/components/marketing/HeroDemo";
import { Schematic } from "@/components/marketing/Schematic";
import { StatusPill } from "@/components/StatusPill";
import { IconCheck, IconShieldCheck, IconVault } from "@/components/icons";
import { PLANS, PLAN_ORDER, databasesLabel } from "@/lib/plans";

/**
 * Marketing page, built to MARKETING_PLAYBOOK.md.
 *
 *   Enemy       the green checkmark that has never been tested.
 *   Sentence    your backups restore, and here is this week's proof.
 *   Device      the checksum that matches, every night.
 *   Arc         hook -> tension -> proof -> offer.
 *   CTA         "Protect my database", verbatim, four times.
 *
 * Receipts are honest: VaultBack is pre-launch, so there are no customer logos,
 * no testimonials, and no usage numbers. The one demo on the page is labelled as
 * a demo, in the demo (law 5).
 */

export const metadata: Metadata = {
  title: "VaultBack — your backups restore, and here is the proof",
  description:
    "Automated encrypted Postgres backups to your own S3 or R2 bucket, plus scheduled restore drills that prove the backups actually restore. Built for Supabase, Neon, Railway and any Postgres.",
};

const CTA = "Protect my database";

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-5 pb-32 md:px-8">
      <header className="flex items-center justify-between py-6">
        <span className="flex items-center gap-2">
          <span style={{ color: "var(--color-brass)" }}>
            <IconVault size={22} />
          </span>
          <span className="t-title">VaultBack</span>
        </span>
        <Link href="/login" className="btn-quiet no-underline">
          Sign in
        </Link>
      </header>

      {/* ---- Hero: the claim, and the machine running --------------------- */}
      <section className="pt-6 pb-16 lg:grid lg:grid-cols-2 lg:items-center lg:gap-16">
        <div>
          <p className="t-label">Backup assurance for hosted Postgres</p>
          <h1 className="t-display mt-4">
            Your backups restore.
            <br />
            Here is this week&rsquo;s proof.
          </h1>
          <p className="t-body mt-5" style={{ color: "var(--color-text-2)" }}>
            VaultBack takes encrypted snapshots of your Supabase, Neon, Railway or plain Postgres
            database on a schedule, streams them to a bucket you own, and then restores one into a
            throwaway database to check every table&rsquo;s row count. A backup nobody has restored
            is a hypothesis.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className="btn btn-primary no-underline sm:px-8">
              {CTA}
            </Link>
            <Link href="#how" className="btn btn-secondary no-underline">
              See how a drill works
            </Link>
          </div>
          <p className="t-secondary mt-3">14 days, no card. Cancel by closing the tab.</p>
        </div>

        <div className="mt-10 lg:mt-0">
          <HeroDemo />
          <div className="mt-6 opacity-90">
            <Schematic />
            <p className="t-label mt-2">Your database · our process · your bucket · drill</p>
          </div>
        </div>
      </section>

      {/* ---- The device: the checksum that matches, every night ----------- */}
      <section className="hairline-t py-16">
        <p className="t-label">The device</p>
        <h2 className="t-h2 mt-3 max-w-[28ch]">The checksum that matches, every night.</h2>
        <p className="t-body mt-4 max-w-[62ch]" style={{ color: "var(--color-text-2)" }}>
          Every snapshot is hashed as it is written and hashed again when it is read back. A drill
          re-reads the object out of your bucket, checks it still hashes to the same value, restores
          it, and counts rows table by table. That is the whole product: a number that matches, on a
          schedule, with the evidence kept.
        </p>

        <div className="scroll-x mt-8">
          <table className="w-full min-w-[520px] border-collapse">
            <thead>
              <tr>
                <th className="t-label hairline-b py-2 text-left font-semibold">Night</th>
                <th className="t-label hairline-b py-2 text-left font-semibold">Snapshot</th>
                <th className="t-label hairline-b py-2 text-left font-semibold">Checksum</th>
                <th className="t-label hairline-b py-2 text-right font-semibold">Drill</th>
              </tr>
            </thead>
            <tbody>
              {[
                { night: "Mon 04:00", size: "1.2 GB", sum: "sha256:9f3c…a41d", drill: "—" },
                { night: "Tue 04:00", size: "1.2 GB", sum: "sha256:41ba…07c8", drill: "—" },
                { night: "Wed 04:00", size: "1.2 GB", sum: "sha256:c7d1…9e3f", drill: "passed" },
                { night: "Thu 04:00", size: "1.3 GB", sum: "sha256:0a58…b6d2", drill: "—" },
              ].map((row) => (
                <tr key={row.night}>
                  <td className="t-data hairline-b py-3 pr-4">{row.night}</td>
                  <td className="t-data hairline-b py-3 pr-4" style={{ color: "var(--color-text-2)" }}>
                    {row.size}
                  </td>
                  <td className="t-data hairline-b py-3 pr-4" style={{ color: "var(--color-text-2)" }}>
                    {row.sum}
                  </td>
                  <td
                    className="t-data hairline-b py-3 text-right"
                    style={{ color: row.drill === "passed" ? "var(--color-seal)" : "var(--color-text-3)" }}
                  >
                    {row.drill}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="t-secondary mt-3" style={{ color: "var(--color-text-3)" }}>
          Staged demo of one week on our own development database.
        </p>
      </section>

      {/* ---- The math: what the checkbox actually gives you --------------- */}
      <section className="hairline-t py-16">
        <p className="t-label">The math</p>
        <h2 className="t-h2 mt-3 max-w-[30ch]">
          The provider checkbox is not a backup strategy.
        </h2>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Retention is short",
              body: "Supabase Free keeps no backups and Pro keeps 7 days. Neon's history window is measured in hours to days by plan. Find a bad migration on day 10 and the provider cannot help you.",
            },
            {
              title: "The copy is in the same account",
              body: "A suspended account, a compromised login, or a billing lock takes your data and your backups together. Offsite means a different vendor, not a different bucket in the same console.",
            },
            {
              title: "Nobody tests restores",
              body: "Dashboards show a green tick for an attempt. They do not show “we restored this into a scratch database on Wednesday and every row count matched.”",
            },
          ].map((card) => (
            <article key={card.title}>
              <p className="t-title">{card.title}</p>
              <p className="t-secondary mt-2">{card.body}</p>
            </article>
          ))}
        </div>

        <div className="panel mt-10 p-5">
          <p className="t-label">What it replaces</p>
          <ul className="mt-3 flex flex-col gap-2">
            {[
              "A pg_dump cron job, and the box it runs on",
              "An S3 bucket, its lifecycle rules, and its credentials",
              "Encryption you have to get right once and never audit again",
              "Retention pruning that quietly stops working",
              "Alerting for the failure mode where nothing runs at all",
              "The restore test you have been meaning to do since launch",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span style={{ color: "var(--color-brass)", marginTop: 2 }}>
                  <IconCheck size={16} />
                </span>
                <span className="t-secondary">{item}</span>
              </li>
            ))}
          </ul>
          <p className="t-body mt-5">
            About a week to build, then an unowned liability. VaultBack is{" "}
            <span className="t-data">$15/mo</span> — less than the Supabase Pro plan the database
            already sits on.
          </p>
        </div>
      </section>

      {/* ---- Proof: what a drill report looks like ------------------------ */}
      <section id="how" className="hairline-t py-16">
        <p className="t-label">The receipt</p>
        <h2 className="t-h2 mt-3 max-w-[30ch]">A drill either passes or it tells you loudly.</h2>
        <p className="t-body mt-4 max-w-[62ch]" style={{ color: "var(--color-text-2)" }}>
          On schedule, VaultBack creates a throwaway Postgres database, restores your newest snapshot
          into it through the same code path a real recovery uses, compares every table against the
          manifest captured at dump time, and drops the database. This is the report it keeps.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <article className="report-card">
            <div className="flex items-center justify-between gap-3">
              <span className="t-label">Restore drill · JUN 29</span>
              <StatusPill state="verified" label="Passed" />
            </div>
            <p className="t-title mt-3">prod-supabase</p>
            <p className="t-data mt-2">214,882 rows · 41 tables · match</p>
            <div className="scroll-x mt-4">
              <table className="w-full border-collapse">
                <tbody>
                  {[
                    ["public.users", "18,204", "18,204"],
                    ["public.orders", "96,551", "96,551"],
                    ["public.order_items", "94,127", "94,127"],
                  ].map(([table, expected, actual]) => (
                    <tr key={table}>
                      <td className="t-data hairline-b py-2 pr-4">{table}</td>
                      <td className="t-data hairline-b py-2 pr-4 text-right" style={{ color: "var(--color-text-2)" }}>
                        {expected}
                      </td>
                      <td className="t-data hairline-b py-2 text-right" style={{ color: "var(--color-seal)" }}>
                        {actual}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="t-data mt-4" style={{ color: "var(--color-text-3)" }}>
              2m 41s · checksum verified · scratch vaultback_drill_8f21c4
            </p>
          </article>

          <article className="report-card">
            <div className="flex items-center justify-between gap-3">
              <span className="t-label">Restore drill · JUN 22</span>
              <StatusPill state="failed" label="Failed" />
            </div>
            <p className="t-title mt-3">neon-analytics</p>
            <p className="t-data mt-2" style={{ color: "var(--color-torch)" }}>
              1 table restored with the wrong row count
            </p>
            <p className="t-secondary mt-3">
              A failed drill is the highest-severity alert in the product. It means the copies exist
              but have not proven they work — which is exactly the situation the green tick on a
              provider dashboard hides.
            </p>
            <p className="t-data mt-4" style={{ color: "var(--color-text-3)" }}>
              Staged demo. Both cards are our own test data, not a customer&rsquo;s.
            </p>
          </article>
        </div>
      </section>

      {/* ---- Objection killer -------------------------------------------- */}
      <section className="hairline-t py-16">
        <p className="t-label">The obvious objection</p>
        <h2 className="t-h2 mt-3 max-w-[34ch]">
          Why would you trust a small company with your most critical data?
        </h2>
        <p className="t-body mt-4 max-w-[62ch]" style={{ color: "var(--color-text-2)" }}>
          You mostly don&rsquo;t have to. Point VaultBack at your own S3 or R2 bucket — available on
          every plan, including the cheapest — and the encrypted dumps are yours, sitting in your
          account, in a format that is documented in the product.
        </p>
        <ul className="mt-6 flex flex-col gap-3">
          {[
            "Bring your own bucket on every tier. Your backups never have to live with us.",
            "The archive format is a gzipped plain-SQL dump inside a documented AES-256-GCM envelope. Decrypt, gunzip, psql -f.",
            "Connection strings are encrypted at rest under a key separate from the one protecting snapshots, and never written to a log.",
            "We are easier to trust because we are easy to leave.",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5">
              <span style={{ color: "var(--color-seal)", marginTop: 2 }}>
                <IconShieldCheck size={18} />
              </span>
              <span className="t-body">{item}</span>
            </li>
          ))}
        </ul>
        <p className="t-secondary mt-6" style={{ color: "var(--color-text-3)" }}>
          VaultBack is pre-launch. There are no customer logos on this page because there are no
          customers to name yet, and inventing them would be a poor start for a product about trust.
        </p>
      </section>

      {/* ---- Pricing ------------------------------------------------------ */}
      <section className="hairline-t py-16">
        <p className="t-label">Pricing</p>
        <h2 className="t-h2 mt-3">Cheaper than the anxiety.</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PLAN_ORDER.map((id) => {
            const p = PLANS[id];
            return (
              <article
                key={id}
                className="panel p-5"
                style={{ borderColor: id === "startup" ? "var(--color-brass)" : undefined }}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="t-title">{p.name}</p>
                  <p className="t-data">${p.priceMonthly}/mo</p>
                </div>
                <ul className="mt-4 flex flex-col gap-2">
                  <Feature>{databasesLabel(p)} databases</Feature>
                  <Feature>{p.maxFrequency === "hourly" ? "Hourly or daily" : "Daily"} backups</Feature>
                  <Feature>
                    {p.retentionDays === 365 ? "1 year" : `${p.retentionDays} days`} of retention
                  </Feature>
                  <Feature>
                    {p.maxDrill === "none"
                      ? "Restore drills on demand"
                      : `${p.maxDrill === "weekly" ? "Weekly" : "Monthly"} automated drills`}
                  </Feature>
                  <Feature>Your own S3 or R2 bucket</Feature>
                  {p.complianceReport ? <Feature>Monthly compliance PDF</Feature> : null}
                </ul>
                <p className="t-secondary mt-4" style={{ color: "var(--color-text-3)" }}>
                  {id === "hobby"
                    ? "For the side project that started earning."
                    : id === "startup"
                      ? "Hourly is the line between annoying and losing customers."
                      : "Proof on a schedule, plus a PDF for the security questionnaire."}
                </p>
              </article>
            );
          })}
        </div>
        <Link href="/signup" className="btn btn-primary btn-full mt-8 no-underline md:max-w-[280px]">
          {CTA}
        </Link>
      </section>

      {/* ---- Final CTA ---------------------------------------------------- */}
      <section className="hairline-t py-16">
        <h2 className="t-h2 max-w-[26ch]">
          Find out your backups work on a Wednesday, not on the worst day of the year.
        </h2>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link href="/signup" className="btn btn-primary no-underline sm:px-8">
            {CTA}
          </Link>
          <Link href="/login" className="btn btn-secondary no-underline">
            Sign in
          </Link>
        </div>
        <p className="t-secondary mt-3">
          14 days, no card. Connect a database and the first verified snapshot lands in minutes.
        </p>
      </section>

      <footer className="hairline-t flex flex-wrap items-center justify-between gap-4 py-8">
        <span className="t-secondary" style={{ color: "var(--color-text-3)" }}>
          VaultBack · backup assurance for people who chose not to run servers
        </span>
        <Link href="/signup" className="btn-quiet no-underline">
          {CTA}
        </Link>
      </footer>
    </div>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span style={{ color: "var(--color-text-3)", marginTop: 2 }}>
        <IconCheck size={16} />
      </span>
      <span className="t-secondary">{children}</span>
    </li>
  );
}
