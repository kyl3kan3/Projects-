/**
 * POST /api/uploads/complete
 *
 * The second half of the upload: the bytes are in storage, so write the
 * `documents` row and, for a rate confirmation, enqueue the parse.
 *
 * The size is re-read from storage rather than trusted from the client, so the
 * documents table cannot be made to disagree with what is actually stored.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, loads } from "@/db/schema";
import { currentContext } from "@/lib/auth";
import { enqueue } from "@/lib/queue";
import { isAllowedContentType, objectSize } from "@/lib/storage";

const BodySchema = z.object({
  key: z.string().min(3).max(400),
  kind: z.enum(["rate_con", "bol", "pod_photo", "fuel_receipt", "other"]),
  loadId: z.string().uuid().nullable().optional(),
  filename: z.string().min(1).max(200),
  contentType: z.string().min(3).max(100),
});

export async function POST(request: Request): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed upload completion." }, { status: 400 });
  }
  const input = parsed.data;

  if (!isAllowedContentType(input.contentType)) {
    return NextResponse.json({ error: "Unsupported content type." }, { status: 415 });
  }
  // The key was minted for this carrier; nothing else may be claimed.
  if (!input.key.startsWith(`${ctx.carrier.id}/`)) {
    return NextResponse.json({ error: "That object does not belong to this account." }, { status: 403 });
  }

  const db = getDb();
  if (input.loadId) {
    const [load] = await db
      .select({ id: loads.id })
      .from(loads)
      .where(and(eq(loads.id, input.loadId), eq(loads.carrierId, ctx.carrier.id)));
    if (!load) return NextResponse.json({ error: "That load is not on this account." }, { status: 404 });
  }

  const sizeBytes = await objectSize(input.key);
  if (sizeBytes === null || sizeBytes === 0) {
    return NextResponse.json(
      { error: "Nothing arrived in storage under that key. Try the upload again." },
      { status: 409 },
    );
  }

  const [document] = await db
    .insert(documents)
    .values({
      carrierId: ctx.carrier.id,
      loadId: input.loadId ?? null,
      kind: input.kind,
      r2Key: input.key,
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes,
      uploadedBy: ctx.user.id,
    })
    .returning();

  let parseQueued = false;
  let parseError: string | null = null;
  if (input.kind === "rate_con") {
    const result = await enqueue("parse-rate-con", {
      carrierId: ctx.carrier.id,
      documentId: document.id,
    });
    parseQueued = result.ok;
    parseError = result.error;
  }

  return NextResponse.json({
    documentId: document.id,
    sizeBytes,
    parseQueued,
    parseError,
  });
}
