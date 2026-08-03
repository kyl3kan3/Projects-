/**
 * GET /api/hooks/compliance — the hold-harmless awareness hook (README MVP item 8).
 *
 * A read-only feed the PM system reads before it raises a work order: one row per
 * vendor, whether they are blocked, and — the part that matters — the named reason.
 * A work-order screen that says "non-compliant" with no reason sends the coordinator
 * back into CertShield to find out why; this feed carries the sentence.
 *
 * Authenticated by the org's hook key (`?key=` or a bearer header), not by a session:
 * the caller is a server, not a person. The key is rotatable from settings, and the
 * feed is read-only — it can never change a verdict.
 *
 * `?format=csv` for the PM systems whose integration story is a nightly file.
 */

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { orgs } from "@/db/schema";
import { blocksWork, STATUS_LABEL } from "@/lib/compliance";
import { toCsv } from "@/lib/csv";
import { formatDate } from "@/lib/dates";
import { planFor } from "@/lib/plans";
import { engagementViews, orgToday } from "@/lib/verdicts";

export const dynamic = "force-dynamic";

function readKey(req: Request): string | null {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("key");
  if (fromQuery) return fromQuery;
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  return null;
}

export async function GET(req: Request): Promise<Response> {
  const key = readKey(req);
  if (!key || key.length < 16) {
    return NextResponse.json({ error: "A hook key is required." }, { status: 401 });
  }

  // The key lives in the org's settings jsonb, matched in SQL rather than by
  // scanning every org in the database.
  const db = getDb();
  const [org] = await db
    .select()
    .from(orgs)
    .where(sql`${orgs.settings} ->> 'hookKey' = ${key}`)
    .limit(1);
  if (!org) return NextResponse.json({ error: "That key is not recognised." }, { status: 401 });
  if (!planFor(org.plan).hooks) {
    return NextResponse.json(
      { error: "The compliance hook is available on the Portfolio and Enterprise plans." },
      { status: 402 },
    );
  }

  const views = await engagementViews(org);
  const url = new URL(req.url);
  const propertyFilter = url.searchParams.get("property");
  const filtered = propertyFilter
    ? views.filter(
        (v) =>
          v.property.id === propertyFilter ||
          v.property.name.toLowerCase() === propertyFilter.toLowerCase(),
      )
    : views;

  const rows = filtered.map((view) => ({
    vendor: view.vendor.name,
    vendorId: view.vendor.id,
    trade: view.vendor.trade,
    property: view.property.name,
    propertyId: view.property.id,
    requirement: view.template.name,
    status: view.verdict.status,
    statusLabel: STATUS_LABEL[view.verdict.status],
    holdWorkOrders: blocksWork(view.verdict.status),
    coverageThrough: view.verdict.soonestExpiry,
    daysToExpiry: view.verdict.daysToExpiry,
    reasons: view.verdict.deficiencies.map((d) => d.reason),
    certificateSha256: view.certificate?.sha256 ?? null,
  }));

  if (url.searchParams.get("format") === "csv") {
    const csv = toCsv([
      [
        "Vendor",
        "Trade",
        "Property",
        "Requirement",
        "Verdict",
        "Hold work orders",
        "Coverage through",
        "Days to expiry",
        "Reasons",
      ],
      ...rows.map((row) => [
        row.vendor,
        row.trade ?? "",
        row.property,
        row.requirement,
        row.statusLabel,
        row.holdWorkOrders ? "yes" : "no",
        row.coverageThrough ? formatDate(row.coverageThrough) : "",
        row.daysToExpiry ?? "",
        row.reasons.join(" "),
      ]),
    ]);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="compliance-${orgToday(org)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json(
    {
      org: org.name,
      asOf: orgToday(org),
      timezone: org.timezone,
      count: rows.length,
      blocked: rows.filter((r) => r.holdWorkOrders).length,
      engagements: rows,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
