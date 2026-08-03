/**
 * The PDF export.
 *
 * Rendered on demand rather than stored: the report is assembled from rows that can change
 * (a redline accepted, a playbook edited), and a stale PDF sitting in object storage is a
 * copy of a report nobody can see any more. Rendering costs milliseconds.
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assembleReport, getContract } from "@/lib/contracts";
import { pdfFilename, renderReportPdf } from "@/lib/reports";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const { account } = await requireUser();
  const contract = await getContract(account.id, id);
  if (!contract) return new NextResponse("Not found", { status: 404 });
  if (contract.status !== "ready") {
    return new NextResponse("This review has not finished yet", { status: 409 });
  }

  const view = await assembleReport(contract);
  const bytes = await renderReportPdf(view);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${pdfFilename(contract)}"`,
      "cache-control": "private, no-store",
    },
  });
}
