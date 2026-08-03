/**
 * POST /api/walkthroughs/:id/complete — end the walkthrough and draft the estimate.
 *
 * ARCHITECTURE.md puts this on a BullMQ worker. The deployment target has no
 * always-on process, so the pipeline runs here, inline, with its status machine
 * persisted at each step (uploaded → transcribing → drafting → drafted | failed) so
 * the capture screen can poll and show what is happening. It is idempotent: a
 * retried request returns the estimate the first one produced.
 *
 * Failures come back as typed codes the capture screen turns into the right offer —
 * an upgrade prompt for PLAN_LIMIT, "re-record or write it by hand" for a
 * transcription failure — never a stack trace.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { currentContext } from "@/lib/auth";
import { completeWalkthrough } from "@/lib/walkthroughs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Whisper on a five-minute walkthrough plus the drafting call is 30–90s.
export const maxDuration = 300;

const bodySchema = z.object({
  durationSeconds: z.number().int().min(0).max(36_000).optional(),
  notes: z.string().max(4_000).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });

  const result = await completeWalkthrough(ctx.org, ctx.user.id, id, {
    durationSeconds: parsed.data.durationSeconds,
    notes: parsed.data.notes,
  });

  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : result.code === "PLAN_LIMIT" ? 402 : 422;
    return Response.json({ error: result.message, code: result.code }, { status });
  }
  return Response.json({
    ok: true,
    estimateId: result.estimateId,
    degraded: result.degraded,
    notice: result.notice,
  });
}
