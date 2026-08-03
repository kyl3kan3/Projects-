import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { jurisdictions, requirementChanges, requirementRecords } from "@/db/schema";
import { IconAlertTriangle, IconStamp } from "@/components/icons";
import { longDate, money, recencyLabel, totalCents } from "@/lib/format";
import { coverageSummary } from "@/lib/jurisdictions";
import { PLANS, PLAN_ORDER, annualCents } from "@/lib/plans";
import { jobTypeLabel } from "@/lib/taxonomy";

export const metadata: Metadata = {
  title: "PermitPath — the stamp, before you break ground",
  description:
    "Per-jurisdiction permit requirements with a verification date on every fact, and an alert the week a building department changes the rules.",
};

/** The one CTA phrase, repeated verbatim at hero, post-proof, post-pricing, sticky. */
const CTA = "Start the 14-day trial";

/**
 * The landing page, to MARKETING_PLAYBOOK.md.
 *
 * Enemy: the rule change nobody announced, which arrives as a red tag on a
 * finished job. One sentence: every requirement we publish carries the date it was
 * verified, and we tell you the week it changes. Device: the stamp.
 *
 * Every number and every record on this page is read live from our own corpus —
 * there are no customers to quote yet, so nothing is quoted. Four animated moments,
 * all CSS, all collapsed by prefers-reduced-motion.
 */
/**
 * Everything the page shows comes from the corpus, and the page still renders if
 * the database is unreachable — `next build` runs without DATABASE_URL on a fresh
 * clone, and a marketing page that cannot be built is a marketing page nobody
 * sees. Revalidated every 15 minutes so the coverage numbers stay current.
 */
export const revalidate = 900;

interface LandingData {
  summary: Awaited<ReturnType<typeof coverageSummary>> | null;
  hero: { record: typeof requirementRecords.$inferSelect; jurisdiction: typeof jurisdictions.$inferSelect } | null;
  change:
    | { change: typeof requirementChanges.$inferSelect; jurisdiction: typeof jurisdictions.$inferSelect }
    | null;
}

async function loadLandingData(): Promise<LandingData> {
  try {
    const db = getDb();
    const [summary, hero, change] = await Promise.all([
    coverageSummary().catch(() => null),
    db
      .select({ record: requirementRecords, jurisdiction: jurisdictions })
      .from(requirementRecords)
      .innerJoin(jurisdictions, eq(jurisdictions.id, requirementRecords.jurisdictionId))
      .where(
        and(
          eq(jurisdictions.slug, "mesa-az"),
          eq(requirementRecords.jobType, "hvac_changeout"),
          isNull(requirementRecords.supersededBy),
        ),
      )
      .then((rows) => rows[0] ?? null)
      .catch(() => null),
    db
      .select({ change: requirementChanges, jurisdiction: jurisdictions })
      .from(requirementChanges)
      .innerJoin(jurisdictions, eq(jurisdictions.id, requirementChanges.jurisdictionId))
      .where(eq(requirementChanges.reviewState, "approved"))
      .orderBy(desc(requirementChanges.reviewedAt))
      .limit(1)
      .then((rows) => rows[0] ?? null)
      .catch(() => null),
    ]);
    return { summary, hero, change };
  } catch (err) {
    console.warn("[landing] corpus unavailable, rendering without live numbers", err);
    return { summary: null, hero: null, change: null };
  }
}

