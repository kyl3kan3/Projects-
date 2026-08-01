/**
 * Break start/stop for the open shift.
 *
 * A break is not a punch: it carries no location (the worker has not gone
 * anywhere the geofence cares about) and it never closes the shift. It only
 * moves unpaid seconds out of the total, which is why it lives here rather than
 * in the punch path.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { currentContext } from "@/lib/auth";
import { endBreak, openEntryFor, startBreak } from "@/lib/time-entries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({ action: z.enum(["start", "end"]) });

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  let action: "start" | "end";
  try {
    action = bodySchema.parse(await req.json()).action;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const open = await openEntryFor(ctx.user.id);
  if (!open) return Response.json({ error: "no_open_shift" }, { status: 409 });

  if (action === "start") {
    if (open.breakStartedAt) return Response.json({ ok: true, alreadyOnBreak: true });
    await startBreak(ctx.user.id);
  } else {
    if (!open.breakStartedAt) return Response.json({ ok: true, alreadyOff: true });
    await endBreak(ctx.user.id);
  }

  const updated = await openEntryFor(ctx.user.id);
  return Response.json(
    {
      ok: true,
      breakSeconds: updated?.breakSeconds ?? 0,
      onBreak: Boolean(updated?.breakStartedAt),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
