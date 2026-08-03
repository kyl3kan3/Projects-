/**
 * GET /api/binders/[propertyId] — the audit binder (README MVP item 9).
 *
 * `?format=csv` returns just the compliance matrix as a spreadsheet; the default is
 * the full PDF binder: matrix, every deficiency sentence, and the current
 * certificate for each vendor.
 *
 * Deliberately available in read-only mode. An org whose trial lapsed still gets its
 * binder — see lib/plans.ts.
 */

import { NextResponse } from "next/server";
import { currentContext } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { buildBinder } from "@/lib/binder";
import { getDb } from "@/db";
import { binderExports } from "@/db/schema";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/compliance";
import { toCsv } from "@/lib/csv";
import { binderKey, putBinder } from "@/lib/storage";
import { engagementViews } from "@/lib/verdicts";
import { propertyById } from "@/lib/vendors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ propertyId: string }> },
): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { propertyId } = await params;
  const property = await propertyById(ctx.org.id, propertyId);
  if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const views = await engagementViews(ctx.org, { propertyId: property.id });
  const format = new URL(req.url).searchParams.get("format");
  const slug = property.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  if (format === "csv") {
    const rows: Array<Array<unknown>> = [
      [
        "Vendor",
        "Trade",
        "Property",
        "Requirement",
        "Verdict",
        "Coverage to",
        "Days",
        "GL each occurrence",
        "Certificate sha256",
        "Deficiencies",
      ],
      ...views.map((view) => [
        view.vendor.name,
        view.vendor.trade ?? "",
        property.name,
        view.template.name,
        STATUS_LABEL[view.verdict.status],
        view.verdict.soonestExpiry ? formatDate(view.verdict.soonestExpiry) : "",
        view.verdict.daysToExpiry ?? "",
        formatCents(view.coverages.find((c) => c.kind === "gl_each_occurrence")?.limitCents ?? null),
        view.certificate?.sha256 ?? "",
        view.verdict.deficiencies.map((d) => d.reason).join(" "),
      ]),
    ];
    return new NextResponse(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}-compliance-matrix.csv"`,
      },
    });
  }

  const at = new Date();
  const binder = await buildBinder(ctx.org, property, views, at);
  const key = binderKey(ctx.org.id, property.id, at);
  await putBinder(key, binder.bytes);

  const db = getDb();
  await db.insert(binderExports).values({
    orgId: ctx.org.id,
    propertyId: property.id,
    r2Key: key,
    requestedBy: ctx.user.id,
    exportedAt: at,
  });
  await appendAudit({
    orgId: ctx.org.id,
    actor: `${ctx.user.name} <${ctx.user.email}>`,
    action: "binder.exported",
    target: property.name,
    metadata: {
      key,
      engagements: views.length,
      certificates: binder.certificateCount,
      omitted: binder.omitted.length,
    },
  });

  return new NextResponse(new Uint8Array(binder.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(binder.bytes.byteLength),
      "Content-Disposition": `attachment; filename="${slug}-binder-${formatDate(
        at.toISOString().slice(0, 10),
      ).replace(/[ ,]+/g, "-")}.pdf"`,
      // Regenerated on every request, because the verdicts inside it are as-of-now.
      "Cache-Control": "no-store",
      "X-Binder-Certificates": String(binder.certificateCount),
      "X-Binder-Omitted": String(binder.omitted.length),
    },
  });
}
