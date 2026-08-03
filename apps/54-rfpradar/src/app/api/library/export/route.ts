/**
 * GET /api/library/export
 *
 * Every block the firm owns, as JSON.
 *
 * Deliberately available in read-only mode — a lapsed trial and a failed payment
 * both keep this working. "Export everything, any time" is the promise that makes
 * a firm willing to centralise its proposal memory here in the first place, and a
 * promise that stops working during dunning is not one.
 */

import { currentContext } from "@/lib/auth";
import { exportLibrary } from "@/lib/library";
import { hasResponseWorkspace } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!hasResponseWorkspace(ctx.access.planId)) {
    return Response.json(
      { error: "The answer library is included on Pursuit and above." },
      { status: 403 },
    );
  }

  const { json, count } = await exportLibrary(ctx.firm.id);
  const slug = ctx.firm.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "firm";
  return new Response(json, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}-library-${count}-blocks.json"`,
      "cache-control": "no-store",
    },
  });
}
