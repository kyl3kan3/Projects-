/**
 * CSV export for a PO draft.
 *
 * A route rather than a server action because the browser has to receive a file: an
 * action returns a value into React, not a download. Scoped to the signed-in
 * merchant's own shop — a PO draft id is a uuid, but "hard to guess" is not
 * authorisation.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { poDraftLines, poDrafts } from "@/db/schema";
import { requireShop } from "@/lib/auth";
import { todayInZone } from "@/lib/dates";
import { csvFilename, renderCsv } from "@/lib/po";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { shop } = await requireShop();
  const { id } = await params;

  const db = getDb();
  const [draft] = await db
    .select()
    .from(poDrafts)
    .where(and(eq(poDrafts.id, id), eq(poDrafts.shopId, shop.id)))
    .limit(1);
  if (!draft) return new Response("Not found", { status: 404 });

  const lines = await db
    .select()
    .from(poDraftLines)
    .where(eq(poDraftLines.poDraftId, draft.id))
    .orderBy(poDraftLines.sku);

  const today = todayInZone(shop.timezone);
  const csv = renderCsv({
    draft,
    lines: lines.filter((line) => line.finalQty > 0),
    shopName: shop.name,
    shopDomain: shop.shopifyDomain,
    today,
  });

  return new Response(csv, {
    headers: {
      // charset=utf-8 and the BOM inside the body: between them, Excel on Windows
      // and Sheets both open it without a manual import step.
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${csvFilename(draft, today)}"`,
      "cache-control": "no-store",
    },
  });
}
