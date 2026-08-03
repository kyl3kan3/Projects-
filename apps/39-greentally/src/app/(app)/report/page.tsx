import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded } from "@/lib/auth";
import { buildReportContext } from "@/lib/report";
import { ReportDocument } from "@/components/ReportDocument";
import { canDownloadReport, canSeeFullTotal } from "@/lib/plans";
import { ReportControls } from "./ReportControls";
import { latestReportId } from "./actions";
import { formatTonnes } from "@/lib/units";

export const metadata: Metadata = { title: "Report" };
export const dynamic = "force-dynamic";

export default async function ReportPage() {
  const { org, period } = await requireOnboarded();
  const ctx = await buildReportContext(period.id);
  const gate = canDownloadReport(org.plan);
  const preview = !canSeeFullTotal(org.plan);
  const reportId = await latestReportId(period.id);
  const hasFigures = ctx.totals.totalMarket > 0;

  return (
    <main className="screen pt-5">
      <h1 className="t-h2 no-print">CSRD-lite report</h1>
      <p className="t-secondary mt-1 no-print" style={{ maxWidth: "50ch" }}>
        {hasFigures
          ? `Reporting year ${period.year} · ${formatTonnes(ctx.totals.totalMarket)} tCO2e reported · ${ctx.coverage.monthsComplete} of 12 months complete`
          : "Nothing to report yet. Accept at least one bill and this becomes a document."}
      </p>

      {!hasFigures && (
        <div className="panel mt-5 p-4 no-print">
          <p className="t-label">Where to start</p>
          <p className="t-body mt-2" style={{ maxWidth: "46ch" }}>
            Upload one electricity bill. The report fills in as figures land — cover,
            scope tables, coverage, methodology, factor citations.
          </p>
          <Link href="/documents" className="btn btn-secondary btn-full mt-4">
            Upload bills
          </Link>
        </div>
      )}

      <ReportControls
        reportId={reportId}
        locked={Boolean(period.lockedAt)}
        year={period.year}
        canDownload={gate.allowed}
        downloadReason={gate.reason}
        hasFigures={hasFigures}
      />

      <section className="mt-8">
        <h2 className="t-label no-print">
          {preview ? "Preview — pages 3 and 4 need a plan" : "The document"}
        </h2>
        <div className="mt-3">
          <ReportDocument ctx={ctx} watermark={preview} blurFrom={preview ? 2 : undefined} />
        </div>
      </section>
    </main>
  );
}
