import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconAlertTriangle, IconArrowLeft, IconExternal } from "@/components/icons";
import { RequirementCard } from "@/components/RequirementCard";
import { WatchButton } from "@/components/WatchButton";
import { requireUser } from "@/lib/auth";
import { shortDate } from "@/lib/format";
import {
  getJurisdictionBySlug,
  isWatched,
  listSources,
} from "@/lib/jurisdictions";
import { listCurrentRecords, recentChanges } from "@/lib/requirements";
import { jobTypeLabel } from "@/lib/taxonomy";
import { expiryRuleLabel } from "@/lib/tracker";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const jurisdiction = await getJurisdictionBySlug(slug);
  return { title: jurisdiction ? jurisdiction.name : "Jurisdiction" };
}

/** One authority: who they are, what they require, and what has changed lately. */
export default async function JurisdictionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { slug } = await params;
  const { type } = await searchParams;
  const { org } = await requireUser();

  const jurisdiction = await getJurisdictionBySlug(slug);
  if (!jurisdiction) notFound();

  const [records, changes, sources, watched] = await Promise.all([
    listCurrentRecords(jurisdiction.id),
    recentChanges(jurisdiction.id),
    listSources(jurisdiction.id),
    isWatched(org.id, jurisdiction.id),
  ]);

  const sorted = [...records].sort((a, b) => jobTypeLabel(a.jobType).localeCompare(jobTypeLabel(b.jobType)));
  const selected = sorted.find((r) => r.jobType === type) ?? sorted[0] ?? null;
  const contact = jurisdiction.contact;

  return (
    <main className="screen pt-6">
      <Link href="/jurisdictions" className="btn-quiet btn-quiet-sm">
        <IconArrowLeft size={18} />
        Jurisdictions
      </Link>

      <header className="mt-4">
        <h1 className="t-h2">{jurisdiction.name}</h1>
        <p className="t-secondary mt-1">
          {jurisdiction.departmentName}
          {contact.phone ? ` · ${contact.phone}` : ""}
          {contact.hours ? ` · ${contact.hours}` : ""}
        </p>
        {contact.address && <p className="t-secondary">{contact.address}</p>}
        <p className="t-data mt-2" style={{ color: "var(--color-fg-3)" }}>
          Permits: {expiryRuleLabel(jurisdiction)}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <WatchButton jurisdictionId={jurisdiction.id} slug={jurisdiction.slug} watched={watched} />
          {jurisdiction.portalUrl && (
            <a
              href={jurisdiction.portalUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="btn-quiet btn-quiet-sm"
            >
              Their portal
              <IconExternal size={14} />
            </a>
          )}
        </div>
      </header>

      {sorted.length === 0 ? (
        <section className="card mt-6">
          <p className="t-label">No records yet</p>
          <p className="t-body mt-2">
            This authority is in the corpus but has no verified requirement records. Call the
            department directly — and if you learn something, suggest an edit once a record exists.
          </p>
        </section>
      ) : (
        <>
          <div className="chiprow mt-6" aria-label="Job types">
            {sorted.map((record) => (
              <Link
                key={record.id}
                href={{ pathname: `/jurisdictions/${slug}`, query: { type: record.jobType } }}
                className="chip"
                data-active={selected?.jobType === record.jobType}
                scroll={false}
              >
                {jobTypeLabel(record.jobType)}
              </Link>
            ))}
          </div>

          {selected && (
            <div className="mt-4">
              <RequirementCard
                record={selected}
                jurisdiction={jurisdiction}
                sourceLabel={sources.find((s) => s.id === selected.sourceId)?.label ?? null}
                sourceUrl={sources.find((s) => s.id === selected.sourceId)?.url ?? null}
                historyHref={`/jurisdictions/${slug}/history/${selected.jobType}`}
                suggestHref={`/jurisdictions/${slug}/suggest/${selected.id}`}
              />
            </div>
          )}
        </>
      )}

      <section className="mt-8">
        <h2 className="t-label">Recent changes</h2>
        {changes.length === 0 ? (
          <p className="t-secondary mt-2">
            No verified changes recorded yet. We crawl this authority&apos;s pages every 72 hours;
            anything that moves lands in a curator&apos;s review queue first.
          </p>
        ) : (
          <ul className="mt-1">
            {changes.map((change) => (
              <li key={change.id} className="row">
                <IconAlertTriangle size={18} style={{ color: "var(--color-ochre)" }} />
                <span className="min-w-0 flex-1">
                  <span className="t-title block">{change.diffSummary}</span>
                  <span className="t-secondary block">
                    {change.jobType ? jobTypeLabel(change.jobType) : "Requirements"} ·{" "}
                    {change.origin === "contribution"
                      ? "from a field contribution"
                      : change.origin === "curator"
                        ? "curator update"
                        : "detected by crawl"}
                  </span>
                  {change.jobType && (
                    <Link
                      href={`/jurisdictions/${slug}/history/${change.jobType}`}
                      className="btn-quiet btn-quiet-sm"
                    >
                      See what changed
                    </Link>
                  )}
                </span>
                <span className="t-data shrink-0" style={{ color: "var(--color-fg-3)" }}>
                  {shortDate(change.reviewedAt ?? change.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="t-label">Monitored sources</h2>
        <ul className="mt-1">
          {sources.map((source) => (
            <li key={source.id} className="row">
              <span className="min-w-0 flex-1">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="t-title block truncate"
                  style={{ color: "var(--color-fg)" }}
                >
                  {source.label}
                </a>
                <span className="t-secondary block truncate">{source.url}</span>
              </span>
              <span
                className="t-data shrink-0"
                style={{
                  color:
                    source.status === "broken" ? "var(--color-signal-red)" : "var(--color-fg-3)",
                }}
              >
                {source.status === "broken"
                  ? "broken"
                  : source.lastCrawledAt
                    ? `crawled ${shortDate(source.lastCrawledAt)}`
                    : "not crawled yet"}
              </span>
            </li>
          ))}
        </ul>
        <p className="t-secondary mt-3">
          A source that stops answering is marked broken and surfaced to a curator. Silence is never
          treated as “nothing changed”.
        </p>
      </section>
    </main>
  );
}
