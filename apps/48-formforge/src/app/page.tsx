import type { Metadata } from "next";
import Link from "next/link";
import { PLANS, perClinicianCents, priceLabel } from "@/lib/plans";
import { PHQ9 } from "@/lib/screeners";
import { IconCheck, IconLock, IconShieldCheck } from "@/components/icons";
import { IconShieldMark } from "@/components/TabBar";
import { PacketDemo } from "@/components/marketing/PacketDemo";

export const metadata: Metadata = {
  title: "FormForge — the clipboard, retired",
  description:
    "Patient intake for therapists and small clinics: structured forms, e-signatures with a hash and a timestamp, encrypted storage, and an audit trail you can read. Pre-launch.",
};

/**
 * The landing page, to MARKETING_PLAYBOOK.md.
 *
 * Enemy: the paper packet and the PHI sitting in a personal inbox.
 * One sentence: a signed intake packet should be evidence, not a scan.
 * Device: "the clipboard, retired — audit trail included."
 *
 * Law 5 is the one that constrains this page hardest: FormForge is pre-launch, so
 * there are no customers, no logos and no usage numbers to show. What is shown
 * instead is the product's own artifact — a real evidence stamp, rendered by the
 * same code the product uses — and it is labelled as a demo. Nothing on this page
 * claims compliance or a BAA, because neither exists yet.
 */
