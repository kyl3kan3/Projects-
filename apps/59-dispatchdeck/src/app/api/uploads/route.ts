/**
 * POST /api/uploads
 *
 * Mints a presigned upload URL. The client PUTs the bytes straight to storage —
 * a 9MB BOL photo from a truck stop never travels through a function.
 *
 * The document row is written by POST /api/uploads/complete once the PUT lands,
 * so a cancelled upload leaves no phantom document on the load.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { loads } from "@/db/schema";
import { currentContext } from "@/lib/auth";
import { documentFilename, isoDayIn } from "@/lib/format";
import {
  ALLOWED_CONTENT_TYPES,
  isAllowedContentType,
  maxBytesFor,
  objectKey,
  presignUpload,
  storageMisconfigured,
} from "@/lib/storage";

const BodySchema = z.object({
  kind: z.enum(["rate_con", "bol", "pod_photo", "fuel_receipt", "other"]),
  loadId: z.string().uuid().nullable().optional(),
  filename: z.string().min(1).max(200),
  contentType: z.string().min(3).max(100),
  sizeBytes: z.number().int().positive(),
});

export async function POST(request: Request): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const misconfigured = storageMisconfigured();
  if (misconfigured) return NextResponse.json({ error: misconfigured }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 },
    );
  }
  const input = parsed.data;

  if (!isAllowedContentType(input.contentType)) {
    return NextResponse.json(
      { error: `${input.contentType} is not accepted. Send ${ALLOWED_CONTENT_TYPES.join(", ")}.` },
      { status: 415 },
    );
  }
  const limit = maxBytesFor(input.contentType);
  if (input.sizeBytes > limit) {
    return NextResponse.json(
      {
        error: `That file is ${Math.round(input.sizeBytes / 1_048_576)}MB and the limit is ${Math.round(limit / 1_048_576)}MB.`,
      },
      { status: 413 },
    );
  }

  // A driver must not be able to attach a photo to another carrier's load.
  let reference: string | null = null;
  if (input.loadId) {
    const [load] = await getDb()
      .select({ id: loads.id, reference: loads.reference })
      .from(loads)
      .where(and(eq(loads.id, input.loadId), eq(loads.carrierId, ctx.carrier.id)));
    if (!load) return NextResponse.json({ error: "That load is not on this account." }, { status: 404 });
    reference = load.reference;
  }

  const filename = documentFilename(input.kind, {
    reference,
    contentType: input.contentType,
    day: isoDayIn(new Date(), ctx.carrier.timezone),
  });
  const key = objectKey(ctx.carrier.id, input.loadId ?? null, filename);
  const presigned = await presignUpload({
    key,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
  });

  return NextResponse.json({ ...presigned, filename });
}
