import type { Metadata } from "next";
import Link from "next/link";
import { IconLockSmall, IconMark, IconShieldLine } from "@/components/icons";
import { PLANS } from "@/lib/plans";
import { formatCents } from "@/lib/format";

export const metadata: Metadata = {
  title: "SessionScribe — the note finished before the next client sits down",
  description:
    "Record, upload, or type shorthand after a session. A SOAP or DAP draft is waiting in about two minutes. You review, edit and sign — nothing is ever auto-filed.",
};

/**
 * The marketing page, per MARKETING_PLAYBOOK.md.
 *
 * Enemy: pajama time. One sentence: the note finished before the next client
 * sits down. Device: the between-sessions clock — 3:00 session ends, 3:02 draft
 * ready, 3:07 signed, 3:10 next client — reused in the hero, the math and the
 * pricing. One CTA phrase, verbatim in four places: "Start free — 14 days".
 *
 * Every artifact shown below is a **staged demo with a fictional client**, and
 * says so where it appears. There are no testimonials, no logos and no usage
 * numbers, because this product is pre-launch and inventing them would be a
 * trust debt the brand never pays off.
 */
export default function LandingPage() {
  return (
    <>
      <header className="mk-section" style={{ paddingBottom: 0 }}>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span style={{ color: "var(--color-sage)" }}>
              <IconMark size={22} />
            </span>
            <span className="t-title">SessionScribe</span>
          </span>
          <Link className="btn-quiet btn-quiet-sm" href="/login">
            Sign in
          </Link>
        </div>
      </header>

      {/* ---- Hero: the machine running, above the fold ---- */}
      <section className="mk-section" style={{ paddingTop: 32 }}>
        <p className="mk-eyebrow mb-3">For solo therapists and counselors</p>
        <h1 className="t-display mb-4" style={{ maxWidth: "22ch" }}>
          The note finished before the next client sits down.
        </h1>
        <p className="mk-lede mb-6">
          Pajama time is the two hours after dinner spent rebuilding six sessions from
          memory. Capture the session — record it, upload it, or type a line of
          shorthand — and a draft in your format is waiting at 3:02. You review, edit,
          and sign it by 3:07.
        </p>

        <div className="md:grid md:grid-cols-2 md:items-start md:gap-8">
          <HeroDraft />
          <div className="mt-6 md:mt-0">
            <Link className="btn btn-primary btn-full md:w-auto" href="/signup">
              Start free — 14 days
            </Link>
            <p className="t-secondary mt-3">
              No card required. BAA included on every paid plan.
            </p>
          </div>
        </div>
      </section>

      <div className="mk-rule" />

      {/* ---- The device: the between-sessions clock ---- */}
      <section className="mk-section mk-beat">
        <p className="mk-eyebrow mb-3">The between-sessions clock</p>
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["3:00", "Session ends", "You stand up. You have ten minutes."],
            ["3:02", "Draft ready", "Transcribed, separated by speaker, drafted section by section."],
            ["3:07", "Signed", "Reviewed, edited where it needed it, signed with your credentials."],
            ["3:10", "Next client", "Nothing follows you home."],
          ].map(([time, title, body]) => (
            <div key={time} className="panel p-4">
              <p className="t-clock mb-1" style={{ fontSize: 34 }}>
                {time}
              </p>
              <p className="t-title mb-1">{title}</p>
              <p className="t-secondary">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mk-rule" />

      {/* ---- The math ---- */}
      <section className="mk-section mk-beat">
        <p className="mk-eyebrow mb-3">The arithmetic</p>
        <h2 className="t-h2 mb-4" style={{ maxWidth: "30ch" }}>
          Seven hours of notes a week, against sixty-nine dollars a month.
        </h2>
        <div className="panel p-5">
          <dl className="grid gap-4 md:grid-cols-3">
            <div>
              <dt className="t-label">A common week</dt>
              <dd className="t-clock" style={{ fontSize: 34 }}>
                6–8 h
              </dd>
              <dd className="t-secondary">
                on documentation, most of it after hours — the most-cited
                administrative burden in private-practice surveys.
              </dd>
            </div>
            <div>
              <dt className="t-label">At $140 a session</dt>
              <dd className="t-clock" style={{ fontSize: 34 }}>
                ≈ $840
              </dd>
              <dd className="t-secondary">
                of billable-equivalent time, every week, spent writing what the day left
                no room to write.
              </dd>
            </div>
            <div>
              <dt className="t-label">Caseload plan</dt>
              <dd className="t-clock" style={{ fontSize: 34 }}>
                $69/mo
              </dd>
              <dd className="t-secondary">
                Unlimited notes. One recovered evening pays for the year, twice over.
              </dd>
            </div>
          </dl>
        </div>
        <p className="t-secondary mt-3">
          The hours are the range clinicians report; the dollar figures are arithmetic
          from a $140 session, not a claim about your practice.
        </p>
      </section>

      <div className="mk-rule" />

      {/* ---- Receipts: staged, labelled, fictional ---- */}
      <section className="mk-section mk-beat">
        <p className="mk-eyebrow mb-3">What you actually get</p>
        <h2 className="t-h2 mb-4" style={{ maxWidth: "34ch" }}>
          Every drafted sentence traces back to the tape.
        </h2>
        <div className="md:grid md:grid-cols-2 md:gap-8">
          <div>
            <div className="panel p-4">
              <p className="t-label mb-2">Objective</p>
              <p className="t-body">
                <span
                  style={{
                    textDecoration: "underline",
                    textDecorationColor: "var(--color-sage)",
                    textDecorationThickness: "1.5px",
                    textUnderlineOffset: "3px",
                  }}
                >
                  Clinician reviewed the exposure hierarchy and the client completed step
                  three twice between sessions.
                </span>{" "}
                Anxiety was rated 7/10 at onset, dropping to 4/10 after approximately ten
                minutes in both attempts.
              </p>
              <div className="hairline-t mt-3 pt-3">
                <p className="t-data t-faint mb-1">12:04 Client</p>
                <p
                  className="t-transcript"
                  style={{
                    background: "color-mix(in srgb, var(--color-sage) 12%, transparent)",
                    borderRadius: 8,
                    padding: 8,
                  }}
                >
                  I did step three twice — driving to the shopping centre and sitting in
                  the car park without going in.
                </p>
              </div>
            </div>
            <p className="t-secondary mt-3">
              Staged demo with a fictional client, drafted by SessionScribe&rsquo;s own
              pipeline from a scripted session. Not a real client and not a real note.
            </p>
          </div>

          <div className="mt-6 md:mt-0">
            <div className="panel p-4">
              <p className="t-label mb-2">The signed artifact</p>
              <svg viewBox="0 0 160 26" width="160" height="26" aria-hidden="true">
                <path
                  className="sig-line"
                  d="M4 18 C 22 2 36 24 54 12 C 68 2 84 22 104 14 C 118 8 132 16 156 8"
                />
              </svg>
              <p className="t-title mt-1">Dana Alvarez, LMFT #114382</p>
              <p className="t-data t-faint">
                signed v2 · 2026-07-17 15:07 · a41f4c9d…9c2e
              </p>
              <div className="hairline-t mt-3 flex items-center gap-2 pt-3">
                <span style={{ color: "var(--color-ink-3)" }}>
                  <IconLockSmall size={18} />
                </span>
                <span className="t-secondary">
                  Locked. An amendment would create a new signed version, and the export
                  renders the whole chain.
                </span>
              </div>
            </div>
            <p className="t-secondary mt-3">
              Example signature block from the demo above — fictional clinician,
              fictional licence number, real hash format.
            </p>
          </div>
        </div>
      </section>

      <div className="mk-rule" />

      {/* ---- Objection killer ---- */}
      <section className="mk-section mk-beat">
        <p className="mk-eyebrow mb-3">The obvious objection</p>
        <h2 className="t-h2 mb-4" style={{ maxWidth: "30ch" }}>
          &ldquo;An AI wrote my chart?&rdquo; No. It drafted; you signed.
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="panel p-4">
            <p className="t-title mb-1">There is no auto-file path</p>
            <p className="t-secondary">
              One function in the codebase can mark a note signed, and it writes your
              signature row in the same database transaction. Nothing scheduled, and no
              background job, can sign anything.
            </p>
          </div>
          <div className="panel p-4">
            <p className="t-title mb-1">Signed means locked</p>
            <p className="t-secondary">
              A signed version is immutable — enforced in the code and again by the
              database. Amendments create a new signed version rather than editing the
              old one.
            </p>
          </div>
          <div className="panel p-4">
            <p className="mb-1 flex items-center gap-2">
              <span style={{ color: "var(--color-sage)" }}>
                <IconShieldLine size={18} />
              </span>
              <span className="t-title">You can read the log</span>
            </p>
            <p className="t-secondary">
              Every view, edit, signature, export and purge, with actor, timestamp and
              IP — in the product, not in a support ticket. Audio and transcripts purge
              on your schedule; the signed note is the durable record.
            </p>
          </div>
        </div>
        <p className="mt-6">
          <Link className="btn btn-primary" href="/signup">
            Start free — 14 days
          </Link>
        </p>
      </section>

      <div className="mk-rule" />

      {/* ---- Pricing ---- */}
      <section className="mk-section mk-beat">
        <p className="mk-eyebrow mb-3">Pricing</p>
        <h2 className="t-h2 mb-4">Per clinician, by note volume.</h2>
        <div className="mk-price-grid">
          {Object.values(PLANS).map((plan) => (
            <div key={plan.id} className="panel p-5">
              <p className="t-label mb-1">{plan.name}</p>
              <p className="t-h2 mb-1">
                {formatCents(plan.priceCents)}
                <span className="t-secondary"> /mo</span>
              </p>
              <p className="t-secondary mb-4">{plan.blurb}</p>
              <ul className="mb-5">
                {plan.includes.map((line) => (
                  <li key={line} className="t-secondary mb-1">
                    {line}
                  </li>
                ))}
              </ul>
              <Link className="btn btn-secondary btn-full" href="/signup">
                Start free — 14 days
              </Link>
            </div>
          ))}
        </div>
        <p className="t-secondary mt-4">
          Fourteen days, every feature, no card. Annual billing is two months free. BAA
          signed on all paid plans. If you ever stop paying, your signed notes stay
          readable and exportable — permanently.
        </p>
      </section>

      <div className="mk-rule" />

      {/* ---- Final CTA ---- */}
      <section className="mk-section" style={{ paddingBottom: 96 }}>
        <h2 className="t-display mb-4" style={{ maxWidth: "24ch" }}>
          Write the note at 3:05, not at 10pm.
        </h2>
        <Link className="btn btn-primary" href="/signup">
          Start free — 14 days
        </Link>
        <p className="t-secondary mt-6">
          SessionScribe is note-writing after sessions. It is not an EHR, and it does not
          do intake — the signed PDF files anywhere, so switching cost to try it is zero.
        </p>
        <p className="t-secondary mt-6 t-faint">
          Pre-launch. Nothing on this page is a customer testimonial, a logo, or a usage
          statistic, because we do not have any yet — every artifact shown is our own
          staged demo with a fictional client, labelled as such.
        </p>
      </section>

      {/* Sticky mobile bar: same CTA phrase, verbatim. */}
      <div className="mk-sticky">
        <Link className="btn btn-primary btn-full" href="/signup">
          Start free — 14 days
        </Link>
      </div>
    </>
  );
}

/**
 * Beat 1: the draft assembling section by section against the clock — S, O, A, P
 * stamping in. Pure HTML and CSS so the hero is the LCP element rather than a
 * canvas, and the whole thing is complete (just un-animated) under
 * `prefers-reduced-motion`.
 */
function HeroDraft() {
  const lines: [string, string][] = [
    ["Subjective", "Client reported the week as mixed, with sleep disrupted after a work review on Wednesday."],
    ["Objective", "Anxiety rated 8/10 at its worst, 4/10 in session. Breathing practice attempted twice."],
    ["Assessment", "Pattern consistent with earlier sessions: catastrophic appraisal of neutral feedback."],
    ["Plan", "Thought record at symptom onset; two-minute breathing practice before judging effect."],
  ];
  return (
    <div className="note-sheet p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="t-label">J.R. — CBT / SOAP</span>
        <span className="clock-chip t-data">ready 3:02</span>
      </div>
      {lines.map(([label, body], i) => (
        <div
          key={label}
          className="mk-draft-line"
          style={{ animationDelay: `${400 + i * 420}ms` }}
        >
          <p className="t-label mb-1">{label}</p>
          <p className="t-body mb-3">{body}</p>
        </div>
      ))}
      <p className="t-secondary hairline-t pt-3">
        Staged demo, fictional client. In the product this is where you edit, trace any
        sentence back to the recording, and sign.
      </p>
    </div>
  );
}
