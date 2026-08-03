import type { Metadata } from "next";
import Link from "next/link";
import { count, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  contributions,
  coverageRequests,
  jurisdictionSources,
  requirementChanges,
  requirementRecords,
} from "@/db/schema";
import { requireCurator } from "@/lib/auth";
import { coverageSummary } from "@/lib/jurisdictions";
import { jobTypeLabel } from "@/lib/taxonomy";
import { shortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Curation" };

/** What needs a human today, and how fresh the corpus is. */
export default async function AdminHome() {
  await requireCurator();
  const db = getDb();

  const [pending] = await db
    .select({ total: count() })
    .from(requirementChanges)
    .where(eq(requirementChanges.reviewState, "pending"));
  const [queuedContributions] = await db
    .select({ total: count() })
    .from(contributions)
    .where(eq(contributions.reviewState, "pending"));
  const [broken] = await db
    .select({ total: count() })
    .from(jurisdictionSources)
    .where(eq(jurisdictionSources.status, "broken"));
  const [stale] = await db
    .select({
      total: sql<number>`count(*) filter (where ${requirementRecords.verifiedAt} < now() - interval '90 days')`,
    })
    .from(requirementRecords)
    .where(isNull(requirementRecords.supersededBy));
  const requests = await db
    .select()
    .from(coverageRequests)
    .orderBy(desc(coverageRequests.createdAt))
    .limit(8);
  const summary = await coverageSummary();

  const tiles = [
    { label: "Diffs to review", value: Number(pending?.total ?? 0), href: "/admin/review" },
    {
      label: "Contributions queued",
      value: Number(queuedContributions?.total ?? 0),
      href: "/admin/contributions",
    },
    { label: "Broken sources", value: Number(broken?.total ?? 0), href: "/admin/sources" },
    { label: "Records past 90 days", value: Number(stale?.total ?? 0), href: "/admin/sources" },
  ];

  return (
    <main className="screen screen-wide pt-6">
      <h1 className="t-h2">Curation console</h1>
      <p className="t-secondary mt-2">
        {summary.records} current records across {summary.jurisdictions} authorities ·{" "}
        {summary.freshRecords} verified inside 90 days (
        {Math.round((summary.freshRecords / Math.max(summary.records, 1)) * 100)}% against the 90%
        bar).
      </p>

      <ul className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {tiles.map((tile) => (
          <li key={tile.label} className="card">
            <Link href={tile.href} style={{ color: "inherit" }}>
              <span className="t-label block">{tile.label}</span>
              <span
                className="t-mono mt-2 block"
                style={{
                  fontSize: 28,
                  color: tile.value > 0 ? "var(--color-brick)" : "var(--color-fg-3)",
                }}
              >
                {tile.value}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-8">
        <h2 className="t-label">Coverage requests from customers</h2>
        {requests.length === 0 ? (
          <p className="t-secondary mt-2">
            None. Requests land here whenever a job is created for a pair we have no record for —
            that is the expansion queue, in demand order.
          </p>
        ) : (
          <ul className="mt-1">
            {requests.map((request) => (
              <li key={request.id} className="row">
                <span className="min-w-0 flex-1">
                  <span className="t-title block">
                    {jobTypeLabel(request.jobType)}
                    {request.jurisdictionName ? ` — ${request.jurisdictionName}` : ""}
                  </span>
                  {request.note && <span className="t-secondary block">{request.note}</span>}
                </span>
                <span className="t-data shrink-0" style={{ color: "var(--color-fg-3)" }}>
                  {shortDate(request.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="t-secondary mt-8">
        Nothing on this console publishes without a reviewer id — the write path requires one, so an
        unattended publish is impossible rather than merely discouraged.
      </p>
    </main>
  );
}
