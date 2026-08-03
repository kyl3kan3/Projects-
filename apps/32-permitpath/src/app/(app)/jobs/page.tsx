import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { jurisdictions, requirementRecords } from "@/db/schema";
import {
  IconAlertTriangle,
  IconBell,
  IconChevronRight,
  IconPlus,
  IconSearch,
  IconStamp,
} from "@/components/icons";
import { RequirementCard } from "@/components/RequirementCard";
import { RuleChangeBanner } from "@/components/RuleChangeBanner";
import { StatusPill } from "@/components/StatusPill";
import { requireUser } from "@/lib/auth";
import { alertFeed } from "@/lib/alerts";
import { listJobs } from "@/lib/jobs";
import { countWatches } from "@/lib/jurisdictions";
import { checkActiveJobs } from "@/lib/plans";
import { shortDate } from "@/lib/format";
import { jobTypeLabel } from "@/lib/taxonomy";

export const metadata: Metadata = { title: "Jobs" };

/** The app's home tab: what is open, where, and what the counter says about it. */
export default async function JobsPage() {
  const { org } = await requireUser();
  const jobs = await listJobs({ organizationId: org.id, status: "active" });
  const feed = await alertFeed(org.id, 5);
  const banner = feed.find((entry) => entry.kind === "rule_change") ?? null;
  const gate = checkActiveJobs(org.plan, jobs.length);
  const watching = await countWatches(org.id);

  return (
    <main className="screen pt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8">
      <div className="min-w-0">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <IconStamp size={22} className="stamp-glyph" />
            <span className="t-title">PermitPath</span>
          </div>
          <Link
            href="/jurisdictions"
            className="btn-quiet btn-quiet-sm"
            aria-label="Search jurisdictions"
          >
            <IconSearch size={18} />
            Look up requirements
          </Link>
        </header>

        {banner && (
          <RuleChangeBanner
            id={banner.id}
            title={banner.title}
            detail={banner.detail}
            meta={shortDate(banner.at)}
            href={banner.href}
          />
        )}

        {jobs.length === 0 ? (
          <FirstRun />
        ) : (
          <>
            <div className="mt-6 flex items-baseline justify-between gap-3">
              <h1 className="t-label">Active jobs</h1>
              <span className="t-data" style={{ color: "var(--color-fg-3)" }}>
                {gate.limit === null ? `${jobs.length} open` : `${jobs.length} of ${gate.limit}`}
              </span>
            </div>

            <ul className="mt-1">
              {jobs.map((row, index) => (
                <li key={row.job.id}>
                  <Link
                    href={`/jobs/${row.job.id}`}
                    className="row row-tap row-in"
                    style={{ animationDelay: `${Math.min(index, 8) * 24}ms` }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="t-title block truncate">
                        {row.job.siteAddress} — {jobTypeLabel(row.job.jobType)}
                      </span>
                      <span className="t-secondary block truncate">
                        {row.jurisdiction.name}
                        {row.refNumber ? (
                          <>
                            {" · "}
                            <span className="t-mono">{row.refNumber}</span>
                          </>
                        ) : null}
                      </span>
                      <span className="t-data mt-1 block" style={{ color: "var(--color-fg-3)" }}>
                        {row.totalItems > 0 ? `${row.verified} of ${row.totalItems} verified` : "no checklist yet"}
                        {row.stale ? " · requirements changed" : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <StatusPill status={row.status} />
                      <IconChevronRight size={18} style={{ color: "var(--color-fg-3)" }} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            {!gate.allowed && (
              <div className="card mt-6">
                <p className="t-label">Plan limit</p>
                <p className="t-body mt-2">{gate.message}</p>
                <Link href="/settings/billing" className="btn-quiet mt-2">
                  Compare plans
                </Link>
              </div>
            )}
          </>
        )}

        <div className="thumb-cta">
          {watching === 0 ? (
            // First run: watching a jurisdiction is the step that makes every other
            // screen mean something, so it owns the thumb zone until it is done.
            <Link href="/jurisdictions" className="btn btn-primary btn-full">
              Watch your first jurisdiction
            </Link>
          ) : gate.allowed ? (
            <Link href="/jobs/new" className="btn btn-primary btn-full">
              <IconPlus size={18} />
              New job checklist
            </Link>
          ) : (
            <Link href="/settings/billing" className="btn btn-primary btn-full">
              Raise the active-job limit
            </Link>
          )}
      </div>
      </div>

      {/* The alert feed becomes a right rail from 1024px, per DESIGN.md's
          responsive rules. On a phone it lives on its own tab instead. */}
      <aside className="hidden lg:block lg:pt-6" aria-label="Recent alerts">
        <h2 className="t-label">Recent alerts</h2>
        {feed.length === 0 ? (
          <p className="t-secondary mt-2">
            Nothing yet. Watch a jurisdiction and this rail fills the week its rules move.
          </p>
        ) : (
          <ul className="mt-1">
            {feed.map((entry) => (
              <li key={entry.id} className="row">
                {entry.kind === "rule_change" ? (
                  <IconAlertTriangle size={18} style={{ color: "var(--color-ochre)" }} />
                ) : (
                  <IconBell
                    size={18}
                    style={{
                      color:
                        entry.severity === "urgent"
                          ? "var(--color-signal-red)"
                          : "var(--color-ochre)",
                    }}
                  />
                )}
                <span className="min-w-0 flex-1">
                  <Link href={entry.href} className="t-title block" style={{ color: "var(--color-fg)" }}>
                    {entry.title}
                  </Link>
                  <span className="t-secondary block">{entry.detail}</span>
                  <span className="t-data mt-1 block" style={{ color: "var(--color-fg-3)" }}>
                    {shortDate(entry.at)} · {entry.meta}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/alerts" className="btn-quiet btn-quiet-sm mt-2">
          All alerts
        </Link>
      </aside>
    </main>
  );
}

/**
 * First run. Not a tour: a real record out of the corpus, for the metro this
 * launch covers, with the fee and the recency stamp visible before the contractor
 * has typed anything.
 */
async function FirstRun() {
  const db = getDb();
  const [example] = await db
    .select({ record: requirementRecords, jurisdiction: jurisdictions })
    .from(requirementRecords)
    .innerJoin(jurisdictions, eq(jurisdictions.id, requirementRecords.jurisdictionId))
    .where(
      and(
        eq(jurisdictions.slug, "mesa-az"),
        eq(requirementRecords.jobType, "hvac_changeout"),
        isNull(requirementRecords.supersededBy),
      ),
    );

  return (
    <section className="mt-6">
      <h1 className="t-h2">No open jobs yet</h1>
      <p className="t-secondary mt-2">
        Here is what a checklist is generated from — a real record from the launch metro, with its
        source and the date a curator last confirmed it.
      </p>

      {example && (
        <div className="mt-4">
          <RequirementCard
            record={example.record}
            jurisdiction={example.jurisdiction}
            historyHref={`/jurisdictions/${example.jurisdiction.slug}/history/${example.record.jobType}`}
          />
        </div>
      )}

      <p className="t-secondary mt-4">
        Add a job and PermitPath pins its checklist to the record version you started from, so a
        rule change three weeks in raises a banner instead of quietly rewriting the job.
      </p>
    </section>
  );
}
