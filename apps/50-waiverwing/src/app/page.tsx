import type { Metadata } from "next";
import Link from "next/link";
import { RetrievalDemo } from "@/components/marketing/RetrievalDemo";
import { Blaze } from "@/components/Blaze";
import {
  IconCheck,
  IconLink,
  IconQr,
  IconShieldSlash,
  IconWifiOff,
} from "@/components/icons";
import { PLAN_ORDER, PLANS } from "@/lib/plans";

/**
 * The marketing page, to MARKETING_PLAYBOOK.md.
 *
 * Enemy: the binder — and specifically the two moments it fails, the Saturday
 * queue and the records request eighteen months later.
 * One sentence: a waiver that can't be found or can't be attributed is a waiver
 * that never existed.
 * Device: **signed, searchable, on file in seconds** — the retrieval demo up top,
 * repeated in the pricing math and the closing line.
 * One CTA phrase, verbatim everywhere: "Take your first signature".
 *
 * No testimonials, no logos, no usage numbers: this product is pre-launch and the
 * playbook forbids inventing any of them. The receipts here are the artifacts the
 * product itself produces, labelled as staged demos.
 */

export const metadata: Metadata = {
  title: "WaiverWing — signed, searchable, on file in seconds",
  description:
    "Digital waivers for gyms, tour operators and rental shops. Real guardian signing for minors, QR and kiosk self-serve check-in, and a participant database you can search when a lawyer asks.",
};

const CTA = "Take your first signature";

function Cta({ variant = "primary" }: { variant?: "primary" | "secondary" }) {
  return (
    <Link
      href="/signup"
      className={variant === "primary" ? "btn btn-primary" : "btn btn-secondary"}
    >
      {CTA}
    </Link>
  );
}

