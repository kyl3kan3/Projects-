import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reports } from "@/db/schema";
import { currentContext } from "@/lib/auth";
import { buildReportContext } from "@/lib/report";
import { verifyRenderToken } from "@/lib/pdf";
import { ReportDocument } from "@/components/ReportDocument";
import { canDownloadReport } from "@/lib/plans";

export const metadata: Metadata = { title: "GHG inventory" };
export const dynamic = "force-dynamic";

/**
 * The print-CSS report route. Two ways in and no third:
 *
 *  - a signed render token, used by the headless-Chromium renderer, which has no cookies;
 *  - a session belonging to the organisation that owns the report.
 *
 * No interactive elements, `@page` rules from globals.css, and the same
 * `ReportDocument` component the screen shows — so the PDF cannot drift from the preview.
 */
export default async function PrintReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ reportId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { reportId } = await params;
  const { token } = await searchParams;

  const db = getDb();
  const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
  if (!report) notFound();

  let authorised = false;
  let watermark = false;
  if (token && verifyRenderToken(reportId, token)) {
    authorised = true;
  } else {
    const ctx = await currentContext();
    if (ctx && ctx.org.id === report.organizationId) {
      authorised = true;
      watermark = !canDownloadReport(ctx.org.plan).allowed;
    }
  }
  if (!authorised) notFound();

  const ctx = await buildReportContext(report.periodId);

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "24px 20px 48px" }}>
      <ReportDocument ctx={ctx} watermark={watermark} />
    </main>
  );
}
