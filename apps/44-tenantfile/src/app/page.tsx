import type { Metadata } from "next";
import Link from "next/link";
import { FileStitch } from "@/components/marketing/FileStitch";
import { PLANS, PLAN_ORDER } from "@/lib/plans";
import { IconCheck } from "@/components/icons";

/**
 * The marketing page, to MARKETING_PLAYBOOK.md.
 *
 * Enemy: running three units out of a text thread and a shoebox, and having
 *   nothing on paper the day it goes wrong.
 * One sentence: TenantFile runs the tenancy and keeps the file, so the day you
 *   need records, they exist.
 * Device: three units out of the text thread — the file assembling itself.
 * CTA, repeated verbatim at hero, post-receipts, per plan, and at the close:
 *   "Start your file".
 *
 * Four motion beats and no more: the file stitching itself (hero) is the only
 * animation on the page; everything else is static and typeset. No fabricated
 * testimonials and no invented usage numbers — this product is pre-launch, and the
 * page says exactly that where social proof would normally sit.
 */

const CTA = "Start your file";

export const metadata: Metadata = {
  title: "TenantFile — three units out of the text thread",
  description:
    "Listings, applications, lease e-sign, a rent ledger with reminders, and a maintenance log with photo threads. TenantFile runs the tenancy and keeps the file, so the day you need records, they exist.",
  openGraph: {
    title: "TenantFile — three units out of the text thread",
    description: "The whole tenancy in one file. Built for landlords with 1–20 units.",
    type: "website",
  },
};

