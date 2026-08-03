/**
 * GET /api/exports/loads
 *
 * Every load with its lane, rate, accessorials, invoice and payment state, as
 * CSV. This is the cancel-anytime promise made good: it works on any plan, in
 * read-only, and needs no support ticket.
 */

import { NextResponse } from "next/server";
import { requireOffice } from "@/lib/auth";
import { csvLine } from "@/lib/factoring";
import { formatLane, isoDayIn, statusLabel } from "@/lib/format";
import { listLoads } from "@/lib/loads";
import { listReceivables } from "@/lib/invoicing";
import { centsToDecimal } from "@/lib/money";

export async function GET(): Promise<Response> {
  const { carrier } = await requireOffice();
  const [loadRows, receivables] = await Promise.all([
    listLoads({ carrierId: carrier.id, limit: 5000 }),
    listReceivables(carrier.id),
  ]);

  const byLoad = new Map(receivables.map((r) => [r.load.id, r]));

  const lines = [
    csvLine([
      "Reference",
      "Status",
      "Broker",
      "Broker MC",
      "Lane",
      "Equipment",
      "Booked",
      "Delivered",
      "Loaded Miles",
      "Deadhead Miles",
      "Linehaul",
      "Accessorials",
      "Invoice Number",
      "Invoice Amount",
      "Invoice Status",
      "Paid",
      "Factored",
      "Factoring Status",
    ]),
  ];

  for (const row of loadRows) {
    const receivable = byLoad.get(row.load.id);
    lines.push(
      csvLine([
        row.load.reference ?? "",
        statusLabel(row.load.status),
        row.broker?.name ?? "",
        row.broker?.mcNumber ?? "",
        formatLane(row.stops),
        row.load.equipment,
        isoDayIn(row.load.bookedAt, carrier.timezone),
        row.load.deliveredAt ? isoDayIn(row.load.deliveredAt, carrier.timezone) : "",
        row.load.totalMiles ?? "",
        row.load.deadheadMiles ?? "",
        centsToDecimal(row.load.rateCents),
        centsToDecimal(row.load.accessorialsCents),
        receivable?.invoice.number ?? "",
        receivable ? centsToDecimal(receivable.invoice.amountCents) : "",
        receivable?.invoice.status ?? "",
        receivable ? centsToDecimal(receivable.paidCents) : "",
        row.load.factored ? "yes" : "no",
        row.load.factoringStatus ?? "",
      ]),
    );
  }

  const csv = `${lines.join("\r\n")}\r\n`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="dispatchdeck-loads-${isoDayIn(new Date(), carrier.timezone)}.csv"`,
    },
  });
}
