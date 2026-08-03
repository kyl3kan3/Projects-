/**
 * GET /api/exports/factoring/{id}
 *
 * Download a schedule-of-accounts CSV that was already built. Exports stay
 * reachable even when the account is read-only — the anti-lock-in promise on the
 * pricing page is a promise about exactly this.
 */

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { factoringExports } from "@/db/schema";
import { requireOffice } from "@/lib/auth";
import { getObject } from "@/lib/storage";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { carrier } = await requireOffice();
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const [row] = await getDb()
    .select()
    .from(factoringExports)
    .where(and(eq(factoringExports.id, id), eq(factoringExports.carrierId, carrier.id)));
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const bytes = await getObject(row.csvR2Key);
  if (!bytes) {
    return NextResponse.json({ error: "The CSV is missing from storage." }, { status: 410 });
  }
  const filename = row.csvR2Key.split("/").pop() ?? "schedule-of-accounts.csv";
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