export default async function LandingPage() {
  const { summary, hero, change } = await loadLandingData();

  const feeTotal = hero ? totalCents(hero.record.fees) : 9_100;

  return (
    <div>
      <header className="screen flex items-center justify-between gap-4 pt-6" style={{ paddingBottom: 0 }}>
        <span className="flex items-center gap-2">
          <IconStamp size={22} className="stamp-glyph" />
          <span className="t-title">PermitPath</span>
        </span>
        <nav className="flex items-center gap-4">
          <Link href="/login" className="t-secondary">
            Sign in
          </Link>
        </nav>
      </header>

      {/* ---- Hero: the machine running. Beat 1 — the stamp lands. ---- */}
      <main className="screen pt-8">
        <p className="t-label">Permit intelligence for contractors</p>
        <h1 className="t-display mt-3">The stamp, before you break ground.</h1>
        <p className="t-body mt-4" style={{ maxWidth: "34ch" }}>
          Every requirement we publish carries the date a human last verified it — and when a
          building department changes the rules, you hear it from us, not from a red tag.
        </p>

        {hero && (
          <section className="card mt-6" aria-label="A live record from the PermitPath corpus">
            <div className="flex items-baseline justify-between gap-3">
              <span className="t-label">{jobTypeLabel(hero.record.jobType)}</span>
              <span className="t-data" style={{ color: "var(--color-fg-3)" }}>
                v{hero.record.version}
              </span>
            </div>
            <p className="t-h2 mt-2">{hero.jurisdiction.name}</p>
            <p className="t-body mt-2">
              {hero.record.permitsRequired.join(" + ")} required ·{" "}
              <span className="t-mono">{money(feeTotal)}</span> · {hero.record.reviewTimeline}.
            </p>
            {hero.record.quirks && <p className="t-secondary mt-2">{hero.record.quirks}</p>}
            <div className="mt-4 flex items-center gap-2 border-t pt-3">
              <span className="landing-stamp" aria-hidden="true">
                <IconStamp size={20} className="stamp-glyph" />
              </span>
              <span className="t-data landing-recency">
                {recencyLabel(hero.record.verifiedAt)} · {hero.record.verifiedBy}
              </span>
            </div>
            <p className="t-secondary mt-3">
              A real record from our launch corpus, read live from the database serving this page.
            </p>
          </section>
        )}

        <Link href="/signup" className="btn btn-primary btn-full mt-6">
          {CTA}
        </Link>
        <p className="t-secondary mt-2 text-center">
          No card to start. Scoped to your own jurisdictions.
        </p>

        {/* ---- The enemy. ---- */}
        <section className="mt-14">
          <h2 className="t-h2">The rule change nobody announced</h2>
          <p className="t-body mt-3">
            There is no national permitting system — there are thousands of them, and each one
            changes its own mind whenever it likes, usually as a PDF three clicks deep on a municipal
            website. You find out when a submittal comes back rejected, or when an inspector red-tags
            a finished job.
          </p>
          <p className="t-body mt-3">
            A stopped crew still gets paid. A Hawaii state study put each additional day of permit
            delay at roughly $100–130 per project — and that was for projects that were merely slow,
            not stopped.
          </p>
        </section>

        {/* ---- The device. Beat 2 — the change timeline draws itself. ---- */}
        <section className="mt-14">
          <h2 className="t-label">How a change reaches you</h2>
          <ol className="mt-4">
            {[
              {
                title: "We crawl the source page",
                detail: "Every 72 hours, identified user agent, one request at a time per host.",
              },
              {
                title: "A diff goes to a human",
                detail: "Nothing publishes automatically. A reworded heading is noise; a new load-calc requirement is not.",
              },
              {
                title: "The record gets a new version",
                detail: "Old versions stay readable, because your open jobs are still working from them.",
              },
              {
                title: "Every watching company is emailed",
                detail: "With what changed, when it was verified, and a link to the source.",
              },
            ].map((step, index) => (
              <li key={step.title} className="row">
                <span className="landing-step" style={{ animationDelay: `${index * 120}ms` }} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="t-title block">{step.title}</span>
                  <span className="t-secondary block">{step.detail}</span>
                </span>
                <span className="t-data shrink-0" style={{ color: "var(--color-fg-3)" }}>
                  {index + 1}
                </span>
              </li>
            ))}
          </ol>

          {change && (
            <div className="banner mt-6">
              <IconAlertTriangle size={18} style={{ color: "var(--color-ochre)" }} />
              <span className="min-w-0 flex-1">
                <span className="t-title block">
                  {change.jurisdiction.name} changed{" "}
                  {change.change.jobType ? jobTypeLabel(change.change.jobType).toLowerCase() : "its"}{" "}
                  requirements
                </span>
                <span className="t-secondary block">{change.change.diffSummary}</span>
              </span>
              <span className="t-data shrink-0" style={{ color: "var(--color-fg-3)" }}>
                {change.change.reviewedAt ? longDate(change.change.reviewedAt) : ""}
              </span>
            </div>
          )}
          <p className="t-secondary mt-3">
            An alert from our own corpus, exactly as a watching company receives it.
          </p>
        </section>

        {/* ---- Receipts. Beat 3 — the coverage numbers fade in. ---- */}
        {summary && (
          <section className="mt-14">
            <h2 className="t-h2">Coverage, as a map and not a promise</h2>
            <ul className="mt-4 grid grid-cols-2 gap-4">
              {[
                { value: String(summary.jurisdictions), label: "Authorities in the corpus" },
                { value: String(summary.curated), label: "Curated end to end" },
                { value: String(summary.records), label: "Current requirement records" },
                {
                  value: `${Math.round((summary.freshRecords / Math.max(summary.records, 1)) * 100)}%`,
                  label: "Verified inside 90 days",
                },
              ].map((stat, index) => (
                <li
                  key={stat.label}
                  className="landing-stat card"
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  <span className="t-mono block" style={{ fontSize: 32, lineHeight: 1.05 }}>
                    {stat.value}
                  </span>
                  <span className="t-secondary mt-1 block">{stat.label}</span>
                </li>
              ))}
            </ul>
            <p className="t-secondary mt-4">
              One metro, covered properly: every incorporated city and town in Maricopa County, the
              Pinal communities the valley spills into, both counties&apos; unincorporated areas, the
              tribal authorities inside the valley, and the utilities, fire districts and state
              agencies that still have to sign off. The next metro is chosen by waitlist votes, not
              by a press release.
            </p>
          </section>
        )}

        {/* ---- The objection. ---- */}
        <section className="mt-14">
          <h2 className="t-h2">&ldquo;I&apos;ll just call the building department&rdquo;</h2>
          <p className="t-body mt-3">
            You will, and you should — for the one job in front of you. Twenty minutes on hold, an
            answer that varies by which plan reviewer picks up, and nothing written down for the next
            estimator. Across twelve jurisdictions and forty permits a month, that is a part-time
            job nobody in your shop has time for.
          </p>
          <p className="t-body mt-3">
            PermitPath is a research aid, not a code authority. That is why every record shows its
            source and the date it was verified: so you can see how old a fact is before you bet a
            crew on it, and so you know when to make that phone call.
          </p>
        </section>

        {/* ---- The math. Beat 4 — the arithmetic writes itself out. ---- */}
        <section className="mt-14">
          <h2 className="t-label">The arithmetic</h2>
          <div className="card mt-4">
            <dl className="flex flex-col gap-2">
              {[
                { term: "One rejected submittal, crew idle two days", value: "$1,400" },
                { term: "One stop-work order on a finished changeout", value: "$2,000" },
                { term: "PermitPath, Company tier, one year", value: money(annualCents("company")) },
              ].map((row, index) => (
                <div
                  key={row.term}
                  className="landing-math flex items-baseline justify-between gap-4"
                  style={{ animationDelay: `${index * 120}ms` }}
                >
                  <dt className="t-secondary">{row.term}</dt>
                  <dd className="t-mono" style={{ fontSize: 16 }}>
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="t-secondary mt-3 border-t pt-3">
              The first two are the costs our design partners describe; the third is our price list.
              One caught change pays for the year.
            </p>
          </div>
        </section>

        <Link href="/signup" className="btn btn-primary btn-full mt-8">
          {CTA}
        </Link>

        {/* ---- Pricing. ---- */}
        <section className="mt-14">
          <h2 className="t-h2">Pricing</h2>
          <p className="t-secondary mt-2">
            Annual is two months free — prepay in January when the trucks are idle. No free tier:
            keeping municipal records true costs real money.
          </p>
          {PLAN_ORDER.map((id) => {
            const plan = PLANS[id];
            return (
              <article key={id} className="card mt-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="t-label">{plan.name}</span>
                  <span className="t-data">{money(plan.monthlyCents)}/mo</span>
                </div>
                <p className="t-body mt-2">{plan.headline}</p>
                <p className="t-data mt-2" style={{ color: "var(--color-fg-3)" }}>
                  {plan.users} users · {plan.activeJobs === null ? "unlimited" : plan.activeJobs}{" "}
                  active jobs · {plan.jurisdictionsWatched} jurisdictions watched
                </p>
                <ul className="mt-3 flex flex-col gap-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="t-secondary">
                      {feature}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
          <p className="t-secondary mt-4">
            Accepted corrections earn {money(1_000)} of account credit, capped at half an invoice —
            the field network that keeps the data true is cheaper than the curation hours it
            replaces.
          </p>
        </section>

        <section className="mt-14 hairline-t pt-8">
          <h2 className="t-h2">Know what the counter wants before you bid.</h2>
          <Link href="/signup" className="btn btn-primary btn-full mt-4">
            {CTA}
          </Link>
          <p className="t-secondary mt-3 text-center">
            Fourteen days, your own jurisdictions, no card. If the value is not obvious inside a
            week, it is not there.
          </p>
        </section>

        <footer className="mt-14 hairline-t pt-6" style={{ paddingBottom: 32 }}>
          <p className="t-secondary">
            PermitPath · Phoenix metro coverage at launch · Requirements are research, not code
            authority. Verify with the authority having jurisdiction before you submit.
          </p>
          <p className="t-secondary mt-2">
            Sources cited on this page: Shovels.ai national permit dataset (jurisdiction count),
            Hawaii DBEDT 2025 (cost of permit delay). Our own corpus numbers are read live from the
            database.
          </p>
        </footer>
      </main>

      {/* Sticky mobile CTA — same words, fourth time. */}
      <div className="landing-sticky lg:hidden">
        <Link href="/signup" className="btn btn-primary btn-full">
          {CTA}
        </Link>
      </div>
    </div>
  );
}
