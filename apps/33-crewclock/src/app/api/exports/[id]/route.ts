/**
 * Download a generated payroll file.
 *
 * The bytes come out of the database exactly as they were generated, so a
 * re-download in August is byte-identical to the file the bookkeeper imported in
 * February — which is the difference between "here is your file again" and "here
 * is a new file that might not match your payroll run".
 */

import type { NextRequest } from "next/server";
import { currentContext, isOffice } from "@/lib/auth";
import { getExport } from "@/lib/payroll-export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return new Response("unauthorized", { status: 401 });
  if (!isOffice(ctx.user.role)) return new Response("forbidden", { status: 403 });

  const record = await getExport(ctx.org.id, (await params).id);
  if (!record || !record.csv) return new Response("not found", { status: 404 });

  const filename = `crewclock-${record.format}-${record.periodStart}_${record.periodEnd}.csv`;
  return new Response(record.csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
