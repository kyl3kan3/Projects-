/**
 * The tax-season export. Every invoice, one row each, amounts as plain decimals
 * with the currency in its own column — a spreadsheet, not a report.
 *
 * It is a route rather than a server action because the answer is a file, and it
 * is under the (app) group so the middleware session gate covers it.
 */

import { currentUser } from "@/lib/auth";
import { incomeCsv, incomeSummary, refreshOverdue } from "@/lib/invoices";
import { plan } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const user = await currentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  if (!plan(user.plan).csvExport) return new Response("Not on your plan", { status: 402 });

  const now = new Date();
  await refreshOverdue(user.id, now);
  const summary = await incomeSummary(user.id, now);
  const csv = incomeCsv(summary);
  const filename = `papertrail-income-${now.toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
