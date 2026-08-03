/**
 * POST /api/uploads/confirm — the capture client says an asset landed; we check.
 *
 * The check is a HEAD against the object store, not trust: a phone that reports
 * success while the PUT actually failed is exactly how a walkthrough silently
 * loses half its audio and produces a thin estimate nobody can explain.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { currentContext } from "@/lib/auth";
import { confirmUpload } from "@/lib/walkthroughs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  mediaId: z.string().uuid(),
  caption: z.string().max(400).optional(),
});

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });

  const result = await confirmUpload(ctx.org.id, parsed.data.mediaId, parsed.data.caption);
  return Response.json(
    result.ok
      ? { ok: true, sizeBytes: result.sizeBytes }
      : { ok: false, error: "The upload did not land — retrying." },
    { status: result.ok ? 200 : 409 },
  );
}
