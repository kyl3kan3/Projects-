/**
 * src/app/api/sessions/[id]/audio/route.ts
 *
 * PUT — the inline storage backend's upload target. Used when R2 is not
 * configured, so a self-hosted install (and the test suite) has a real,
 * purgeable artifact rather than a dangling object key.
 *
 * POST — finalize. Called after the bytes land by either backend, and it is what
 * starts the pipeline: `after()` runs the tick once the response is on the wire,
 * so the clinician's browser is not waiting on ASR.
 */

import { NextResponse } from "next/server";
import { after } from "next/server";
import { currentContext } from "@/lib/auth";
import { attachAudio, CaptureError } from "@/lib/sessions";
import { runPipelineTick } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
/** A 50-minute webm is a few MB; this bounds a hostile upload. */
const MAX_BYTES = 200 * 1024 * 1024;
export const maxDuration = 60;

export async function PUT(
  req: Request,
  ctxParams: { params: Promise<{ id: string }> },
): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctxParams.params;

  const buffer = Buffer.from(await req.arrayBuffer());
  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: "Empty upload" }, { status: 400 });
  }
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "That file is too large" }, { status: 413 });
  }

  const durationHeader = req.headers.get("x-duration-seconds");
  const durationSeconds = durationHeader ? Number(durationHeader) : null;

  try {
    await attachAudio(ctx.practice.id, id, buffer, {
      byteSize: buffer.byteLength,
      durationSeconds:
        durationSeconds && Number.isFinite(durationSeconds) ? durationSeconds : null,
      mime: req.headers.get("content-type") ?? undefined,
    });
  } catch (err) {
    if (err instanceof CaptureError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    console.error("[api/sessions/audio] store failed", err);
    return NextResponse.json({ error: "Could not store the audio" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, byteSize: buffer.byteLength });
}

export async function POST(
  req: Request,
  ctxParams: { params: Promise<{ id: string }> },
): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctxParams.params;

  // The R2 path uploads straight to the bucket, so the size arrives here.
  const body = (await req.json().catch(() => null)) as
    | { byteSize?: number; durationSeconds?: number }
    | null;
  if (body?.byteSize) {
    try {
      await attachAudio(ctx.practice.id, id, null, {
        byteSize: body.byteSize,
        durationSeconds: body.durationSeconds ?? null,
      });
    } catch (err) {
      if (err instanceof CaptureError) {
        return NextResponse.json({ error: err.message }, { status: 404 });
      }
      throw err;
    }
  }

  after(async () => {
    try {
      await runPipelineTick({ sessionIds: [id], budgetMs: 45_000, skipPurge: true });
    } catch (err) {
      console.error("[api/sessions/audio] inline tick failed", err);
    }
  });

  return NextResponse.json({ ok: true });
}
