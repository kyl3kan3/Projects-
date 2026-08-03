/**
 * Download a binder that was already assembled. The bundle itself is never
 * regenerated here: what was handed to an inspector has to stay reproducible, so
 * a re-export is a new row and a new artifact.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, binderExports } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getObject, signedGetUrl, storageBackend } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const { company, user } = await requireUser();
  const db = getDb();

  const [row] = await db
    .select()
    .from(binderExports)
    .where(and(eq(binderExports.id, id), eq(binderExports.companyId, company.id)));
  if (!row) return new Response("not found", { status: 404 });

  await db.insert(auditLog).values({
    companyId: company.id,
    actor: user.email,
    action: "binder.download",
    target: row.id,
    metadata: { rangeStart: row.rangeStart, rangeEnd: row.rangeEnd },
  });

  if (storageBackend() === "r2") {
    const url = await signedGetUrl(row.storageKey, 300);
    if (url) return Response.redirect(url, 302);
  }

  const object = await getObject(row.storageKey);
  if (!object) return new Response("not found", { status: 404 });
  return new Response(Buffer.from(object.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="safety-records-${row.rangeStart}-to-${row.rangeEnd}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
