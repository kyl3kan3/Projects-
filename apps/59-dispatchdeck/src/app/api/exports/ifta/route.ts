/**
 * GET /api/exports/ifta?year=2026&quarter=3[&truck=…]
 *
 * The quarter's worksheet as CSV, computed at request time from the ledger.
 * Nothing is cached: an IFTA export that was true last week is a filing error.
 */

import { NextResponse } from "next/server";
import { requireOffice } from "@/lib/auth";
import { currentQuarter, quarterCsv, quarterSummary, type Quarter } from "@/lib/ifta";

export async function GET(request: Request): Promise<Response> {
  const { carrier } = await requireOffice();
  const params = new URL(request.url).searchParams;
  const fallback = currentQuarter();

  const year = Number(params.get("year") ?? fallback.year);
  const quarter = Number(params.get("quarter") ?? fallback.quarter);
  const truck = params.get("truck");

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Bad year." }, { status: 400 });
  }
  if (![1, 2, 3, 4].includes(quarter)) {
    return NextResponse.json({ error: "Quarter must be 1, 2, 3 or 4." }, { status: 400 });
  }
  if (truck && !/^[0-9a-f-]{36}$/i.test(truck)) {
    return NextResponse.json({ error: "Bad truck id." }, { status: 400 });
  }

  const summary = await quarterSummary(carrier.id, year, quarter as Quarter, truck ?? undefined);
  const csv = quarterCsv(summary);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="ifta-${year}-Q${quarter}.csv"`,
    },
  });
}
