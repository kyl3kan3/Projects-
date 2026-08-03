import type { Metadata } from "next";
import Link from "next/link";
import { requireCurator } from "@/lib/auth";
import { IMPACT_LABEL, listModerationQueue } from "@/lib/contributions";
import { longDate, money } from "@/lib/format";
import { jobTypeLabel } from "@/lib/taxonomy";
import { AcceptForm, RejectForm } from "./ModerationForms";

export const metadata: Metadata = { title: "Contributions" };

/**
 * The moderation queue, ordered by what a wrong answer costs: fees and permits
 * first, process second, wording last.
 */
export default async function ContributionsPage() {
  await requireCurator();
  const queue = await listModerationQueue();

  return (
    <main className="screen screen-wide pt-6">
      <h1 className="t-h2">Contribution queue</h1>
      <p className="t-secondary mt-2">
        {queue.length === 0
          ? "Empty. Suggestions arrive from the record pages in the app; accepted ones publish a new version and credit the contributor."
          : `${queue.length} waiting, highest-impact first. Nothing publishes until you accept it.`}
      </p>

      {queue.map((entry) => {
        const changes = entry.contribution.proposedChanges;
        return (
          <article key={entry.contribution.id} className="card mt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <span className="t-label">
                {entry.jurisdictionName} — {jobTypeLabel(entry.record.jobType)}
              </span>
              <span className="t-data" style={{ color: "var(--color-fg-3)" }}>
                {IMPACT_LABEL[entry.impact]} · {longDate(entry.contribution.createdAt)}
              </span>
            </div>

            <p className="t-secondary mt-2">
              {entry.contributorName ?? entry.contributorEmail} at {entry.organizationName} ·
              reputation {entry.contribution.reputationAtSubmit}
            </p>

            <dl className="mt-3 flex flex-col gap-2">
              {changes.fees && (
                <div>
                  <dt className="t-label">Fees</dt>
                  <dd className="t-body">
                    {changes.fees.map((fee) => (
                      <span key={fee.label} className="block">
                        {fee.label} <span className="t-mono">{money(fee.amountCents)}</span>{" "}
                        <span className="t-secondary">
                          (on record:{" "}
                          <span className="t-mono">
                            {money(
                              entry.record.fees.find((f) => f.label === fee.label)?.amountCents ?? 0,
                            )}
                          </span>
                          )
                        </span>
                      </span>
                    ))}
                  </dd>
                </div>
              )}
              {changes.permitsRequired && (
                <div>
                  <dt className="t-label">Permits</dt>
                  <dd className="t-body">{changes.permitsRequired.join(" + ")}</dd>
                </div>
              )}
              {changes.reviewTimeline && (
                <div>
                  <dt className="t-label">Timeline</dt>
                  <dd className="t-body">
                    {changes.reviewTimeline}{" "}
                    <span className="t-secondary">(on record: {entry.record.reviewTimeline})</span>
                  </dd>
                </div>
              )}
              {changes.quirks && (
                <div>
                  <dt className="t-label">Quirk</dt>
                  <dd className="t-body">{changes.quirks}</dd>
                </div>
              )}
              {changes.inspectionContact && (
                <div>
                  <dt className="t-label">Inspection desk</dt>
                  <dd className="t-body">{changes.inspectionContact}</dd>
                </div>
              )}
              {changes.inspectionLeadTimeDays !== undefined && (
                <div>
                  <dt className="t-label">Lead time</dt>
                  <dd className="t-body">{changes.inspectionLeadTimeDays} days</dd>
                </div>
              )}
            </dl>

            <div className="mt-3 hairline-t pt-3">
              <p className="t-label">Evidence</p>
              <p className="t-body mt-1">{entry.contribution.evidence}</p>
            </div>

            <div className="mt-4 flex flex-wrap items-start gap-4">
              <AcceptForm contributionId={entry.contribution.id} />
              <RejectForm contributionId={entry.contribution.id} />
              <Link
                href={`/jurisdictions/${entry.jurisdictionSlug}?type=${entry.record.jobType}`}
                className="btn-quiet btn-quiet-sm"
              >
                Open the record
              </Link>
            </div>
          </article>
        );
      })}
    </main>
  );
}
