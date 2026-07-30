import type { Metadata } from "next";
import Link from "next/link";
import { HeroTrace } from "@/components/marketing/HeroTrace";
import { PLANS } from "@/lib/plans";

/**
 * Marketing landing page, built to MARKETING_PLAYBOOK.md.
 *
 * - Enemy: monitoring you cannot trust — a degraded free tier plastered with
 *   ads, and a cron that died three weeks ago without telling anyone.
 * - One sentence: "Know before your users do."
 * - The device: the live trace that flatlines and rejoins.
 * - Receipts (Law 5): no customer logos, no invented usage numbers. The hero is
 *   labelled a demo, and the only figures quoted are ones the product's own
 *   configuration determines.
 * - One CTA phrase, verbatim in four places: "Start watching — free".
 */

export const metadata: Metadata = {
  title: "PulseWatch — know before your users do",
  description:
    "Uptime, cron-heartbeat, and SSL/domain-expiry monitoring with public status pages. Three monitors free, no ads, cron watching included.",
};

const CTA = "Start watching — free";

export default function LandingPage() {
  const free = PLANS.free;
  const solo = PLANS.solo;
  const team = PLANS.team;

  return (
    <main>
      {/* 1 — Hero: the claim, the machine running, the CTA, the de-risk line. */}
      <section className="screen pt-12" style={{ paddingBottom: 64 }}>
        <p className="t-label">PulseWatch</p>
        <h1 className="t-display mt-4">Know before your users do.</h1>
        <p className="t-body mt-4" style={{ color: "var(--color-text-2)", maxWidth: "34ch" }}>
          Uptime, cron heartbeats, and certificate expiry in one place. Built for someone running
          twelve side projects, not a NOC.
        </p>

        <div className="mt-8">
          <HeroTrace />
        </div>

        <div className="mt-8">
          <Link href="/signup" className="btn btn-primary btn-full no-underline">
            {CTA}
          </Link>
          <p className="t-secondary mt-3 text-center">
            No card. {free.monitors} monitors, {free.minIntervalSeconds / 60}-minute checks, and a
            real status page — permanently.
          </p>
        </div>
      </section>

      {/* 2 — The device: what the trace means. */}
      <section className="screen hairline-t py-14">
        <p className="t-label">The trace, and the flatline</p>
        <h2 className="t-h2 mt-3">Two shapes. That is the whole interface.</h2>
        <div className="mt-6 flex flex-col gap-5">
          <Explain
            title="It runs"
            body="Every check draws one more point. A row you can read in half a second, from across the room, at 2am."
          />
          <Explain
            title="It flatlines"
            body="A failure drops the trace to the baseline and turns it red. No siren, no badge, no emoji — the shape is the alarm."
          />
          <Explain
            title="It rejoins"
            body="Recovery overshoots once, then normalises. You can see how long you were out without reading a number."
          />
        </div>
      </section>

      {/* 3 — The math, calculated in front of them. */}
      <section className="screen hairline-t py-14">
        <p className="t-label">The math</p>
        <h2 className="t-h2 mt-3">A dead cron is worse than a dead site.</h2>
        <p className="t-body mt-4" style={{ color: "var(--color-text-2)" }}>
          When a site goes down, someone tells you. When the nightly backup stops running, nothing
          looks broken — until the day you need the backup.
        </p>
        <div className="panel mt-6 p-5">
          <Row label="An uptime tool" value="$8–29/mo" />
          <Row label="Cron monitoring, separately" value="+$20/mo" />
          <Row label="Two dashboards, two bills" value="$28–49/mo" />
          <Row label={`PulseWatch ${solo.name} — both`} value={`$${solo.priceMonthly}/mo`} accent />
        </div>
        <p className="t-secondary mt-3">
          Comparison prices are from competitors&apos; public pricing pages at the time of writing.
          Heartbeats live in the same list, the same incidents, and the same status page as HTTP
          checks.
        </p>
      </section>

      {/* 4 — Receipts: what the product does, with no invented numbers. */}
      <section className="screen hairline-t py-14">
        <p className="t-label">What you actually get</p>
        <h2 className="t-h2 mt-3">No asterisks.</h2>
        <ul className="mt-6 flex flex-col">
          <Receipt
            title="Confirmed before it pages you"
            body={`A monitor goes down once ${solo.regionsPerCheck} regions agree, or after two consecutive failures on a single region. One blip never wakes you.`}
          />
          <Receipt
            title="Each expiry threshold alerts once"
            body="Certificates and domains warn at 30, 14, 7 and 1 days — exactly once per threshold, enforced by a unique index rather than by hope."
          />
          <Receipt
            title="A status page that admits gaps"
            body="Days we did not measure render as empty cells, not green ones. A status page that overstates uptime is worse than no status page."
          />
          <Receipt
            title="Downgrades never delete"
            body="Drop a plan and we pause your newest monitors. The configuration stays exactly where you left it."
          />
        </ul>
        <p className="t-secondary mt-6">
          We are pre-launch, so there are no customer logos here and no usage numbers. When there are
          real ones they will be named with permission and dated.
        </p>
      </section>

      {/* 5 — Objection killer: the named doubt. */}
      <section className="screen hairline-t py-14">
        <p className="t-label">The obvious question</p>
        <h2 className="t-h2 mt-3">Why not self-host Uptime Kuma?</h2>
        <p className="t-body mt-4" style={{ color: "var(--color-text-2)" }}>
          You should, if you enjoy it — it is genuinely good software. But then something has to watch
          the watcher, and that something is you. When your VPS dies at 3am, so does the thing that
          was supposed to tell you your VPS died.
        </p>
        <p className="t-body mt-4" style={{ color: "var(--color-text-2)" }}>
          We run probes in separate regions from the dashboard, and we monitor PulseWatch from an
          independent external service — because the same argument applies to us.
        </p>
      </section>

      {/* 6 — Pricing, anchored, with the per-unit math spelled out. */}
      <section className="screen hairline-t py-14">
        <p className="t-label">Pricing</p>
        <h2 className="t-h2 mt-3">Nothing behind &ldquo;contact sales&rdquo;.</h2>

        <div className="mt-6 flex flex-col gap-4">
          {[free, solo, team].map((p) => (
            <article key={p.id} className="panel p-5">
              <div className="flex items-baseline justify-between gap-4">
                <p className="t-title">{p.name}</p>
                <p className="t-data" style={{ fontSize: 28 }}>
                  {p.priceMonthly === 0 ? "$0" : `$${p.priceMonthly}`}
                </p>
              </div>
              <p className="t-secondary mt-2">
                {p.monitors} monitors · {p.minIntervalSeconds / 60}-min checks · {p.regionsPerCheck}{" "}
                region{p.regionsPerCheck === 1 ? "" : "s"} · {p.statusPages} status page
                {p.statusPages === 1 ? "" : "s"} · {p.retentionDays}d history
              </p>
              {p.priceMonthly > 0 ? (
                <p className="t-data mt-3" style={{ color: "var(--color-text-3)" }}>
                  ${(p.priceMonthly / p.monitors).toFixed(2)} per monitor per month
                </p>
              ) : null}
            </article>
          ))}
        </div>

        <p className="t-secondary mt-4">
          Annual billing is two months free. No per-seat pricing anywhere. The plan tops out at $
          {team.priceMonthly} on purpose — if you need SSO and on-call rotations you want a different
          product, and we will tell you so.
        </p>

        <div className="mt-8">
          <Link href="/signup" className="btn btn-primary btn-full no-underline">
            {CTA}
          </Link>
        </div>
      </section>

      {/* 7 — Final CTA: the claim restated as an imperative. */}
      <section className="screen hairline-t py-14" style={{ paddingBottom: 112 }}>
        <h2 className="t-h2">Add the one thing you would hate to find broken.</h2>
        <p className="t-body mt-3" style={{ color: "var(--color-text-2)" }}>
          It takes about twenty seconds. Then you can close this tab and forget we exist, which is
          the entire point.
        </p>
        <div className="mt-8">
          <Link href="/signup" className="btn btn-primary btn-full no-underline">
            {CTA}
          </Link>
        </div>
        <p className="t-secondary mt-6">
          Already watching?{" "}
          <Link href="/login" style={{ color: "var(--color-phosphor)" }}>
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}

function Explain({ title, body }: { title: string; body: string }) {
  return (
    <div className="hairline-t pt-4">
      <p className="t-title">{title}</p>
      <p className="t-secondary mt-1.5">{body}</p>
    </div>
  );
}

function Receipt({ title, body }: { title: string; body: string }) {
  return (
    <li className="hairline-b py-4">
      <p className="t-title">{title}</p>
      <p className="t-secondary mt-1.5">{body}</p>
    </li>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="hairline-b flex items-baseline justify-between gap-4 py-2.5 last:border-0">
      <span className="t-secondary">{label}</span>
      <span className="t-data" style={{ color: accent ? "var(--color-phosphor)" : undefined }}>
        {value}
      </span>
    </div>
  );
}
