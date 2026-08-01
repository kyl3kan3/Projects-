import { NextResponse, type NextRequest } from "next/server";
import { currentContext } from "@/lib/auth";
import { adjustmentsFor, loadLevelingPage } from "@/lib/leveling-data";
import { answeredQuestions } from "@/lib/questions";
import { exportFilename, levelingCsv, levelingPdf, type ExportInput } from "@/lib/export";
import { hasLevelingExports } from "@/lib/plans";
import { audit } from "@/lib/audit";

/**
 * The owner-meeting export. Company-scoped from the session; the package id in the
 * URL is only ever used inside a query that also filters on the company.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ pkgId: string }> },
) {
  const ctx = await currentContext();
  if (!ctx) return new NextResponse("Sign in first", { status: 401 });
  if (!hasLevelingExports(ctx.company.plan)) {
    return new NextResponse("Leveling exports are on Builder and up", { status: 402 });
  }

  const { pkgId } = await params;
  const page = await loadLevelingPage(ctx.company.id, pkgId);
  if (!page) return new NextResponse("Not found", { status: 404 });

  const [adjustments, questions] = await Promise.all([
    adjustmentsFor(ctx.company.id, pkgId),
    answeredQuestions(ctx.company.id, pkgId),
  ]);

  const input: ExportInput = {
    project: page.project,
    pkg: page.pkg,
    grid: page.grid,
    adjustments,
    questions,
    generatedAt: new Date(),
    companyName: ctx.company.name,
  };

  const format = req.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "csv";
  await audit({
    companyId: ctx.company.id,
    actorKind: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    action: `leveling.exported_${format}`,
    target: `package:${pkgId}`,
    metadata: { bids: page.grid.columns.length },
  });

  const filename = exportFilename({ project: page.project, pkg: page.pkg, ext: format });

  if (format === "pdf") {
    const bytes = await levelingPdf(input);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  return new NextResponse(levelingCsv(input), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
