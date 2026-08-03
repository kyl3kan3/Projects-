/**
 * POST /api/uploads/presign — register one walkthrough asset and hand back a
 * short-lived PUT.
 *
 * The phone uploads the bytes itself (straight to R2 when it is configured), so a
 * five-minute walkthrough on cellular never waits on our server. The response is
 * per-asset on purpose: the capture client retries one chunk without touching the
 * others.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { currentContext } from "@/lib/auth";
import { registerUpload } from "@/lib/walkthroughs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  walkthroughId: z.string().uuid(),
  kind: z.enum(["audio", "photo"]),
  sequence: z.number().int().min(0).max(2_000),
  contentType: z.string().min(3).max(120),
  sizeBytes: z.number().int().min(0).max(200_000_000).optional(),
});

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });

  const result = await registerUpload({
    org: ctx.org,
    walkthroughId: parsed.data.walkthroughId,
    kind: parsed.data.kind,
    sequence: parsed.data.sequence,
    contentType: parsed.data.contentType,
    sizeBytes: parsed.data.sizeBytes,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: 422 });
  return Response.json(result.upload);
}
