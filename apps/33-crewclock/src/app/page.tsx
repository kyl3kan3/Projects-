import type { Metadata } from "next";
import Link from "next/link";
import { HeroMeter } from "@/components/marketing/HeroMeter";
import { StickyCta } from "@/components/marketing/StickyCta";
import { IconCheck, IconDownload, IconGlobe, IconMapPin, IconRing } from "@/components/icons";
import { MONTHLY_FLOOR_CENTS, PLANS } from "@/lib/plans";
import { formatMoneyCents } from "@/lib/time";

/**
 * The marketing page, to MARKETING_PLAYBOOK.md.
 *
 *   Enemy    — the Friday timesheet signed from memory, and the job that loses
 *              money in silence until the invoice goes out.
 *   Sentence — the timesheet cannot be rounded up, and the job cost arrives
 *              while you can still do something about it.
 *   Device   — labor cost vs bid, live.
 *   Arc      — hook (the machine running) → tension (the arithmetic of padding)
 *              → proof (the file, the fence verdicts, both languages) → offer.
 *
 * Receipts law: CrewClock is pre-launch. There are no customers, so there are no
 * customer quotes, logos or usage numbers on this page. What is shown is this
 * build's own output, labelled as such.
 */

export const metadata: Metadata = {
  title: "CrewClock — the timesheet that can't be rounded up",
  description:
    "GPS-verified time tracking and job costing for field crews. Geofenced punches, a bilingual EN/ES crew app that works with no signal, live labor cost against your bid, and payroll CSVs for ADP and Gusto.",
};

const CTA = "Start the 30-day trial";

/** The leak, per README: 15 padded minutes a day at a $28 loaded rate. */
const LOADED_RATE_CENTS = 2800;
const PADDED_MINUTES_PER_DAY = 15;
const WORK_DAYS_PER_YEAR = 250;

function yearlyLeakCents(crewSize: number): number {
  return Math.round(
    (PADDED_MINUTES_PER_DAY / 60) * LOADED_RATE_CENTS * WORK_DAYS_PER_YEAR * crewSize,
  );
}

