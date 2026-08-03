import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft } from "@/components/icons";
import { requireUser } from "@/lib/auth";
import { longDate, money, totalCents } from "@/lib/format";
import { getJurisdictionBySlug } from "@/lib/jurisdictions";
import { getVersionHistory } from "@/lib/requirements";
import { jobTypeLabel } from "@/lib/taxonomy";

export const metadata: Metadata = { title: "Change history" };

/**
 * The version chain for one (jurisdiction, job type) pair. Competitors and search
 * results assert; this page timestamps — every version, what changed, who reviewed
 * it, and the raw diff off the source page.
 */
export default async function HistoryPage({
  params,
}: {
  params: Promise<{ slug: string; jobType: string }>;
}) {
  const { slug, jobType } = await params;
  await requireUser();

  const jurisdiction = await getJurisdictionBySlug(slug);
  if (!jurisdiction) notFound();

  const history = await getVersionHistory(jurisdiction.id, jobType);
  if (history.length === 0) notFound();

  return (
    <main className="screen pt-6">
      <Link href={`/jurisdictions/${slug}?type=${jobType}`} className="btn-quiet btn-quiet-sm">
        <IconArrowLeft size={18} />
        {jurisdiction.name}
      </Link>

      <h1 className="t-h2 mt-4">{jobTypeLabel(jobType)} — change history</h1>
      <p className="t-secondary mt-2">
        {history.length} {history.length === 1 ? "version" : "versions"} on record. The newest is
        what a checklist generated today pins to; older versions stay readable because jobs are still
        working from them.
      </p>

      <ol className="mt-6">
        {history.map(({ record, change }, index) => (
          <li key={record.id} className="hairline-t py-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="t-title">
                v{record.version}
                {index === 0 ? " — current" : ""}
              </span>
              <span className="t-data" style={{ color: "var(--color-fg-3)" }}>
                {longDate(record.verifiedAt)}
              </span>
            </div>

            <p className="t-secondary mt-1">
              Verified by {record.verifiedBy}
              {record.sourceKind === "contribution" ? " from a field contribution" : ""}
              {record.sourceKind === "phone_confirmation" ? " by phone" : ""}
            </p>

            <p className="t-body mt-3">
              {record.permitsRequired.length === 0
                ? "No permit required for this scope."
                : record.permitsRequired.join(" + ")}
              {record.fees.length > 0 && (
                <>
                  {" · "}
                  <span className="t-mono">{money(totalCents(record.fees))}</span>
                </>
              )}
              {" · "}
              {record.reviewTimeline}
            </p>

            {change && (
              <>
                <p className="t-label mt-4">What changed</p>
                <p className="t-body mt-1">{change.diffSummary}</p>
                <p className="t-secondary mt-1">
                  {change.origin === "crawl_diff"
                    ? "Detected by crawl, reviewed before publication"
                    : change.origin === "contribution"
                      ? "Submitted by a contractor, verified before publication"
                      : "Curator update"}
                  {change.reviewedAt ? ` · reviewed ${longDate(change.reviewedAt)}` : ""}
                  {change.alertedAt ? " · watching orgs alerted" : ""}
                </p>
                {change.rawDiff && (
                  <div className="scroll-x mt-3">
                    <pre className="diff">
                      {change.rawDiff.split("\n").map((line, lineIndex) => (
                        <span
                          key={lineIndex}
                          className={
                            line.startsWith("+")
                              ? "diff-add"
                              : line.startsWith("-")
                                ? "diff-del"
                                : undefined
                          }
                        >
                          {line}
                          {"\n"}
                        </span>
                      ))}
                    </pre>
                  </div>
                )}
              </>
            )}

            {!change && index === history.length - 1 && (
              <p className="t-secondary mt-3">
                First curated version — established when {jurisdiction.name} was onboarded.
              </p>
            )}
          </li>
        ))}
      </ol>
    </main>
  );
}
