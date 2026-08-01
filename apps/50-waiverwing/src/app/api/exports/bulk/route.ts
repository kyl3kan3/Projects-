/**
 * Bulk export by date range — the records request an insurer or an attorney sends.
 *
 * Capped at 500 records per pull (ROADMAP). Over the cap the document says so on
 * page one rather than dropping records quietly, which is the difference between
 * a partial disclosure and a misleading one.
 */

import { NextResponse } from "next/server";
import { currentContext } from "@/lib/auth";
import { bulkExportPdf } from "@/lib/pdf";

function parseDay(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

export async function GET(req: Request): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const url = new URL(req.url);
  const now = new Date();
  const from = parseDay(url.searchParams.get("from"), new Date(now.getFullYear(), 0, 1));
  const to = parseDay(url.searchParams.get("to"), now);
  // An inclusive "to" date: nobody means "up to midnight" when they pick a day.
  const toEnd = new Date(to.getTime() + 86_400_000 - 1);
  const locationId = url.searchParams.get("locationId");

  if (from.getTime() > toEnd.getTime()) {
    return NextResponse.json({ error: "The start date is after the end date." }, { status: 400 });
  }

  const rendered = await bulkExportPdf(
    ctx.account.id,
    { from, to: toEnd, locationId },
    { userId: ctx.user.id },
  );

  return new NextResponse(Buffer.from(rendered.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${rendered.filename}"`,
      "x-waiverwing-records": String(rendered.included),
      "x-waiverwing-truncated": String(rendered.truncated),
    },
  });
}
