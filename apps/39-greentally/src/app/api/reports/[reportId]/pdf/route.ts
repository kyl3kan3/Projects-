/**
 * Render a report to PDF.
 *
 * The renderer loads the print route in headless Chromium, which is exactly what the
 * screen shows — one layout, one document. Where no Chromium binary exists (a Vercel
 * function, for instance) this returns 503 with a message the UI shows, and the print
 * view remains a complete path to the same A4 PDF through the browser's own dialogue.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reports } from "@/db/schema";
import { currentContext } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { canDownloadReport } from "@/lib/plans";
import { renderReportPdf } from "@/lib/pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> },
): Promise<Response> {
  const { reportId } = await params;
  const ctx = await currentContext();
  if (!ctx) return Response.json({ message: "Not signed in." }, { status: 401 });

  const [report] = await getDb().select().from(reports).where(eq(reports.id, reportId));
  if (!report || report.organizationId !== ctx.org.id) {
    return Response.json({ message: "Not found." }, { status: 404 });
  }

  const gate = canDownloadReport(ctx.org.plan);
  if (!gate.allowed) return Response.json({ message: gate.reason }, { status: 402 });

  // Prefer the request's own origin: a self-hosted deployment behind a proxy has a
  // working origin even when APP_URL was never set.
  const origin = new URL(req.url).origin || env.appUrl;
  const outcome = await renderReportPdf(reportId, origin);

  if (!outcome.ok) {
    return Response.json(
      {
        message:
          outcome.reason === "no_browser"
            ? "This deployment cannot render PDFs server-side (no Chromium). Open the print view and use your browser's Print → Save as PDF — it produces the same A4 document."
            : `The PDF renderer failed: ${outcome.message}`,
      },
      { status: 503 },
    );
  }

  await audit({
    organizationId: ctx.org.id,
    actor: ctx.user.id,
    actorLabel: ctx.user.name,
    action: "report.downloaded",
    target: `Reporting year ${report.totalsSnapshot.year}`,
    metadata: { format: "pdf", reportId },
  });

  return new Response(Buffer.from(outcome.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(outcome.bytes.length),
      "content-disposition": `attachment; filename="greentally-${report.totalsSnapshot.year}-ghg-inventory.pdf"`,
    },
  });
}
