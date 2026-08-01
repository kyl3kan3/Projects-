import type { Metadata } from "next";
import Link from "next/link";
import { QueueJump } from "@/components/marketing/QueueJump";
import { RewardGates } from "@/components/RewardGates";
import { IconCheck, IconFlag, IconLock, Wordmark } from "@/components/icons";
import { PLANS, limitLabel } from "@/lib/plans";
import { DEFAULT_REWARD_TIERS } from "@/lib/referrals";
import { SIGNUP_EXPORT_HEADER } from "@/lib/csv";

/**
 * The landing page.
 *
 * Message architecture (MARKETING_PLAYBOOK law 1):
 *   Enemy    — the waitlist that just sits there. A list that doesn't grow is a
 *              spreadsheet you paid four tools to maintain.
 *   Sentence — "A waitlist that grows itself."
 *   Arc      — hook (the queue jump running) → tension (the maths of a loop) →
 *              proof (the product's own artifacts) → offer (pricing, anchored).
 *
 * Device: **#347 → #12**. Four animated moments and no more: the jump, the
 * gates rising, the K-factor arithmetic, nothing else.
 *
 * Receipts are the product's own output — the real reward ladder every list
 * ships with, the real CSV header, the real webhook payload. No testimonials, no
 * logos, no usage numbers: this is pre-launch and inventing those would be a
 * debt the brand never pays off (law 5).
 */

export const metadata: Metadata = {
  title: "LaunchList — a waitlist that grows itself",
  description:
    "A launch page, a confirmed-email queue, and referral mechanics that work on the first signup. #347 → #12, out of the box.",
  openGraph: {
    title: "A waitlist that grows itself",
    description:
      "Position tracking, share links, skip-the-line rewards and fraud filtering — working on your first signup.",
  },
};

/** The one CTA phrase. Repeated verbatim, four times (law 7). */
const CTA = "Start a waitlist — free";

const TIERS = DEFAULT_REWARD_TIERS.map((tier, index) => ({
  id: `demo-${index}`,
  threshold: tier.threshold,
  label: tier.label,
  description: tier.description,
}));

