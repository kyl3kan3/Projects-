/**
 * src/app/api/sessions/route.ts
 *
 * Session capture for the audio paths: create the session, the note and the audio
 * slot, and tell the browser where to deliver the bytes — a signed R2 PUT when
 * object storage is configured, our own route when it is not.
 *
 * Shorthand does not come through here; it is a form, so it is a server action
 * (`(app)/capture/actions.ts`). Both call the same `captureSession`, so the
 * consent gate, the note meter and the plan check are identical either way.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { currentContext } from "@/lib/auth";
import { captureSession, CaptureError } from "@/lib/sessions";
import { requestMeta } from "@/lib/request";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  clientId: z.string().uuid(),
  captureKind: z.enum(["recording", "upload"]),
  templateId: z.string().uuid().nullable().optional(),
  mime: z.string().max(120).optional(),
  durationSeconds: z.number().int().positive().max(60 * 60 * 8).nullable().optional(),
  heldAt: z.string().datetime().optional(),
});

const STATUS: Record<CaptureError["code"], number> = {
  consent: 403,
  note_limit: 402,
  read_only: 402,
  plan_feature: 402,
  not_found: 404,
  invalid: 400,
};

export async function POST(req: Request): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed capture request" }, { status: 400 });
  }

  const meta = await requestMeta();
  try {
    const result = await captureSession(
      { practice: ctx.practice, user: ctx.user },
      {
        clientId: parsed.data.clientId,
        captureKind: parsed.data.captureKind,
        templateId: parsed.data.templateId ?? null,
        mime: parsed.data.mime,
        heldAt: parsed.data.heldAt ? new Date(parsed.data.heldAt) : undefined,
        durationMinutes: parsed.data.durationSeconds
          ? Math.max(1, Math.round(parsed.data.durationSeconds / 60))
          : null,
      },
      meta,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof CaptureError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: STATUS[err.code] },
      );
    }
    console.error("[api/sessions] capture failed", err);
    return NextResponse.json({ error: "Could not capture that session" }, { status: 500 });
  }
}