export default function LandingPage() {
  const primaryCta = "Start a 14-day trial";

  return (
    <div>
      {/* ---- nav ---- */}
      <header className="flex items-center justify-between px-5 py-4" style={{ maxWidth: 1120, margin: "0 auto" }}>
        <span className="flex items-center gap-2">
          <span style={{ color: "var(--color-teal)" }}>
            <IconShieldMark size={22} />
          </span>
          <span className="t-title">FormForge</span>
        </span>
        <Link href="/login" className="btn-quiet">
          Sign in
        </Link>
      </header>

      {/* ---- 1. hero: the machine running ---- */}
      <section className="px-5 pt-6" style={{ maxWidth: 1120, margin: "0 auto" }}>
        <p className="t-label mb-3">Patient intake · therapy and small clinics</p>
        <h1 className="t-display mb-4" style={{ maxWidth: "18ch" }}>
          The clipboard, retired.
        </h1>
        <p className="t-body mb-6" style={{ maxWidth: "44ch", color: "var(--color-ink-2)" }}>
          Your intake packet on a patient&apos;s phone, signed before they arrive — with the exact
          text they agreed to, hashed and timestamped, and a log of everyone who has read it.
        </p>

        <PacketDemo />

        <div className="mt-8">
          <Link href="/signup" className="btn btn-primary btn-full" style={{ maxWidth: 360 }}>
            {primaryCta}
          </Link>
          <p className="t-secondary mt-3">No card. Ten minutes to your first sent packet.</p>
        </div>
      </section>

      {/* ---- 2. the enemy ---- */}
      <section className="px-5 pt-20" style={{ maxWidth: 1120, margin: "0 auto" }}>
        <h2 className="t-h2 mb-4" style={{ maxWidth: "26ch" }}>
          Right now, the packet is a PDF in somebody&apos;s inbox.
        </h2>
        <div style={{ maxWidth: "58ch" }}>
          <p className="t-body mb-4">
            It comes back half-filled. The consent page is missing a signature, or a date, or both.
            Someone at the front desk retypes it. The original sits in a personal email account,
            which is where a records request eventually goes to die.
          </p>
          <p className="t-body">
            The fix is not a bigger EHR. It is a packet that scores its own screeners, refuses to
            finish without a signature, and can answer &ldquo;who opened this?&rdquo; in two taps.
          </p>
        </div>
      </section>

      {/* ---- 3. the three things that make it evidence ---- */}
      <section className="px-5 pt-20" style={{ maxWidth: 1120, margin: "0 auto" }}>
        <h2 className="t-h2 mb-6">Three things, done properly</h2>
        <ul className="list-none p-0" style={{ maxWidth: "58ch" }}>
          <Feature
            title="A signature is a copy, not a link"
            body="Signing stores the consent text exactly as it was shown, plus a SHA-256 over it, the time, and the IP. Edit the packet next month and it publishes a new version — the old signature keeps meaning what it meant, because it never read from the form."
          />
          <Feature
            title="Answers are ciphertext before they reach the database"
            body="AES-256-GCM under a data key unique to your practice, itself stored only in wrapped form. A copy of the database is not a copy of your patients' answers. A wrong key does not return garbage; it fails authentication and refuses."
          />
          <Feature
            title="The audit log cannot be edited — including by us"
            body="Every read, export, send and signature appends a row. The database refuses UPDATE, DELETE and TRUNCATE on that table with a trigger, so there is no application path to rewriting it. Exporting the log adds a row for the export."
          />
        </ul>
      </section>

      {/* ---- 4. receipts: the product's own artifact, labelled ---- */}
      <section className="px-5 pt-20" style={{ maxWidth: 1120, margin: "0 auto" }}>
        <h2 className="t-h2 mb-2">What the record looks like</h2>
        <p className="t-secondary mb-6" style={{ maxWidth: "50ch" }}>
          A staged demo — FormForge is pre-launch, so this is our own test data rather than a
          customer&apos;s. It is rendered by the code that renders the real thing.
        </p>

        <div className="panel p-4" style={{ maxWidth: 560 }}>
          <p className="t-label mb-3">Audit log · Riverbend Counseling (demo)</p>
          <ul className="list-none p-0">
            {[
              ["14:02:11", "SIGNED", "consent_treatment", "patient (own packet)", "73.92.1.8"],
              ["14:02:04", "EDITED", "section saved", "patient (own packet)", "73.92.1.8"],
              ["09:41:55", "EXPORTED", "packet PDF", "Adaeze Osei (owner)", "198.51.100.24"],
              ["09:41:02", "VIEWED", "packet", "Adaeze Osei (owner)", "198.51.100.24"],
              ["08:15:30", "SENT", "Behavioral health intake packet", "Dana Reyes (front desk)", "198.51.100.24"],
            ].map((row) => (
              <li key={row[0]} className="ledger-row">
                <span>{row[0]}</span>
                <span className="ledger-verb">{row[1]}</span>
                <span>{row[2]}</span>
                <span>{row[3]}</span>
                <span style={{ color: "var(--color-ink-3)" }}>{row[4]}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel mt-4 p-4" style={{ maxWidth: 560 }}>
          <p className="t-label mb-2">Screener scoring · both sides, one function</p>
          <p className="t-data" style={{ fontSize: 15 }}>
            PHQ-9 · 14 · MODERATE
          </p>
          <p className="t-secondary mt-2">
            {PHQ9.items.length} items, scored on the patient&apos;s phone for instant display and on
            the server for the record. Only the total and the band are stored outside the ciphertext,
            which is what lets the status board report severity without decrypting a packet.
          </p>
        </div>
      </section>

      {/* ---- 5. objection killer ---- */}
      <section className="px-5 pt-20" style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div className="panel p-5" style={{ maxWidth: "58ch" }}>
          <p className="t-title mb-3 flex items-center gap-2">
            <span style={{ color: "var(--color-teal)" }}>
              <IconShieldCheck size={20} />
            </span>
            &ldquo;Can I put real patient records in it?&rdquo;
          </p>
          <p className="t-body mb-4">
            Not yet, and we would rather say so than sell you a checkbox. FormForge is pre-launch: it
            has no executed Business Associate Agreement, no completed third-party security review,
            and no SOC 2 report. Using it with protected health information today would leave your
            practice without the vendor agreement HIPAA requires.
          </p>
          <p className="t-body">
            What exists is the engineering: per-practice envelope encryption, a database-enforced
            append-only audit log, tokenized patient links that are never stored in replayable form,
            and signature records that carry their own copy of what was signed. The paperwork comes
            after a security review, and you will be asked to read a dated agreement when it does.
          </p>
        </div>
      </section>

      {/* ---- 6. pricing, with the per-clinician math ---- */}
      <section className="px-5 pt-20" style={{ maxWidth: 1120, margin: "0 auto" }}>
        <h2 className="t-h2 mb-2">Priced per practice, not per clinician</h2>
        <p className="t-secondary mb-6" style={{ maxWidth: "50ch" }}>
          Per-seat intake inside an EHR runs $29–$99 per clinician per month. Here a four-clinician
          group pays ${(perClinicianCents("group", 4) / 100).toFixed(2)} a head.
        </p>

        <ul className="list-none p-0" style={{ maxWidth: 560 }}>
          {PLANS.map((plan) => (
            <li key={plan.id} className="panel mb-4 p-4">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <div>
                  <p className="t-title">{plan.name}</p>
                  <p className="t-secondary">{plan.blurb}</p>
                </div>
                <p className="t-data" style={{ fontSize: 15 }}>
                  {priceLabel(plan.id)}
                </p>
              </div>
              <p className="t-data mb-3" style={{ color: "var(--color-ink-3)" }}>
                ${(perClinicianCents(plan.id, plan.clinicianCap) / 100).toFixed(2)} PER CLINICIAN AT
                THE CAP
              </p>
              <ul className="list-none p-0">
                {plan.includes.map((line) => (
                  <li key={line} className="t-secondary flex items-start gap-2 py-0.5">
                    <span style={{ color: "var(--color-teal)" }}>
                      <IconCheck size={16} />
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- 7. final CTA, same words ---- */}
      <section className="px-5 pb-24 pt-20" style={{ maxWidth: 1120, margin: "0 auto" }}>
        <h2 className="t-h2 mb-3" style={{ maxWidth: "24ch" }}>
          Retire the clipboard. Keep the evidence.
        </h2>
        <Link href="/signup" className="btn btn-primary btn-full" style={{ maxWidth: 360 }}>
          {primaryCta}
        </Link>
        <p className="t-secondary mt-3 flex items-start gap-2" style={{ maxWidth: "44ch" }}>
          <IconLock size={18} />
          <span>
            Pre-launch software. Use test data until we tell you, in writing and with a dated
            agreement, that it is ready for real records.
          </span>
        </p>
      </section>

      <footer className="hairline-t px-5 py-8" style={{ maxWidth: 1120, margin: "0 auto" }}>
        <p className="t-secondary">
          FormForge · Patient intake, e-signature and an audit trail for small practices.
        </p>
        <p className="t-secondary mt-1" style={{ color: "var(--color-ink-3)" }}>
          Not HIPAA certified — no such certification exists. No SOC 2 report. No Business Associate
          Agreement offered yet.
        </p>
      </footer>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <li className="hairline-b py-5">
      <p className="t-title mb-2">{title}</p>
      <p className="t-body" style={{ color: "var(--color-ink-2)" }}>
        {body}
      </p>
    </li>
  );
}