export default function LandingPage() {
  return (
    <>
      <header className="mx-auto flex max-w-[1120px] items-center justify-between px-5 py-5 md:px-8">
        <span className="t-label">TenantFile</span>
        <nav className="flex items-center gap-4">
          <Link href="/login" className="btn-quiet no-underline">
            Sign in
          </Link>
          <Link href="/signup" className="btn btn-primary no-underline" style={{ height: 40 }}>
            {CTA}
          </Link>
        </nav>
      </header>

      <main>
        {/* ---- Hero: the machine running, above the fold ---- */}
        <section className="mx-auto max-w-[1120px] px-5 pb-16 pt-6 md:px-8">
          <div className="grid gap-10 lg:grid-cols-[1fr_460px] lg:items-start lg:gap-16">
            <div>
              <h1 className="t-display">Three units out of the text thread.</h1>
              <p className="t-body mt-6 max-w-[54ch]" style={{ fontSize: 18 }}>
                TenantFile runs the tenancy and keeps the file — listing, application, lease, every payment, every repair
                — so the day you need records, they exist.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/signup" className="btn btn-primary no-underline">
                  {CTA}
                </Link>
                <Link href="#how" className="btn btn-secondary no-underline">
                  See what lands in it
                </Link>
              </div>
              <p className="t-secondary mt-4">30 days free. No card. Built for 1–20 units.</p>
            </div>

            <div>
              <FileStitch />
              <p className="t-secondary mt-3" style={{ color: "var(--color-text-3)" }}>
                A staged demo of one tenancy&apos;s file, assembling itself as things happen.
              </p>
            </div>
          </div>
        </section>

        {/* ---- The device: the shoebox becoming the file ---- */}
        <section className="hairline-t" style={{ background: "var(--color-card)" }}>
          <div className="mx-auto max-w-[1120px] px-5 py-16 md:px-8">
            <p className="t-label">The whole idea</p>
            <h2 className="t-h2 mt-3 max-w-[34ch]">
              Everything else sells you tasks. TenantFile&apos;s spine is the record.
            </h2>
            <div className="mt-10 grid gap-8 md:grid-cols-3">
              <Column
                heading="What happens now"
                lines={[
                  "The application is a PDF someone printed.",
                  "Screening is calling a previous landlord who might be a cousin.",
                  "Rent is scrolling a banking app for a Zelle.",
                  "The repair history is photos buried in Messages.",
                ]}
              />
              <Column
                heading="What TenantFile does"
                lines={[
                  "A listing link you paste anywhere, and applications that arrive complete.",
                  "The screening authorisation, dated and on file.",
                  "A ledger that reconciles, whether the money moved by bank or by Zelle.",
                  "A photo thread per repair, with what it cost.",
                ]}
              />
              <Column
                heading="What you have afterwards"
                lines={[
                  "One timestamped file per tenancy.",
                  "Exportable as a PDF a mediator can read.",
                  "Every reminder you sent, on the record.",
                  "Nothing left to reconstruct from memory.",
                ]}
              />
            </div>
          </div>
        </section>

        {/* ---- The math ---- */}
        <section className="mx-auto max-w-[1120px] px-5 py-16 md:px-8" id="how">
          <p className="t-label">The math</p>
          <h2 className="t-h2 mt-3 max-w-[34ch]">A property manager takes 8% of the rent. Every month. Forever.</h2>

          <div className="scroll-x mt-8">
            <table className="w-full border-collapse" style={{ minWidth: 420 }}>
              <tbody>
                <MathRow left="Three units at $1,850 a month" right="$5,550 / mo" />
                <MathRow left="A property manager at 8% of that" right="−$444 / mo" />
                <MathRow left="Plus a leasing fee, typically half a month" right="−$925 / vacancy" />
                <MathRow left="TenantFile, Keys plan" right="−$19 / mo" strong />
              </tbody>
              <tfoot>
                <tr>
                  <td className="t-secondary py-4">
                    A manager earns their fee at fifty doors. At three, the arithmetic does not work — and it never did.
                  </td>
                  <td className="t-data py-4 text-right" style={{ color: "var(--color-rent-green)" }}>
                    $425 / mo kept
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* ---- Objection killer ---- */}
        <section className="hairline-t" style={{ background: "var(--color-card)" }}>
          <div className="mx-auto max-w-[1120px] px-5 py-16 md:px-8">
            <p className="t-label">The obvious objection</p>
            <h2 className="t-h2 mt-3 max-w-[36ch]">&ldquo;My tenants pay by Zelle. Why would I need this?&rdquo;</h2>
            <p className="t-body mt-6 max-w-[62ch]">
              Keep using Zelle. TenantFile does not need to touch the money to be worth having. Mark a payment paid, choose
              Zelle, and the ledger stays true: partial payments, prorated first months, late fees under your own rule, and
              a running balance that reconciles against your bank statement to the cent.
            </p>
            <p className="t-body mt-4 max-w-[62ch]">
              The reminders still go out before rent is due, on the day, and after your grace period. Every one of them is
              checked against the ledger the instant before it sends, so nobody who has paid ever gets chased.
            </p>
            <div className="notice mt-8 max-w-[62ch]">
              <p className="t-secondary">
                And on the day a deposit is disputed, you export the file: every charge, every payment, every message, every
                photograph, in date order, as a PDF. That is the part you cannot build out of a text thread afterwards.
              </p>
            </div>
          </div>
        </section>

        {/* ---- Receipts: honest, because this is pre-launch ---- */}
        <section className="mx-auto max-w-[1120px] px-5 py-16 md:px-8">
          <p className="t-label">Receipts</p>
          <h2 className="t-h2 mt-3 max-w-[34ch]">No testimonials yet, because there are no customers yet.</h2>
          <p className="t-body mt-6 max-w-[62ch]">
            TenantFile is pre-launch. Rather than invent a landlord who loves it, here is exactly what the software does
            today — each of these is checked against a real database on every build:
          </p>
          <ul className="mt-8 grid list-none gap-4 p-0 md:grid-cols-2">
            <Receipt>
              A move-in on the 12th of a 30-day month bills <span className="t-data">$1,171.67</span> of{" "}
              <span className="t-data">$1,850.00</span> rent — that month&apos;s own daily rate, rounded exactly once.
            </Receipt>
            <Receipt>
              A late fee is assessed the day grace runs out and never twice. The second run of the engine charges nothing,
              enforced by a database constraint rather than a hopeful check.
            </Receipt>
            <Receipt>
              A reminder scheduled for the 7th and then paid on the 2nd is cancelled with a reason you can read — and the
              sender re-checks the ledger anyway before it sends.
            </Receipt>
            <Receipt>
              The exported file is a real multi-page PDF with the maintenance photographs embedded, and it refuses to be
              produced at all if a single charge or payment is missing from it.
            </Receipt>
          </ul>
          <div className="mt-10">
            <Link href="/signup" className="btn btn-primary no-underline">
              {CTA}
            </Link>
          </div>
        </section>

        {/* ---- Pricing ---- */}
        <section className="hairline-t" style={{ background: "var(--color-card)" }} id="pricing">
          <div className="mx-auto max-w-[1120px] px-5 py-16 md:px-8">
            <p className="t-label">Pricing</p>
            <h2 className="t-h2 mt-3 max-w-[38ch]">One deposit dispute costs more than a year of this.</h2>
            <p className="t-body mt-4 max-w-[58ch]">
              Landlord-paid, transparently. The only thing an applicant ever pays for is their own screening report, and
              that money goes to the screening company, not to us.
            </p>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {PLAN_ORDER.map((id) => {
                const p = PLANS[id];
                return (
                  <article key={id} className="card flex flex-col p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="t-title">{p.name}</h3>
                      <p className="t-data">${p.priceMonthly}/mo</p>
                    </div>
                    <p className="t-data mt-2" style={{ color: "var(--color-text-3)" }}>
                      ${(p.priceMonthly / p.units).toFixed(2)} per unit at {p.units} units
                    </p>
                    <p className="t-secondary mt-3 flex-1">{p.blurb}</p>
                    <Link href="/signup" className="btn btn-secondary btn-full mt-4 no-underline">
                      {CTA}
                    </Link>
                  </article>
                );
              })}
            </div>
            <p className="t-secondary mt-6">
              Annual billing is two months free. The 30-day trial is keyed to a real vacancy: fill the unit free.
            </p>
          </div>
        </section>

        {/* ---- Where it deliberately stops ---- */}
        <section className="mx-auto max-w-[1120px] px-5 py-16 md:px-8">
          <p className="t-label">Where it stops</p>
          <h2 className="t-h2 mt-3 max-w-[36ch]">Built for 1–20 units, honestly.</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <p className="t-body max-w-[52ch]">
              No trust accounting, no owner statements, no seat pricing. The feature set stops where professional
              management begins, and that is what keeps it legible to somebody who is not a software person.
            </p>
            <p className="t-body max-w-[52ch]">
              TenantFile does not run credit or background checks, does not hold what a screening report says, and will
              never score or rank an applicant. It records that the applicant authorised a check, which agency you used,
              and when the report arrived — and it writes the adverse-action notice for you if you decline them. That is
              paperwork help, not legal advice.
            </p>
          </div>
        </section>

        {/* ---- Final CTA ---- */}
        <section className="hairline-t" style={{ background: "var(--color-card)" }}>
          <div className="mx-auto max-w-[1120px] px-5 py-20 text-center md:px-8">
            <h2 className="t-display mx-auto max-w-[24ch]">The day you need records, have them.</h2>
            <p className="t-body mx-auto mt-6 max-w-[48ch]">
              Add one unit. The listing link, the application form, the ledger and the file already exist.
            </p>
            <div className="mt-8 flex justify-center">
              <Link href="/signup" className="btn btn-primary no-underline">
                {CTA}
              </Link>
            </div>
            <p className="t-secondary mt-4">30 days free. No card.</p>
          </div>
        </section>
      </main>

      <footer className="hairline-t">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-3 px-5 py-10 md:flex-row md:items-center md:justify-between md:px-8">
          <span className="t-label">TenantFile</span>
          <p className="t-secondary m-0">
            Pre-launch. State late-fee guidance in the app is information, not legal advice.
          </p>
        </div>
      </footer>

      {/* Sticky CTA on phones: the whole page is one offer. */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 p-4 md:hidden"
        style={{
          background: "color-mix(in srgb, var(--color-porch) 94%, transparent)",
          backdropFilter: "blur(12px)",
          borderTop: "1px solid var(--color-hairline)",
          paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
        }}
      >
        <Link href="/signup" className="btn btn-primary btn-full no-underline">
          {CTA}
        </Link>
      </div>
      <div className="h-24 md:hidden" aria-hidden="true" />
    </>
  );
}

function Column({ heading, lines }: { heading: string; lines: string[] }) {
  return (
    <div>
      <h3 className="t-label">{heading}</h3>
      <ul className="mt-4 flex list-none flex-col gap-3 p-0">
        {lines.map((line) => (
          <li key={line} className="t-body hairline-b pb-3">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MathRow({ left, right, strong }: { left: string; right: string; strong?: boolean }) {
  return (
    <tr>
      <td className={`hairline-b py-4 ${strong ? "t-title" : "t-body"}`}>{left}</td>
      <td className="t-data hairline-b py-4 text-right" style={{ fontSize: strong ? 16 : undefined }}>
        {right}
      </td>
    </tr>
  );
}

function Receipt({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span style={{ color: "var(--color-rent-green)" }} className="mt-1 shrink-0">
        <IconCheck size={18} />
      </span>
      <span className="t-body">{children}</span>
    </li>
  );
}
