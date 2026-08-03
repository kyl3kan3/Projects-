/**
 * GET /api/exports/ledger/{tenancyId}
 *
 * One tenancy's ledger, every row, with the running balance recomputed rather than
 * read from the cached column — the export is the thing a bookkeeper reconciles
 * against, so it must be derived the same way the screen is.
 */

import { requireOwner } from "@/lib/auth";
import { csvMoney, csvResponse, toCsv } from "@/lib/csv";
import { kindLabel } from "@/lib/ledger-core";
import { runningRowsFor } from "@/lib/ledger";
import { ownedTenancy } from "@/lib/tenancy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tenancyId: string }> },
): Promise<Response> {
  const { owner } = await requireOwner();
  const { tenancyId } = await params;
  const ctx = await ownedTenancy(owner.id, tenancyId);
  if (!ctx) return new Response("Not found", { status: 404 });

  const rows = await runningRowsFor(tenancyId);
  const body = toCsv(
    ["date", "kind", "description", "amount", "balance", "period", "unit", "tenant"],
    rows.map(({ entry, balanceAfterCents }) => [
      entry.occurredOn,
      kindLabel(entry.kind),
      entry.description,
      csvMoney(entry.amountCents),
      csvMoney(balanceAfterCents),
      entry.period ?? "",
      ctx.unit.label,
      ctx.tenant.name,
    ]),
  );
  return csvResponse(`ledger-${ctx.unit.label}.csv`, body);
}
