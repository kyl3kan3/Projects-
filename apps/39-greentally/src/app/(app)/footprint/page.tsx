import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, emissionResults, reportingPeriods, sites } from "@/db/schema";
import { requireOnboarded } from "@/lib/auth";
import { computeCoverage } from "@/lib/coverage";
import { totalsOf } from "@/lib/footprint";
import { CoverageMeter } from "@/components/CoverageMeter";
import { JobRunner } from "@/components/JobRunner";
import { ScopeRows } from "./ScopeRows";
import { scopeProvenance, totalProvenance } from "@/lib/provenance";
import { formatTonnes } from "@/lib/units";
import { canSeeFullTotal, PLANS } from "@/lib/plans";
import { intensityPerFte, intensityPerRevenue } from "@/lib/footprint";
import { pendingJobCount } from "@/lib/jobs";
import { ProvenanceFigure } from "@/components/ProvenanceFigure";
import { listDocuments } from "@/lib/documents";
import { CATEGORY_LABEL } from "@/lib/units";
import { IconUpload } from "@/components/icons";

export const metadata: Metadata = { title: "Footprint" };
export const dynamic = "force-dynamic";

/**
 * The money screen.
 *
 * Everything on it is derived from `emission_results` at read time — nothing renders a
 * stored status or a cached total that a background job is supposed to have refreshed.
 * A figure that is stale is a figure an analyst catches.
 */
