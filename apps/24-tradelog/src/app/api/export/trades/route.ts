/**
 * Journal export: every trade as CSV, for the Pro tier.
 *
 * The columns are the ones a spreadsheet or a tax preparer needs, written in the
 * same fixed-point form the app stores — so the file reconciles against the
 * screens to the cent rather than being a rounded rendering of them.
 */

import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { setups, trades } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { plan } from "@/lib/plans";
import { displaySymbol } from "@/lib/instruments";
import { formatCents, formatPrice, formatQty, formatR } from "@/lib/money";
import { zonedClock, zonedDateKey } from "@/lib/tz";

export const dynamic = "force-dynamic";

const COLUMNS = [
  "date",
  "opened",
  "closed",
  "symbol",
  "asset_class",
  "direction",
  "quantity",
  "avg_entry",
  "avg_exit",
  "stop",
  "gross_pnl",
  "fees",
  "net_pnl",
  "r_multiple",
  "hold_seconds",
  "status",
  "setup",
  "emotion_tags",
  "notes",
] as const;

/** RFC 4180: quote everything that could contain a comma, quote or newline. */
function cell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return new Response("Not found", { status: 404 });
  if (!plan(user.plan).dataExport) {
    return new Response("Journal export is a Pro feature.", { status: 402 });
  }

  const rows = await getDb()
    .select({ trade: trades, setupName: setups.name })
    .from(trades)
    .leftJoin(setups, eq(setups.id, trades.setupId))
    .where(and(eq(trades.userId, user.id)))
    .orderBy(asc(trades.openedAt));

  const lines = [COLUMNS.join(",")];
  for (const { trade, setupName } of rows) {
    lines.push(
      [
        zonedDateKey(trade.openedAt, user.timezone),
        zonedClock(trade.openedAt, user.timezone),
        trade.closedAt ? zonedClock(trade.closedAt, user.timezone) : "",
        displaySymbol(trade.assetClass, trade.symbol),
        trade.assetClass,
        trade.direction,
        formatQty(trade.qtyMax),
        formatPrice(trade.avgEntry),
        trade.avgExit === null ? "" : formatPrice(trade.avgExit),
        trade.stopPrice === null ? "" : formatPrice(trade.stopPrice),
        formatCents(trade.grossPnlCents, { ascii: true }),
        formatCents(trade.feesCents, { ascii: true }),
        formatCents(trade.netPnlCents, { ascii: true }),
        trade.rMultiple === null ? "" : formatR(trade.rMultiple).replace("−", "-"),
        trade.holdSeconds === null ? "" : String(trade.holdSeconds),
        trade.status,
        setupName ?? "",
        trade.emotionTags.join(" "),
        trade.notes ?? "",
      ]
        .map(cell)
        .join(","),
    );
  }

  const filename = `tradelog-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(`${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