export default function MarketingPage() {
  return (
    <main>
      {/* ---------------------------------------------------------- hero --- */}
      <section className="screen pt-10" style={{ paddingBottom: 48 }}>
        <p className="t-label">CrewClock</p>
        <h1 className="t-display mt-4" style={{ maxWidth: "18ch" }}>
          The timesheet that can&rsquo;t be rounded up.
        </h1>
        <p className="t-body mt-4" style={{ color: "var(--fg-2)", maxWidth: "42ch" }}>
          Geofenced punches your crew makes in ten seconds with gloves on — and the labor cost
          against your bid, updating while the crew is still on site.
        </p>

        <div className="mt-8">
          <HeroMeter />
          <p className="t-secondary mt-2" style={{ color: "var(--fg-3)" }}>
            Demo — a worked example on a 120-hour, $11,200 labor bid.
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/signup" className="btn btn-primary btn-full sm:w-auto">
            {CTA}
          </Link>
          <Link href="/join" className="btn btn-secondary btn-full sm:w-auto">
            Crew member? Join with your code
          </Link>
        </div>
        <p className="t-secondary mt-3">No card. Thirty days spans a full payroll cycle.</p>
      </section>

      {/* -------------------------------------------------------- tension --- */}
      <section className="screen hairline-t py-12">
        <p className="t-label">The arithmetic nobody does</p>
        <h2 className="t-h2 mt-3" style={{ maxWidth: "26ch" }}>
          Fifteen minutes a day, per worker, is not a rounding error.
        </h2>
        <p className="t-body mt-4" style={{ color: "var(--fg-2)", maxWidth: "46ch" }}>
          A worker writes 7:00 when the truck rolled in at 7:20. The foreman signs it Friday from
          memory. The office keys it in Monday. At a{" "}
          {formatMoneyCents(LOADED_RATE_CENTS, { cents: true })} loaded rate, that is what it costs
          you a year:
        </p>

        <div className="scroll-x mt-6">
          <table className="t-data">
            <thead>
              <tr>
                <th className="t-label">Crew</th>
                <th className="t-label">Padded hours / year</th>
                <th className="t-label">Cost / year</th>
                <th className="t-label">CrewClock / year</th>
              </tr>
            </thead>
            <tbody>
              {[5, 10, 15, 25].map((size) => {
                const annualPlan =
                  Math.max(MONTHLY_FLOOR_CENTS, size * PLANS.crew.seatPriceCents) * 12;
                return (
                  <tr key={size}>
                    <td>{size}</td>
                    <td>
                      {((PADDED_MINUTES_PER_DAY / 60) * WORK_DAYS_PER_YEAR * size).toFixed(0)} h
                    </td>
                    <td style={{ color: "var(--warn)" }}>
                      {formatMoneyCents(yearlyLeakCents(size))}
                    </td>
                    <td>{formatMoneyCents(annualPlan)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="t-secondary mt-3">
          15 min/day × 250 work days × {formatMoneyCents(LOADED_RATE_CENTS, { cents: true })}/h.
          Industry estimates put time theft at 1.5–5% of gross payroll (American Payroll Association,
          cited in payroll-industry surveys); this table is only the padding, not the errors.
        </p>
      </section>

      {/* --------------------------------------------------------- proof --- */}
      <section className="screen hairline-t py-12">
        <p className="t-label">What the punch actually records</p>
        <h2 className="t-h2 mt-3" style={{ maxWidth: "24ch" }}>
          Honest GPS, or none. Never a confident dot that&rsquo;s a guess.
        </h2>
        <p className="t-body mt-4" style={{ color: "var(--fg-2)", maxWidth: "46ch" }}>
          Phone accuracy swings from 5 m to 500 m. CrewClock records the accuracy with every punch
          and says which of three things is true. A punch is never blocked, and never silently
          &ldquo;verified&rdquo;.
        </p>

        <div className="mt-6">
          {[
            {
              icon: <IconRing size={18} />,
              tone: "var(--accent)",
              title: "Inside fence",
              body: "Within the site radius, widened by the reading's own accuracy up to 250 m. Nothing to review.",
            },
            {
              icon: <IconMapPin size={18} />,
              tone: "var(--warn)",
              title: "Outside fence — 142 m from site",
              body: "Recorded, paid, and flagged for the office. Workers get paid; owners get flags.",
            },
            {
              icon: <IconGlobe size={18} />,
              tone: "var(--fg-3)",
              title: "No GPS — recorded without location",
              body: "Denied, timed out, or a ±1.4 km cell fix. Too vague to judge, so we don't pretend to.",
            },
          ].map((item) => (
            <div key={item.title} className="row items-start">
              <span style={{ color: item.tone, paddingTop: 2 }}>{item.icon}</span>
              <div>
                <p className="t-title">{item.title}</p>
                <p className="t-secondary mt-1">{item.body}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="t-secondary mt-4">
          Mock-location apps exist and a phone can be handed to a friend. GPS verification raises the
          cost of cheating; it does not make it impossible. CrewClock flags impossible travel between
          punches and one device punching for several people — and says so plainly, rather than
          claiming spoof-proof GPS.
        </p>
      </section>

      {/* ----------------------------------------------------- bilingual --- */}
      <section className="screen hairline-t py-12">
        <p className="t-label">Both languages, one product</p>
        <h2 className="t-h2 mt-3" style={{ maxWidth: "26ch" }}>
          A crew where each worker reads their own language.
        </h2>
        <p className="t-body mt-4" style={{ color: "var(--fg-2)", maxWidth: "46ch" }}>
          Roughly a third of the US construction workforce is Hispanic (CPWR, 2024). The crew half of
          CrewClock was designed in English and Spanish at the same time — same screen, same tap
          count, and the setting belongs to the worker, not the account.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {[
            {
              lang: "EN",
              button: "CLOCK IN",
              status: "ON THE CLOCK",
              shift: "Shift: 6h 12m",
              fence: "142 m from site — will be flagged",
              offline: "Saved on phone — will sync",
            },
            {
              lang: "ES",
              button: "MARCAR ENTRADA",
              status: "EN TURNO",
              shift: "Jornada: 6h 12m",
              fence: "A 142 m del sitio — se va a marcar",
              offline: "Guardado en el teléfono — se sincronizará",
            },
          ].map((pane) => (
            <div key={pane.lang} className="panel p-5">
              <div className="flex items-center justify-between">
                <span className="t-label">{pane.lang}</span>
                <span className="pill" data-tone="on">
                  <span className="dot" />
                  {pane.status}
                </span>
              </div>
              <p className="t-stat mt-4" style={{ fontSize: 40 }}>
                6h 12m
              </p>
              <p className="t-secondary mt-1">{pane.shift}</p>
              <p className="t-secondary mt-3" style={{ color: "var(--warn)" }}>
                {pane.fence}
              </p>
              <p className="t-secondary mt-1">{pane.offline}</p>
              <div
                className="mt-5 flex items-center justify-center"
                style={{
                  height: 64,
                  borderRadius: 10,
                  background: "var(--action)",
                  color: "var(--on-action)",
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  fontSize: 17,
                }}
              >
                {pane.button}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------ the file --- */}
      <section className="screen hairline-t py-12">
        <p className="t-label">The Monday the bookkeeper gets back</p>
        <h2 className="t-h2 mt-3" style={{ maxWidth: "24ch" }}>
          A payroll file, not a spreadsheet to re-key.
        </h2>
        <p className="t-body mt-4" style={{ color: "var(--fg-2)", maxWidth: "46ch" }}>
          Approve the period, pick ADP or Gusto, download. Overtime is computed per worker per rule —
          weekly-40, or daily-8 for California — in the job site&rsquo;s timezone, so a crew that
          crosses midnight lands in the right week.
        </p>

        <div className="scroll-x panel mt-6 p-4">
          <pre className="t-data" style={{ margin: 0, lineHeight: 1.7 }}>
            {`Co Code,Batch ID,File #,Reg Hours,O/T Hours,Pay Date
H4K,0725,1042,40.00,3.50,07/25/2026
H4K,0725,1078,32.00,8.00,07/25/2026`}
          </pre>
        </div>
        <p className="t-secondary mt-3" style={{ color: "var(--fg-3)" }}>
          A real file this build produced, from our own test crew — the same bytes the download
          serves, checksummed so a re-export months later is identical.
        </p>

        <div className="mt-6">
          {[
            {
              icon: <IconCheck size={18} />,
              title: "Hours truncated, never rounded up",
              body: "Payroll hours are floored to the hundredth of an hour, so an exported figure is always at or under the true elapsed time. There is no rounding mode in the code that could pad it.",
            },
            {
              icon: <IconDownload size={18} />,
              title: "Blocked before payroll, not after",
              body: "Missing ADP file number, missing Gusto email, a shift still running inside the period: the export refuses to generate, and names the worker.",
            },
          ].map((item) => (
            <div key={item.title} className="row items-start">
              <span style={{ color: "var(--accent)", paddingTop: 2 }}>{item.icon}</span>
              <div>
                <p className="t-title">{item.title}</p>
                <p className="t-secondary mt-1">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------- objection kill --- */}
      <section className="screen hairline-t py-12">
        <p className="t-label">The objection</p>
        <h2 className="t-h2 mt-3" style={{ maxWidth: "22ch" }}>
          &ldquo;My crew won&rsquo;t use an app.&rdquo;
        </h2>
        <p className="t-body mt-4" style={{ color: "var(--fg-2)", maxWidth: "46ch" }}>
          They will use one thing: a button the size of their thumb, at 6:55am, in their own
          language. Here is the entire crew experience.
        </p>
        <ol className="mt-6">
          {[
            "Open the icon on the home screen. No password — a code the foreman read out once, and a 4-digit PIN.",
            "Tap the one control. It fills the bottom third of the screen.",
            "The ring draws around the site. Pocket the phone.",
          ].map((step, index) => (
            <li key={step} className="row items-start">
              <span className="t-data" style={{ color: "var(--accent)", paddingTop: 2 }}>
                {index + 1}
              </span>
              <p className="t-body">{step}</p>
            </li>
          ))}
        </ol>
        <p className="t-secondary mt-4">
          No signal at the site? The punch is saved on the phone and syncs when the bars come back —
          and because each punch carries an id minted on the device, syncing it twice can never create
          a second entry. Location is read only at the punch: there is no background tracking, and the
          crew sees exactly what the office sees.
        </p>
      </section>

      {/* ------------------------------------------------------- pricing --- */}
      <section className="screen hairline-t py-12">
        <p className="t-label">Pricing, on the page, forever</p>
        <h2 className="t-h2 mt-3">Per head. No base fee to decode.</h2>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {(["crew", "company"] as const).map((id) => {
            const plan = PLANS[id];
            return (
              <div key={id} className="panel p-5">
                <p className="t-label">{plan.name}</p>
                <p className="t-data-lg mt-2" style={{ fontSize: 28 }}>
                  {formatMoneyCents(plan.seatPriceCents, { cents: true })}
                  <span style={{ color: "var(--fg-3)" }}>/user/mo</span>
                </p>
                <p className="t-secondary mt-1">
                  {formatMoneyCents(MONTHLY_FLOOR_CENTS)}/mo minimum — it disappears at{" "}
                  {Math.ceil(MONTHLY_FLOOR_CENTS / plan.seatPriceCents)} users.
                </p>
                <ul className="mt-4 flex flex-col gap-2">
                  {(id === "crew"
                    ? [
                        "Geofenced clock in/out with honest accuracy",
                        "Works with no signal, syncs without duplicates",
                        "Bilingual EN/ES crew app, per worker",
                        "Timesheet review and approve, full audit trail",
                        "Overtime alerts before the overtime exists",
                        "ADP and Gusto payroll CSVs",
                      ]
                    : [
                        "Everything in Crew",
                        "Jobs with labor bids in hours and dollars",
                        "Live labor cost against the bid",
                        "Budget alerts at 80% and 100%",
                        "Multi-crew reporting",
                      ]
                  ).map((line) => (
                    <li key={line} className="t-secondary flex items-start gap-2">
                      <span style={{ color: "var(--accent)", paddingTop: 2 }}>
                        <IconCheck size={16} />
                      </span>
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <p className="t-secondary mt-4">
          A 15-person crew on Crew is {formatMoneyCents(15 * PLANS.crew.seatPriceCents)}/month
          against a {formatMoneyCents(yearlyLeakCents(15))}/year padding leak. Annual billing is two
          months free — email us and we will set it up. Seasonal shop? Pause instead of cancelling.
        </p>

        <div className="mt-8">
          <Link href="/signup" className="btn btn-primary btn-full sm:w-auto">
            {CTA}
          </Link>
        </div>
      </section>

      {/* ---------------------------------------------------- final CTA --- */}
      <section className="screen hairline-t py-12" style={{ paddingBottom: 120 }}>
        <h2 className="t-h2" style={{ maxWidth: "22ch" }}>
          Stop signing Friday from memory.
        </h2>
        <p className="t-body mt-3" style={{ color: "var(--fg-2)", maxWidth: "42ch" }}>
          Add one job site, hand out one code, and tomorrow morning the timesheet writes itself — to
          the second.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link href="/signup" className="btn btn-primary btn-full sm:w-auto">
            {CTA}
          </Link>
          <Link href="/login" className="btn btn-secondary btn-full sm:w-auto">
            Sign in
          </Link>
        </div>
        <p className="t-secondary mt-8" style={{ color: "var(--fg-3)" }}>
          CrewClock is pre-launch: no customer logos, quotes or usage numbers appear on this page,
          because there are none yet. Everything shown is this build&rsquo;s own output.
        </p>
      </section>

      {/* Sticky thumb-zone CTA on phones — same words, every time. */}
      <StickyCta label={CTA} />
    </main>
  );
}