export default function LandingPage() {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 pb-24 lg:px-8">
      <header className="flex items-center justify-between gap-4 py-5">
        <div className="flex items-center gap-2">
          <Blaze size={22} draw={false} />
          <span className="t-title">WaiverWing</span>
        </div>
        <Link href="/login" className="btn-quiet">
          Sign in
        </Link>
      </header>

      {/* 1 — Hero: the claim, and the machine running. */}
      <section className="pt-6 lg:grid lg:grid-cols-2 lg:items-center lg:gap-12">
        <div>
          <p className="t-label">For gyms, outfitters and rental counters</p>
          <h1 className="t-display mt-4">Signed, searchable, on file in seconds.</h1>
          <p className="t-body mt-5" style={{ color: "var(--color-text-2)" }}>
            A waiver that can&rsquo;t be found, or was signed by the fourteen-year-old themselves,
            is a waiver that never existed. WaiverWing takes the signature in under a minute and
            hands you the record — with the exact text, the guardian, and the timestamp — the day a
            lawyer asks for it.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <Cta />
            <span className="t-secondary">14 days, every feature, no card.</span>
          </div>
        </div>

        <div className="mt-10 lg:mt-0">
          <RetrievalDemo />
        </div>
      </section>

      {/* 2 — The enemy, named. */}
      <section className="mt-24">
        <p className="t-label">The enemy</p>
        <h2 className="t-h2 mt-3 max-w-[30ch]">
          The binder fails twice, and only one of them is annoying.
        </h2>
        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <div>
            <p className="t-title">Saturday, 09:40</p>
            <p className="t-secondary mt-2">
              Six people at the counter, one clipboard speech, and a family whose 14-year-old
              came with an aunt. Someone signs something. Usually the wrong person, in the wrong
              box, and nobody notices for eighteen months.
            </p>
          </div>
          <div>
            <p className="t-title">Eighteen months later</p>
            <p className="t-secondary mt-2">
              A letter arrives asking for one signed waiver. It is in a box, or the March binder,
              or it was signed by the minor themselves — which makes it worth approximately
              nothing. This is the failure that costs money.
            </p>
          </div>
        </div>
      </section>

      {/* 3 — The three things that actually differ. */}
      <section className="mt-24">
        <p className="t-label">What is different here</p>
        <div className="mt-6">
          <div className="hairline-b py-6">
            <div className="flex items-start gap-3">
              <IconLink size={20} style={{ color: "var(--color-trail)", flex: "none" }} />
              <div>
                <p className="t-title">Minors done properly, on the first screen</p>
                <p className="t-secondary mt-2">
                  One guardian, three kids, one signature. Each child gets their own record with
                  the relationship captured and the guardian linked. A person under the age of
                  majority can never be the signer — not for themselves, not for a sibling — and
                  the flow says so in plain language instead of failing silently.
                </p>
                <p className="t-secondary mt-2">
                  When a minor turns 18 mid-season, the guardian&rsquo;s authority ends. Their
                  next visit shows amber with the reason, and one tap sends them a link to sign in
                  their own name. Nobody else in this category handles that.
                </p>
              </div>
            </div>
          </div>

          <div className="hairline-b py-6">
            <div className="flex items-start gap-3">
              <IconShieldSlash size={20} style={{ color: "var(--color-trail)", flex: "none" }} />
              <div>
                <p className="t-title">The signature is an evidence artifact, not a row</p>
                <p className="t-secondary mt-2">
                  Every signature stores the exact waiver text that was on the screen, a SHA-256
                  over it, the timestamp, the IP, the device and the channel. Edit your waiver next
                  season and a new version is published — what somebody agreed to last March is
                  untouched, and the PDF proves it.
                </p>
              </div>
            </div>
          </div>

          <div className="hairline-b py-6">
            <div className="flex items-start gap-3">
              <IconWifiOff size={20} style={{ color: "var(--color-trail)", flex: "none" }} />
              <div>
                <p className="t-title">A kiosk that survives your Wi-Fi</p>
                <p className="t-secondary mt-2">
                  Whatever tablet you already have, added to the home screen. No app store, no
                  hardware to buy. When the connection drops it keeps taking signatures and stores
                  them on the device, then uploads them exactly once when the Wi-Fi is back — the
                  header shows the queue depth so your staff never have to guess.
                </p>
              </div>
            </div>
          </div>

          <div className="py-6">
            <div className="flex items-start gap-3">
              <IconQr size={20} style={{ color: "var(--color-trail)", flex: "none" }} />
              <div>
                <p className="t-title">The queue signs itself</p>
                <p className="t-secondary mt-2">
                  Print one QR poster and put it where the line forms. People sign on their own
                  phone before they reach you, and arrive already on the board.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4 — The math, calculated in front of them. */}
      <section className="mt-24">
        <p className="t-label">The math</p>
        <h2 className="t-h2 mt-3 max-w-[34ch]">
          Ninety seconds of counter time per customer, at your own hourly cost.
        </h2>
        <div className="panel mt-6 p-5">
          <div className="hairline-b flex items-baseline justify-between gap-4 py-3">
            <span className="t-secondary">Walk-ups on a busy Saturday</span>
            <span className="t-data">120</span>
          </div>
          <div className="hairline-b flex items-baseline justify-between gap-4 py-3">
            <span className="t-secondary">Counter time saved per person</span>
            <span className="t-data">90 s</span>
          </div>
          <div className="hairline-b flex items-baseline justify-between gap-4 py-3">
            <span className="t-secondary">Front-desk hours returned that day</span>
            <span className="t-data">3.0 h</span>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-3">
            <span className="t-secondary">At $18/hour, in one Saturday</span>
            <span className="t-stat" style={{ fontSize: "28px" }}>
              $54
            </span>
          </div>
          <p className="t-secondary mt-3">
            Front Desk costs $59 a month. Two Saturdays pay for it, and the retrieval — the part
            you buy it for — is free after that. Your numbers, not ours: change the walk-ups and
            the hourly rate and the arithmetic is the same shape.
          </p>
        </div>
      </section>

      {/* 5 — Objection killer. */}
      <section className="mt-24">
        <p className="t-label">The obvious objection</p>
        <h2 className="t-h2 mt-3 max-w-[34ch]">
          &ldquo;We are not lawyers, and neither are you.&rdquo;
        </h2>
        <p className="t-body mt-4 max-w-[62ch]" style={{ color: "var(--color-text-2)" }}>
          Correct. WaiverWing is the signing and retrieval machinery, not legal advice. We ship
          activity-specific templates for climbing, trampoline parks, guided tours and rentals,
          and every one of them says the same thing on the screen: a starting point, not legal
          advice — have your attorney review the language before you take a real signature on it.
        </p>
        <p className="t-body mt-4 max-w-[62ch]" style={{ color: "var(--color-text-2)" }}>
          What we will claim is factual and narrow: we record what was agreed, by whom, when, from
          what device, and we can prove the text has not changed since. That is the evidence
          summary on every export. Whether it is enforceable in your state is your attorney&rsquo;s
          call, and we do not pretend otherwise.
        </p>
      </section>

      {/* 6 — Pricing, anchored. */}
      <section className="mt-24">
        <p className="t-label">Pricing</p>
        <h2 className="t-h2 mt-3">Per location, by volume. Three tiers, soft caps.</h2>
        <p className="t-secondary mt-3 max-w-[62ch]">
          Going over your cap shows a banner and prompts an upgrade. It never blocks a signature —
          a waiver refused at a busy counter is the one failure we are not willing to ship.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PLAN_ORDER.map((id) => {
            const spec = PLANS[id];
            const bullets =
              id === "counter"
                ? [
                    "Waiver builder with versioning",
                    "Guardian signing for minors",
                    "QR self-serve signing",
                    "Searchable participant database",
                    "Signed-waiver PDF export",
                  ]
                : id === "front_desk"
                  ? [
                      "Everything in Counter",
                      "Kiosk mode with offline queue",
                      "Check-in board and re-sign prompts",
                      "Incident notes linked to waivers",
                      "CSV export",
                    ]
                  : [
                      "Everything in Front Desk",
                      "3 locations, multiple kiosks",
                      "Webhook out",
                      "Branded emails, unbranded posters",
                      "Priority support",
                    ];
            return (
              <div key={id} className="panel flex flex-col p-5">
                <p className="t-label">{spec.name}</p>
                <p className="t-stat mt-2" style={{ fontSize: "34px" }}>
                  ${spec.priceMonthly}
                </p>
                <p className="t-secondary">
                  per month · up to {spec.waiversPerMonth.toLocaleString("en-US")} waivers
                </p>
                <ul className="mt-4 flex flex-1 flex-col gap-2">
                  {bullets.map((b) => (
                    <li key={b} className="t-secondary flex items-start gap-2">
                      <IconCheck size={16} style={{ color: "var(--color-pine)", flex: "none" }} />
                      {b}
                    </li>
                  ))}
                </ul>
                <p className="t-secondary mt-4">
                  ${spec.priceAnnual} a year — two months free.
                </p>
              </div>
            );
          })}
        </div>

        <p className="t-secondary mt-6 max-w-[62ch]">
          For comparison, the category incumbent starts at $19 and runs past $155 a month by
          volume. We are not cheaper at the bottom; we are simpler in the middle, where most
          operators actually sit — three tiers, no per-template fees, no setup charge.
        </p>

        <div className="mt-8">
          <Cta />
        </div>
      </section>

      {/* 7 — Final CTA: the claim as an imperative. */}
      <section className="mt-24">
        <div className="sheet px-6 py-12 text-center">
          <div className="flex justify-center">
            <Blaze size={40} draw={false} />
          </div>
          <h2 className="t-h2 mt-6">Retire the binder before the next Saturday.</h2>
          <p className="t-body mx-auto mt-3 max-w-[46ch]" style={{ color: "var(--color-text-2)" }}>
            Pick a template, print one poster, and take a real signature on a phone. Fifteen
            minutes, unassisted.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Cta />
            <Link href="/login" className="btn btn-secondary">
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <footer className="hairline-t mt-16 flex flex-wrap items-center justify-between gap-4 pt-6">
        <div className="flex items-center gap-2">
          <Blaze size={18} draw={false} />
          <span className="t-secondary">WaiverWing</span>
        </div>
        <p className="t-secondary">
          Signing and retrieval machinery. Not legal advice — have your attorney review your
          waiver language.
        </p>
      </footer>

      {/* Sticky mobile CTA: same words, in the thumb zone. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-hairline)] bg-[color-mix(in_srgb,var(--color-slab)_94%,transparent)] px-5 py-3 backdrop-blur md:hidden">
        <Link href="/signup" className="btn btn-primary btn-full">
          {CTA}
        </Link>
      </div>
    </div>
  );
}
