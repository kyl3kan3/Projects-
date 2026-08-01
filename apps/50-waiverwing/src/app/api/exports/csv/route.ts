/** The same scope as a CSV manifest — Front Desk and above. */

import { NextResponse } from "next/server";
import { currentContext } from "@/lib/auth";
import { bulkExportCsv } from "@/lib/pdf";
import { featureAllowed } from "@/lib/plans";
import { getDb } from "@/db";
import { exportLog } from "@/db/schema";

function parseDay(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

export async function GET(req: Request): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!featureAllowed(ctx.account, "csvExport")) {
    return NextResponse.json({ error: "CSV export is part of Front Desk" }, { status: 402 });
  }

  const url = new URL(req.url);
  const now = new Date();
  const from = parseDay(url.searchParams.get("from"), new Date(now.getFullYear(), 0, 1));
  const to = parseDay(url.searchParams.get("to"), now);
  const toEnd = new Date(to.getTime() + 86_400_000 - 1);
  const locationId = url.searchParams.get("locationId");

  const csv = await bulkExportCsv(ctx.account.id, { from, to: toEnd, locationId });

  await getDb().insert(exportLog).values({
    accountId: ctx.account.id,
    userId: ctx.user.id,
    kind: "csv",
    scope: { from: from.toISOString(), to: toEnd.toISOString(), locationId },
    byteSize: Buffer.byteLength(csv, "utf8"),
  });

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="waiverwing-${from.toISOString().slice(0, 10)}.csv"`,
    },
  });
}
