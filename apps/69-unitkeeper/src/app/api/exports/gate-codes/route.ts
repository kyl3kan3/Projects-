/**
 * GET /api/exports/gate-codes?facility=…
 *
 * The keypad handoff. UnitKeeper has **no gate-hardware integration in v1** — this
 * CSV is the honest substitute, in the column order the common keypad importers
 * expect: unit, name, code, enabled. An overlocked tenancy exports with enabled=0,
 * which is the whole point of tracking the state.
 */

import type { NextRequest } from "next/server";
import { requireOwner } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { facilityOwnedBy, gateRowsFor } from "@/lib/gate";
import { canExportGateCodes } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const { owner, ent } = await requireOwner();
  const gate = canExportGateCodes(ent);
  if (!gate.allowed) return new Response(gate.reason ?? "Not on your plan", { status: 402 });

  const facilityId = req.nextUrl.searchParams.get("facility") ?? "";
  if (!(await facilityOwnedBy(owner.id, facilityId))) {
    return new Response("Not found", { status: 404 });
  }

  const rows = await gateRowsFor(facilityId);
  const body = toCsv(
    ["unit", "name", "code", "status", "enabled"],
    rows.map((r) => [r.unitLabel, r.tenantName, r.code, r.status, r.enabled]),
  );
  return csvResponse(`gate-codes-${facilityId.slice(0, 8)}.csv`, body);
}
