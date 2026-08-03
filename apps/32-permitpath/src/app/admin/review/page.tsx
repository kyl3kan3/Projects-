import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  jurisdictionSources,
  jurisdictions,
  requirementChanges,
  requirementRecords,
} from "@/db/schema";
import { requireCurator } from "@/lib/auth";
import { longDate } from "@/lib/format";
import { jobTypeLabel } from "@/lib/taxonomy";
import { AssignJobTypeForm, RejectDiffForm } from "./ReviewForms";

export const metadata: Metadata = { title: "Review queue" };

/**
 * The human gate. Every crawl diff lands here and nothing leaves it except by a
 * curator's decision: publish a new version, or record it as noise.
 */
export default async function ReviewQueuePage() {
  await requireCurator();
  const db = getDb();

  const rows = await db
    .select({
      change: requirementChanges,
      jurisdiction: jurisdictions,
      source: jurisdictionSources,
    })
    .from(requirementChanges)
    .innerJoin(jurisdictions, eq(jurisdictions.id, requirementChanges.jurisdictionId))
    .leftJoin(jurisdictionSources, eq(jurisdictionSources.id, requirementChanges.sourceId))
    .where(eq(requirementChanges.reviewState, "pending"))
    .orderBy(asc(requirementChanges.createdAt));

  // Resolve the current record for each (jurisdiction, job type) the queue names,
  // so "edit the affected record" goes straight to the row a version comes from.
  const targets = new Map<string, string>();
  for (const row of rows) {
    if (!row.change.jobType) continue;
    const key = `${row.change.jurisdictionId}:${row.change.jobType}`;
    if (targets.has(key)) continue;
    const [record] = await db
      .select({ id: requirementRecords.id })
      .from(requirementRecords)
      .where(
        and(
          eq(requirementRecords.jurisdictionId, row.change.jurisdictionId),
          eq(requirementRecords.jobType, row.change.jobType),
          isNull(requirementRecords.supersededBy),
        ),
      );
    if (record) targets.set(key, record.id);
  }

  return (
    <main className="screen screen-wide pt-6">
      <h1 className="t-h2">Review queue</h1>
      <p className="t-secondary mt-2">
        {rows.length === 0
          ? "Empty. Crawls run every 72 hours per source; anything that moves in a monitored content region arrives here."
          : `${rows.length} ${rows.length === 1 ? "diff" : "diffs"} waiting. Nothing here has been published or alerted.`}
      </p>

      {rows.map(({ change, jurisdiction, source }) => {
        const recordId = change.jobType
          ? targets.get(`${change.jurisdictionId}:${change.jobType}`)
          : undefined;
        return (
          <article key={change.id} className="card mt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <span className="t-label">{jurisdiction.name}</span>
              <span className="t-data" style={{ color: "var(--color-fg-3)" }}>
                detected {longDate(change.createdAt)}
              </span>
            </div>

            <p className="t-title mt-2">{change.diffSummary}</p>
            <p className="t-secondary mt-1">
              {source ? (
                <a href={source.url} target="_blank" rel="noreferrer noopener">
                  {source.label}
                </a>
              ) : (
                "Source no longer on file"
              )}
              {change.jobType ? ` · ${jobTypeLabel(change.jobType)}` : " · job type not attached yet"}
            </p>

            {change.rawDiff && (
              <div className="scroll-x mt-3">
                <pre className="diff">
                  {change.rawDiff.split("\n").map((line, index) => (
                    <span
                      key={index}
                      className={
                        line.startsWith("+") ? "diff-add" : line.startsWith("-") ? "diff-del" : undefined
                      }
                    >
                      {line}
                      {"\n"}
                    </span>
                  ))}
                </pre>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-4">
              {recordId ? (
                <Link
                  href={`/admin/records/${recordId}?changeId=${change.id}`}
                  className="btn btn-primary"
                >
                  Edit the affected record
                </Link>
              ) : null}
              <RejectDiffForm changeId={change.id} />
            </div>

            {!change.jobType && <AssignJobTypeForm changeId={change.id} />}
            {change.jobType && !recordId && (
              <p className="t-secondary mt-3">
                No current record exists for {jobTypeLabel(change.jobType)} in {jurisdiction.name} yet
                — curate one before this diff can produce a version.
              </p>
            )}
          </article>
        );
      })}
    </main>
  );
}