export default function LandingPage() {
  return (
    <div>
      <header className="page-column" style={{ paddingTop: 24, maxWidth: 960 }}>
        <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Wordmark />
          <Link href="/login" className="t-secondary">
            Sign in
          </Link>
        </nav>
      </header>

      {/* ---- Hero: the claim, then the machine running ---- */}
      <main className="page-column" style={{ maxWidth: 960, paddingTop: 56, paddingBottom: 80 }}>
        <section>
          <h1 className="t-display" style={{ maxWidth: "18ch" }}>
            A waitlist that grows itself.
          </h1>
          <p className="t-body" style={{ marginTop: 20, color: "var(--color-text-2)", maxWidth: "44ch" }}>
            Every launch needs a page, an email capture, and somewhere to put the signups. The part
            that actually grows the list — position tracking, share links, skip-the-line rewards —
            is the part everyone skips because it&apos;s a real project. Here it works on your first
            signup.
          </p>

          <div style={{ marginTop: 40, marginBottom: 40 }}>
            <QueueJump />
          </div>

          <Link href="/signup" className="btn btn-primary btn-full">
            {CTA}
          </Link>
          <p className="t-secondary" style={{ marginTop: 12, textAlign: "center" }}>
            No card. {PLANS.free.signupsPerList} signups and a hosted page on the free tier.
          </p>
        </section>

        {/* ---- Tension: the arithmetic of a loop ---- */}
        <section className="hairline-t" style={{ marginTop: 80, paddingTop: 40 }}>
          <p className="t-label">The maths you&apos;re leaving on the table</p>
          <h2 className="t-h2" style={{ marginTop: 12, maxWidth: "24ch" }}>
            A list without referrals grows once. A list with them compounds.
          </h2>

          <div style={{ marginTop: 32 }}>
            <ul>
              <MathRow
                left="1,000 people find your page"
                right="1,000"
                note="Whatever your launch tweet, Product Hunt post or ad brought in."
              />
              <MathRow
                left="38% submit an email"
                right="380"
                note="A plausible conversion for a page with one field."
              />
              <MathRow
                left="Without referrals, that's the list"
                right="380"
                note="It stops here. Every new signup costs you another visit."
              />
              <MathRow
                left="At a K-factor of 0.6, each cohort brings the next"
                right="950"
                note="380 + 228 + 137 + 82 + … The loop pays for itself."
                accent
              />
            </ul>
            <p className="t-secondary" style={{ marginTop: 16 }}>
              Illustrative arithmetic, not a promise — your K-factor is measured on your dashboard
              from your own confirmed referrals, and it starts at zero like everyone&apos;s.
            </p>
          </div>
        </section>

        {/* ---- Proof: the product's own artifacts ---- */}
        <section className="hairline-t" style={{ marginTop: 80, paddingTop: 40 }}>
          <p className="t-label">What ships on every list</p>
          <h2 className="t-h2" style={{ marginTop: 12, maxWidth: "24ch" }}>
            The reward ladder is already there.
          </h2>
          <p className="t-body" style={{ marginTop: 16, color: "var(--color-text-2)", maxWidth: "44ch" }}>
            These are the actual gate cards a new list is created with — the same component the
            hosted page renders, with the thresholds you can change on day one.
          </p>
          <div style={{ marginTop: 24 }}>
            <RewardGates referrals={1} tiers={TIERS} />
          </div>
        </section>

        {/* ---- Objection killer: fraud ---- */}
        <section className="hairline-t" style={{ marginTop: 80, paddingTop: 40 }}>
          <p className="t-label" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <IconFlag size={16} />
            The objection
          </p>
          <h2 className="t-h2" style={{ marginTop: 12, maxWidth: "26ch" }}>
            &ldquo;Rewarding referrals just invites fake signups.&rdquo;
          </h2>
          <p className="t-body" style={{ marginTop: 16, color: "var(--color-text-2)", maxWidth: "44ch" }}>
            Correct. So the queue is built to be hard to game, and honest about the cases it
            can&apos;t be certain of.
          </p>
          <ul style={{ marginTop: 24 }}>
            <ProofRow
              title="A position is only held by a confirmed address"
              body="Double opt-in by default. An unconfirmed signup holds no place and earns nobody a boost."
            />
            <ProofRow
              title="One person is one position"
              body="sofia@gmail.com, so.fia@gmail.com and sofia+launch@gmail.com are the same signup. Plus-tags and provider dot rules are collapsed before the row is written."
            />
            <ProofRow
              title="Disposable domains are refused outright"
              body="A mailbox that expires in ten minutes is not a signup, and the person is told why."
            />
            <ProofRow
              title="Circumstantial signals queue for review, they don't reject"
              body="A signup from the referrer's own network, or a burst from one address, is held for you to decide. It keeps its place in line; the referrer isn't paid until you approve. Offices and households share IPs — a false rejection is worse than a queued decision."
            />
            <ProofRow
              title="Approving and rejecting both settle the maths"
              body="Approve and the held boost is paid. Reject and it's taken back, with everyone's position corrected."
            />
          </ul>
        </section>

        {/* ---- Proof: the export and the webhook ---- */}
        <section className="hairline-t" style={{ marginTop: 80, paddingTop: 40 }}>
          <p className="t-label">Your list is yours</p>
          <h2 className="t-h2" style={{ marginTop: 12, maxWidth: "24ch" }}>
            Export on every plan, including free.
          </h2>
          <p className="t-body" style={{ marginTop: 16, color: "var(--color-text-2)", maxWidth: "44ch" }}>
            The real header of the real CSV. Positions, codes, and who referred whom — the referral
            graph, not just a list of emails.
          </p>
          <pre
            className="scroll-x"
            style={{
              marginTop: 20,
              padding: 12,
              background: "var(--color-panel)",
              border: "1px solid var(--color-hairline)",
              borderRadius: "var(--radius-card)",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            <code>{SIGNUP_EXPORT_HEADER.join(",")}</code>
          </pre>
        </section>

        {/* ---- Offer: pricing, anchored ---- */}
        <section className="hairline-t" style={{ marginTop: 80, paddingTop: 40 }}>
          <p className="t-label">Pricing</p>
          <h2 className="t-h2" style={{ marginTop: 12, maxWidth: "26ch" }}>
            Prefinery starts at $49. Carrd plus ConvertKit is $28 and has no referral engine.
          </h2>

          <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 16 }}>
            {Object.values(PLANS).map((p) => (
              <article key={p.id} className="panel" style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
                  <p className="t-title">{p.name}</p>
                  <p className="t-data">{p.priceMonthly === 0 ? "free" : `$${p.priceMonthly}/mo`}</p>
                </div>
                <ul style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                  <Bullet>{limitLabel(p.signupsPerList)} signups per list</Bullet>
                  <Bullet>
                    {limitLabel(p.lists)} list{p.lists === 1 ? "" : "s"}
                  </Bullet>
                  <Bullet>
                    {p.canHideBadge ? "Badge optional, custom domain" : "LaunchList badge on the page"}
                  </Bullet>
                  <Bullet>{p.emailBlasts ? "Email blasts with segments" : "CSV export"}</Bullet>
                  {p.webhooks ? <Bullet>Webhooks, API and Zapier</Bullet> : null}
                </ul>
              </article>
            ))}
          </div>

          <p className="t-secondary" style={{ marginTop: 20 }}>
            The free tier keeps a quiet &ldquo;Powered by LaunchList&rdquo; row on your page. That
            footer is how this gets paid for, which is why the free tier can be genuinely useful
            instead of a five-day trial.
          </p>

          <Link href="/signup" className="btn btn-primary btn-full" style={{ marginTop: 24 }}>
            {CTA}
          </Link>
        </section>

        {/* ---- Final CTA: the claim as an imperative ---- */}
        <section className="hairline-t" style={{ marginTop: 80, paddingTop: 40 }}>
          <h2 className="t-h2" style={{ maxWidth: "22ch" }}>
            Stop collecting emails. Start a queue people want to move up.
          </h2>
          <p className="t-body" style={{ marginTop: 16, color: "var(--color-text-2)", maxWidth: "44ch" }}>
            A page, a confirmed-email queue and working referral mechanics, in about two minutes. If
            you launch and leave, that&apos;s a success — export the list on your way out.
          </p>
          <Link href="/signup" className="btn btn-primary btn-full" style={{ marginTop: 24 }}>
            {CTA}
          </Link>
          <p className="t-secondary" style={{ marginTop: 16 }}>
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        </section>

        <footer className="hairline-t" style={{ marginTop: 80, paddingTop: 24, paddingBottom: 96 }}>
          <Wordmark size={16} />
          <p className="t-secondary" style={{ marginTop: 12 }}>
            Pre-launch. Everything on this page is either the product&apos;s own output or labelled
            as a demo — there are no customer numbers to quote yet, and we&apos;re not going to
            invent any.
          </p>
        </footer>
      </main>

      {/* Sticky thumb-zone CTA on phones, same words. */}
      <div
        className="lg:hidden"
        style={{
          position: "fixed",
          left: "var(--gutter)",
          right: "var(--gutter)",
          bottom: "calc(env(safe-area-inset-bottom) + 16px)",
          zIndex: 30,
        }}
      >
        <Link href="/signup" className="btn btn-primary btn-full">
          {CTA}
        </Link>
      </div>
    </div>
  );
}

function MathRow({
  left,
  right,
  note,
  accent,
}: {
  left: string;
  right: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <li className="row" style={{ alignItems: "flex-start", paddingTop: 12, paddingBottom: 12 }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="t-title" style={{ display: "block" }}>
          {left}
        </span>
        <span className="t-secondary">{note}</span>
      </span>
      <span
        className="t-data"
        style={{ flex: "none", fontSize: 18, color: accent ? "var(--color-flare)" : undefined }}
      >
        {right}
      </span>
    </li>
  );
}

function ProofRow({ title, body }: { title: string; body: string }) {
  return (
    <li className="row" style={{ alignItems: "flex-start", paddingTop: 12, paddingBottom: 12 }}>
      <span style={{ flex: "none", color: "var(--color-text-3)", display: "inline-flex", marginTop: 2 }}>
        <IconLock size={18} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="t-title" style={{ display: "block" }}>
          {title}
        </span>
        <span className="t-secondary">{body}</span>
      </span>
    </li>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="t-secondary" style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <span style={{ color: "var(--color-text-3)", display: "inline-flex", marginTop: 1 }}>
        <IconCheck size={16} />
      </span>
      {children}
    </li>
  );
}
