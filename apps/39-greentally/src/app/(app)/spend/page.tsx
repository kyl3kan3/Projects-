import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documents } from "@/db/schema";
import { requireOnboarded } from "@/lib/auth";
import { EEIO_BY_SLUG, EEIO_CATEGORIES } from "@/db/factors";
import { listSpendLines } from "@/lib/spend-import";
import { summarise } from "@/lib/spend";
import { formatCents } from "@/lib/units";
import { pendingJobCount } from "@/lib/jobs";
import { JobRunner } from "@/components/JobRunner";
import { SpendTable, type SpendRowView } from "./SpendTable";

export const metadata: Metadata = { title: "Spend" };
export const dynamic = "force-dynamic";

export default async function SpendPage() {
  const { org, period } = await requireOnboarded();
  const db = getDb();

  const imports = await db
    .select()
    .from(documents)
    .where(and(eq(documents.periodId, period.id), eq(documents.kind, "spend_csv")));

  const lines = await listSpendLines(period.id);
  const summary = summarise(lines);
  const pending = await pendingJobCount(org.id);

  const rows: SpendRowView[] = lines.map((l) => ({
    id: l.id,
    rowNumber: l.rowNumber,
    description: l.description,
    amountCents: l.amountCents,
    glAccount: l.glAccount,
    eeioCategory: l.eeioCategory,
    categoryLabel: l.eeioCategory ? (EEIO_BY_SLUG.get(l.eeioCategory)?.label ?? l.eeioCategory) : null,
    confidenceBp: l.classificationConfidenceBp,
    source: l.classificationSource,
    reason: l.classificationReason,
    excluded: l.excluded,
    exclusionReason: l.exclusionReason,
  }));

  const unmapped = imports.filter((d) => d.status !== "accepted");
  const selectable = EEIO_CATEGORIES.filter((c) => !c.alreadyCounted).map((c) => ({
    slug: c.slug,
    label: c.label,
  }));

  return (
    <main className="screen pt-5">
      <h1 className="t-h2">Spend</h1>
      <p className="t-secondary mt-1" style={{ maxWidth: "50ch" }}>
        A screening estimate for Scope 3, from your general ledger. Accurate to an order of
        magnitude — the report says so in those words.
      </p>

      <JobRunner pending={pending} label="CLASSIFYING" />

      {unmapped.length > 0 && (
        <section className="mt-6">
          <h2 className="t-label">Waiting for a column mapping</h2>
          {unmapped.map((d) => (
            <Link key={d.id} href={`/spend/${d.id}/map`} className="row-plain flex items-center justify-between gap-3">
              <span className="t-title truncate">{d.filename}</span>
              <span className="t-data" style={{ color: "var(--color-amber-text)" }}>
                MAP COLUMNS
              </span>
            </Link>
          ))}
        </section>
      )}

      {lines.length === 0 ? (
        <section className="mt-8">
          <div className="panel p-4">
            <p className="t-label">No spend imported</p>
            <p className="t-body mt-2" style={{ maxWidth: "46ch" }}>
              Export a general-ledger transaction list for {period.year} as CSV — description,
              amount, account, date. Any column order; you map them on the next screen.
            </p>
            <Link href="/documents" className="btn btn-secondary btn-full mt-4">
              Upload a spend CSV
            </Link>
          </div>
          <p className="t-secondary mt-4" style={{ maxWidth: "52ch" }}>
            Until then Scope 3 reads <span className="t-mono">NOT MEASURED</span> rather than
            zero, in the app and in the report. An unmeasured scope reported as zero is the
            fastest way to lose an analyst&apos;s trust.
          </p>
        </section>
      ) : (
        <>
          <section className="mt-6">
            <div className="row-plain flex items-baseline justify-between gap-3">
              <span className="t-body">Counted in the Scope 3 screen</span>
              <span className="t-mono">
                {formatCents(summary.includedCents)} · {summary.includedRows} rows
              </span>
            </div>
            <div className="row-plain flex items-baseline justify-between gap-3">
              <span className="t-body">Excluded, with reasons</span>
              <span className="t-mono">
                {formatCents(summary.excludedCents)} · {summary.excludedRows} rows
              </span>
            </div>
            <div className="row-plain flex items-baseline justify-between gap-3">
              <span className="t-body">Still unclassified</span>
              <span className="t-mono" style={{ color: summary.unclassifiedRows > 0 ? "var(--color-amber-text)" : undefined }}>
                {summary.unclassifiedRows} rows
              </span>
            </div>
          </section>

          {summary.byReason.length > 0 && (
            <section className="mt-8">
              <h2 className="t-label">Why lines were excluded</h2>
              {summary.byReason.map((r) => (
                <div key={r.reason} className="row-plain">
                  <p className="t-body" style={{ maxWidth: "46ch" }}>
                    {r.reason}
                  </p>
                  <p className="t-data mt-1" style={{ color: "var(--color-fg-2)" }}>
                    {r.rows} {r.rows === 1 ? "ROW" : "ROWS"} · {formatCents(r.cents)}
                  </p>
                </div>
              ))}
            </section>
          )}

          <SpendTable rows={rows} categories={selectable} />
        </>
      )}
    </main>
  );
}
