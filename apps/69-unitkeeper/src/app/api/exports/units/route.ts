/**
 * GET /api/exports/units?facility=…
 *
 * The whole yard as one row per unit: status as of now, tenant, rate, balance, days
 * late. "Everything CSV" from the README, and the file an owner hands their
 * bookkeeper.
 */

import type { NextRequest } from "next/server";
import { requireOwner } from "@/lib/auth";
import { csvMoney, csvResponse, toCsv } from "@/lib/csv";
import { isoDateOf } from "@/lib/money";
import { facilityFor, mapCards } from "@/lib/units";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const { owner } = await requireOwner();
  const facilityId = req.nextUrl.searchParams.get("facility") ?? "";
  const facility = await facilityFor(owner.id, facilityId);
  if (!facility) return new Response("Not found", { status: 404 });

  const asOf = isoDateOf(new Date());
  const cards = await mapCards(facility.id, asOf);
  const body = toCsv(
    [
      "unit",
      "size",
      "status",
      "street_rate",
      "tenant",
      "tenant_email",
      "agreed_rate",
      "started_on",
      "balance",
      "days_late",
      "gate_code_status",
      "lease_signed",
    ],
    cards.map((card) => [
      card.unit.label,
      card.unit.size,
      card.status,
      csvMoney(card.unit.monthlyRateCents),
      card.tenant?.name ?? "",
      card.tenant?.email ?? "",
      card.tenancy ? csvMoney(card.tenancy.rateCents) : "",
      card.tenancy?.startedOn ?? "",
      card.delinquency
        ? csvMoney(card.delinquency.outstandingCents - card.delinquency.creditCents)
        : "",
      card.delinquency?.daysLate ?? "",
      card.tenancy?.gateCodeStatus ?? "",
      card.tenancy?.signedAt ? card.tenancy.signedAt.toISOString().slice(0, 10) : "",
    ]),
  );
  return csvResponse(`units-${facility.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`, body);
}
