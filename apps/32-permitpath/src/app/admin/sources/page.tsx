import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { jurisdictionSources, jurisdictions } from "@/db/schema";
import { requireCurator } from "@/lib/auth";
import { shortDate } from "@/lib/format";
import { CrawlNowForm, StatusForm } from "./SourceForms";

export const metadata: Metadata = { title: "Sources" };

/**
 * Every monitored page, worst first. A broken source is the dangerous state: it
 * looks like "no changes" from the outside, which is exactly the silence this
 * product exists to break.
 */
export default async function SourcesPage() {
  await requireCurator();
  const db = getDb();

  const rows = await db
    .select({ source: jurisdictionSources, jurisdiction: jurisdictions })
    .from(jurisdictionSources)
    .innerJoin(jurisdictions, eq(jurisdictions.id, jurisdictionSources.jurisdictionId))
    .orderBy(desc(jurisdictionSources.failureCount), asc(jurisdictions.name));

  const broken = rows.filter((r) => r.source.status === "broken");

  return (
    <main className="screen screen-wide pt-6">
      <h1 className="t-h2">Monitored sources</h1>
      <p className="t-secondary mt-2">
        {rows.length} pages across the corpus · {broken.length} broken. Three consecutive failures
        marks a source broken and lifts it to the top of this list.
      </p>

      <ul className="mt-6">
        {rows.map(({ source, jurisdiction }) => (
          <li key={source.id} className="row">
            <span className="min-w-0 flex-1">
              <Link
                href={`/jurisdictions/${jurisdiction.slug}`}
                className="t-title block"
                style={{ color: "var(--color-fg)" }}
              >
                {jurisdiction.name} — {source.label}
              </Link>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer noopener"
                className="t-secondary block truncate"
              >
                {source.url}
              </a>
              <span className="t-data mt-1 block" style={{ color: "var(--color-fg-3)" }}>
                every {source.crawlFrequencyHours}h ·{" "}
                {source.lastCrawledAt ? `last ${shortDate(source.lastCrawledAt)}` : "never crawled"}
                {source.lastSnapshotHash ? ` · snapshot ${source.lastSnapshotHash.slice(0, 8)}` : " · no snapshot"}
              </span>
              {source.lastError && (
                <span className="t-secondary block" style={{ color: "var(--color-signal-red)" }}>
                  {source.lastError}
                </span>
              )}
              <span className="mt-2 flex flex-wrap items-center gap-4">
                <CrawlNowForm sourceId={source.id} />
                <StatusForm sourceId={source.id} status={source.status} />
              </span>
            </span>
            <span
              className={`pill shrink-0 ${
                source.status === "broken"
                  ? "pill-expired"
                  : source.status === "paused"
                    ? "pill-neutral"
                    : "pill-issued"
              }`}
            >
              <span className="pill-dot" />
              {source.status}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
