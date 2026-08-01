/**
 * The board-turnover artifact: the whole roster, including past owners, as a CSV
 * any spreadsheet opens. This is what an outgoing secretary hands the next one.
 *
 * Live portal links are deliberately absent — exporting payment links into a file
 * that gets emailed around a board would be a security hole, not a convenience.
 */

import { currentContext } from "@/lib/auth";
import { rosterExportCsv } from "@/lib/roster";
import { can } from "@/lib/plans";
import { featureAllowed, planForFeature } from "@/lib/plans";
import { today } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return new Response("Sign in first", { status: 401 });
  if (!can(ctx.user.role, "roster")) {
    return new Response("Your role cannot export the roster", { status: 403 });
  }
  if (!featureAllowed(ctx.association.plan, "exports")) {
    return new Response(
      `Exports are part of the ${planForFeature("exports").name} plan. Upgrade in Settings and this link works immediately.`,
      { status: 402, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const csv = await rosterExportCsv(ctx.association.id);
  const slug = ctx.association.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}-roster-${today()}.csv"`,
      "cache-control": "no-store",
    },
  });
}
