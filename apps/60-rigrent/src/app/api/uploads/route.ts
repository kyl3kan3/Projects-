/**
 * POST /api/uploads
 *
 * Condition photos from a driver's phone.
 *
 * ARCHITECTURE.md specifies a presigned PUT straight to R2. There are no R2
 * credentials in this environment, so this route takes the multipart POST and
 * writes through `lib/storage`, which produces the same key either way — nothing
 * downstream can tell which path a photo arrived by. `GET /api/uploads` returns a
 * presigned URL when the s3 driver *is* configured, so a real deployment does not
 * push image bytes through a function.
 *
 * Only jpeg, png and webp are accepted. SVG is deliberately refused: it is a script
 * container and this app serves stored objects inline.
 */

import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { orderLines, orders } from "@/db/schema";
import { currentContext } from "@/lib/auth";
import { attachPhoto, ensureCheck } from "@/lib/checkin";
import { formatInstant } from "@/lib/dates";
import { canWrite, entitlements } from "@/lib/plans";
import { ALLOWED_PHOTO_TYPES, MAX_PHOTO_BYTES, presignUpload, putFile } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<Response> {
  /**
   * `currentContext`, not `requireSession`. `requireSession` redirects, and a 307
   * to an HTML sign-in page is the wrong answer to a `fetch` — the driver's phone
   * followed it, failed to parse HTML as JSON, and showed "check the signal and
   * try again" for what was actually an expired session.
   */
  const ctx = await currentContext();
  if (!ctx) {
    return Response.json(
      { ok: false, error: "Your session has expired. Sign in again and re-take the photo." },
      { status: 401 },
    );
  }
  const { account, user } = ctx;
  const gate = canWrite(entitlements(account));
  if (!gate.allowed) {
    return Response.json({ ok: false, error: gate.reason ?? "read-only" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "Send the photo as multipart form data." }, { status: 400 });
  }

  const file = form.get("file");
  const orderLineId = String(form.get("orderLineId") ?? "");
  const direction = String(form.get("direction") ?? "") === "out" ? "out" : "in";

  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: "No photo in that upload." }, { status: 400 });
  }
  const ext = ALLOWED_PHOTO_TYPES[file.type];
  if (!ext) {
    return Response.json(
      { ok: false, error: "Photos have to be JPEG, PNG or WebP." },
      { status: 415 },
    );
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return Response.json(
      { ok: false, error: "That photo is over 12MB. Your phone's normal setting is well under it." },
      { status: 413 },
    );
  }

  // The line has to belong to this account — a line id in a request body is not
  // evidence of anything.
  const [line] = await getDb()
    .select({ id: orderLines.id, orderId: orders.id })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .where(and(eq(orderLines.id, orderLineId), eq(orders.accountId, account.id)));
  if (!line) {
    return Response.json({ ok: false, error: "That line is not in this account." }, { status: 404 });
  }

  const check = await ensureCheck(orderLineId, direction, user.id);
  const bytes = Buffer.from(await file.arrayBuffer());
  const stored = await putFile(account.id, "photo", ext, bytes);
  await attachPhoto({
    checkId: check.id,
    key: stored.key,
    caption: `${direction === "out" ? "OUT" : "IN"} · ${formatInstant(new Date())}`,
  });

  return Response.json({ ok: true, key: stored.key, checkId: check.id });
}

/**
 * A presigned upload URL, for the deployment where R2 is configured. Returns
 * `url: null` on the local driver, which is the client's signal to POST instead.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) {
    return Response.json({ ok: false, error: "Sign in again." }, { status: 401 });
  }
  const { account } = ctx;
  const gate = canWrite(entitlements(account));
  if (!gate.allowed) {
    return Response.json({ ok: false, error: gate.reason ?? "read-only" }, { status: 403 });
  }
  const contentType = request.nextUrl.searchParams.get("contentType") ?? "";
  const ext = ALLOWED_PHOTO_TYPES[contentType];
  if (!ext) {
    return Response.json(
      { ok: false, error: "Photos have to be JPEG, PNG or WebP." },
      { status: 415 },
    );
  }
  const presigned = await presignUpload(account.id, "photo", ext);
  return Response.json({ ok: true, ...presigned });
}