export default async function FootprintPage() {
  const { org, period } = await requireOnboarded();
  const db = getDb();

  const results = await db
    .select({
      scope: emissionResults.scope,
      gco2e: emissionResults.gco2e,
      siteId: emissionResults.siteId,
      month: emissionResults.month,
    })
    .from(emissionResults)
    .where(eq(emissionResults.periodId, period.id));

  const totals = totalsOf(results);
  const siteRows = await db.select().from(sites).where(eq(sites.organizationId, org.id));
  const docRows = await listDocuments(period.id);
  const acceptedLines = docRows
    .filter((r) => r.doc.status === "accepted")
    .flatMap((r) =>
      r.lines.map((l) => ({
        siteId: r.doc.siteId ?? "",
        category: l.category,
        serviceStart: l.serviceStart,
        serviceEnd: l.serviceEnd,
      })),
    );

  const coverage = computeCoverage(
    acceptedLines,
    period.year,
    new Map(siteRows.map((s) => [s.id, s.name])),
    new Map(Object.entries(CATEGORY_LABEL)),
  );

  const [threadTotal, thread1, thread2Loc, thread2Mkt, thread3] = await Promise.all([
    totalProvenance(period.id),
    scopeProvenance(period.id, "1"),
    scopeProvenance(period.id, "2_location"),
    scopeProvenance(period.id, "2_market"),
    scopeProvenance(period.id, "3_spend"),
  ]);

  const pending = await pendingJobCount(org.id);
  const fullTotal = canSeeFullTotal(org.plan);
  const anyData = results.length > 0;
  const needsReview = docRows.filter((r) => r.doc.status === "needs_review").length;
  const hasSpend = totals.scope3Spend > 0;

  const perRevenue = intensityPerRevenue(totals.totalMarket, org.annualRevenueCents);
  const perFte = intensityPerFte(totals.totalMarket, org.fteCount);

  const bySite = new Map<string, number>();
  for (const r of results) {
    if (r.scope === "2_location" || !r.siteId) continue;
    bySite.set(r.siteId, (bySite.get(r.siteId) ?? 0) + r.gco2e);
  }

  const byMonth = new Map<string, number>();
  for (const r of results) {
    if (r.scope === "2_location" || !r.month) continue;
    byMonth.set(r.month, (byMonth.get(r.month) ?? 0) + r.gco2e);
  }
  const monthMax = Math.max(1, ...byMonth.values());

  const otherPeriods = await db
    .select()
    .from(reportingPeriods)
    .where(eq(reportingPeriods.organizationId, org.id));

  const uploadCount = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.organizationId, org.id), eq(documents.periodId, period.id)));

  return (
    <main className="screen pt-5">
      {/* Year + site filter chips */}
      <div className="chip-row">
        {otherPeriods
          .sort((a, b) => b.year - a.year)
          .map((p) => (
            <span key={p.id} className="chip" data-active={p.id === period.id}>
              <span className="t-mono">{p.year}</span>
            </span>
          ))}
        {siteRows.map((s) => (
          <span key={s.id} className="chip" title={`${s.name} — grid region ${s.country === "GB" ? "GB" : s.gridRegion}`}>
            {s.name}
          </span>
        ))}
      </div>

      {/* Headline block — not a card; the top of the screen itself */}
      <section className="mt-6">
        <p className="t-label">Reporting year {period.year}</p>

        {anyData ? (
          <>
            <div className="mt-2">
              {fullTotal ? (
                <ProvenanceFigure thread={threadTotal} label="the reported total" grounded={false}>
                  <span className="t-display">
                    {formatTonnes(totals.totalMarket)}{" "}
                    <span className="unit">tCO2e</span>
                  </span>
                </ProvenanceFigure>
              ) : (
                <ProvenanceFigure thread={thread2Mkt} label="the partial Scope 2 estimate" grounded={false}>
                  <span className="t-display">
                    {formatTonnes(totals.scope2Market)} <span className="unit">tCO2e</span>
                  </span>
                </ProvenanceFigure>
              )}
            </div>

            {fullTotal ? (
              <p className="t-data mt-3" style={{ color: "var(--color-fg-2)" }}>
                S1 {formatTonnes(totals.scope1)} · S2 {formatTonnes(totals.scope2Market)} · S3{" "}
                {formatTonnes(totals.scope3Spend)} (SCREEN)
              </p>
            ) : (
              <p className="t-secondary mt-3" style={{ maxWidth: "44ch" }}>
                <strong>Partial Scope 2 only.</strong> This is a real figure from a real
                factor, for the {uploadCount.length === 1 ? "one bill" : `${uploadCount.length} bills`} you
                uploaded — it is not a footprint. Scope 1 and Scope 3 are not included on the
                free preview.{" "}
                <Link href="/settings/billing" style={{ fontWeight: 600 }}>
                  See the plans
                </Link>
              </p>
            )}
          </>
        ) : (
          <div className="mt-3">
            <p className="t-display" style={{ color: "var(--color-fg-2)" }}>
              —.— <span className="unit">tCO2e</span>
            </p>
            <p className="t-body mt-3" style={{ maxWidth: "44ch" }}>
              Nothing is computed yet. Upload one electricity bill and this becomes a real
              number with the factor it came from — no sample data, no placeholder.
            </p>
          </div>
        )}

        <JobRunner pending={pending} label="COMPUTING" />
      </section>

      <CoverageMeter coverage={coverage} year={period.year} />

      {needsReview > 0 && (
        <Link href="/documents" className="row-plain mt-4 flex items-center justify-between gap-3">
          <span>
            <span className="t-title" style={{ color: "var(--color-amber-text)" }}>
              {needsReview} document{needsReview === 1 ? "" : "s"} need review
            </span>
            <span className="t-secondary block">
              Their figures are not in the total until you confirm them.
            </span>
          </span>
          <span className="t-data" style={{ color: "var(--color-amber-text)" }}>
            REVIEW
          </span>
        </Link>
      )}

      {anyData && fullTotal && (
        <ScopeRows
          data={{
            scope1: { text: `${formatTonnes(totals.scope1)} tCO2e`, thread: thread1 },
            scope2Location: {
              text: `${formatTonnes(totals.scope2Location)} tCO2e`,
              thread: thread2Loc,
            },
            scope2Market: { text: `${formatTonnes(totals.scope2Market)} tCO2e`, thread: thread2Mkt },
            scope3: hasSpend
              ? { text: `${formatTonnes(totals.scope3Spend)} tCO2e`, thread: thread3 }
              : null,
          }}
        />
      )}

      {/* Intensity metrics */}
      {anyData && fullTotal && (perRevenue > 0 || perFte > 0) && (
        <section className="mt-8">
          <h2 className="t-label">Intensity</h2>
          <div className="row-plain mt-2 flex items-baseline justify-between gap-3">
            <span className="t-body">Per $1M of revenue</span>
            <span className="t-mono whitespace-nowrap">
              {perRevenue > 0 ? `${(perRevenue / 1000).toFixed(2)} tCO2e` : "not recorded"}
            </span>
          </div>
          <div className="row-plain flex items-baseline justify-between gap-3">
            <span className="t-body">Per full-time employee</span>
            <span className="t-mono whitespace-nowrap">
              {perFte > 0 ? `${(perFte / 1000).toFixed(2)} tCO2e` : "not recorded"}
            </span>
          </div>
        </section>
      )}

      {/* By site */}
      {anyData && fullTotal && siteRows.length > 1 && (
        <section className="mt-8">
          <h2 className="t-label">By site</h2>
          {siteRows.map((s) => (
            <div key={s.id} className="row-plain flex items-baseline justify-between gap-3">
              <span className="t-body">{s.name}</span>
              <span className="t-mono">{formatTonnes(bySite.get(s.id) ?? 0)} tCO2e</span>
            </div>
          ))}
        </section>
      )}

      {/* By month — a desktop enhancement per DESIGN.md, and a plain list below 1024px */}
      {anyData && fullTotal && byMonth.size > 0 && (
        <section className="mt-8">
          <h2 className="t-label">By month</h2>
          <div className="mt-3 hidden lg:flex lg:items-end lg:gap-2" style={{ height: 140 }}>
            {coverage.months.map((m) => {
              const g = byMonth.get(m.key) ?? 0;
              return (
                <div key={m.key} className="flex flex-1 flex-col items-center gap-2">
                  <span
                    style={{
                      width: "100%",
                      height: `${Math.max(2, Math.round((g / monthMax) * 116))}px`,
                      background: "var(--color-ink)",
                      borderRadius: 4,
                    }}
                    title={`${m.key} — ${formatTonnes(g)} tCO2e`}
                  />
                  <span className="t-data" style={{ color: "var(--color-fg-2)" }}>
                    {m.key.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="lg:hidden">
            {coverage.months
              .filter((m) => (byMonth.get(m.key) ?? 0) > 0)
              .map((m) => (
                <div key={m.key} className="row-plain flex items-baseline justify-between gap-3">
                  <span className="t-mono" style={{ color: "var(--color-fg-2)" }}>
                    {m.key}
                  </span>
                  <span className="t-mono">{formatTonnes(byMonth.get(m.key) ?? 0)} tCO2e</span>
                </div>
              ))}
          </div>
        </section>
      )}

      {!fullTotal && (
        <section className="panel mt-8 p-4">
          <p className="t-label">Free preview</p>
          <p className="t-body mt-2" style={{ maxWidth: "46ch" }}>
            {PLANS.starter.name} at $99/month reads the whole year: Scope 1, both Scope 2
            methods, the spend screen, and the CSRD-lite PDF.
          </p>
          <Link href="/settings/billing" className="btn btn-secondary mt-4 btn-full">
            See the plans
          </Link>
        </section>
      )}

      {/* Thumb-zone primary: upload until coverage is complete, then generate */}
      <div className="thumb-cta">
        {coverage.monthsComplete >= 12 && fullTotal ? (
          <Link href="/report" className="btn btn-primary btn-full">
            Generate report
          </Link>
        ) : (
          <Link href="/documents" className="btn btn-primary btn-full">
            <IconUpload size={18} />
            Upload bills
          </Link>
        )}
      </div>
    </main>
  );
}
