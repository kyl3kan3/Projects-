/**
 * GET /api/documents/{id}
 *
 * Serves a document to a signed-in member of the carrier that owns it. Reads go
 * through the app rather than through a presigned GET link on purpose: a link to
 * a signed BOL is a link anybody who ever sees it keeps for ever, and these are
 * a carrier's legal records.
 */

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, loads } from "@/db/schema";
import { currentContext } from "@/lib/auth";
import { driverOwnsLoad } from "@/lib/loads";
import { getObject } from "@/lib/storage";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const db = getDb();
  const [document] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.carrierId, ctx.carrier.id)));
  if (!document) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // A driver sees the paperwork for their own loads and nothing else.
  if (ctx.user.role === "driver" && document.loadId) {
    const [load] = await db.select().from(loads).where(eq(loads.id, document.loadId));
    if (!load || !driverOwnsLoad(load, ctx.user)) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
  }

  const bytes = await getObject(document.r2Key);
  if (!bytes) {
    return NextResponse.json(
      { error: "The record is here but the file is missing from storage." },
      { status: 410 },
    );
  }

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "content-type": document.contentType,
      "content-length": String(bytes.byteLength),
      "content-disposition": `inline; filename="${document.filename.replace(/["\\]/g, "")}"`,
      "cache-control": "private, max-age=300",
    },
  });
}
