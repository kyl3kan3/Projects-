/**
 * The tenant's page: everything reachable from the link in their rent reminder.
 *
 * The token is the only credential. That means one rule, absolutely: every read
 * and write here resolves the tenancy **by the token** and then works only from
 * what that row points at. Nothing accepts a tenancy id, a charge id, or a request
 * id from the client without checking it belongs to the tenancy the token opened.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  charges,
  landlords,
  maintenanceRequests,
  properties,
  tenancies,
  units,
  type Landlord,
  type MaintenanceRequest,
  type Tenancy,
} from "@/db/schema";
import { ledgerStrip, type Ledger, type StripCell } from "@/lib/ledger-core";
import { loadLedger } from "@/lib/ledger-read";
import { isoDateOf, type IsoDate } from "@/lib/money";

export interface PortalView {
  tenancy: Tenancy;
  landlord: Landlord;
  unitLabel: string;
  address: string;
  city: string;
  state: string;
  ledger: Ledger;
  strip: StripCell[];
  requests: MaintenanceRequest[];
  year: number;
}

export async function portalByToken(token: string, asOf: IsoDate = isoDateOf(new Date())): Promise<PortalView | null> {
  if (!token || token.length < 20) return null;
  const db = getDb();
  const [row] = await db
    .select({ tenancy: tenancies, unit: units, property: properties, landlord: landlords })
    .from(tenancies)
    .innerJoin(units, eq(units.id, tenancies.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .innerJoin(landlords, eq(landlords.id, properties.landlordId))
    .where(eq(tenancies.portalToken, token));
  if (!row) return null;

  const ledger = await loadLedger(row.tenancy.id, asOf);
  const year = Number(asOf.slice(0, 4));
  const requests = await db
    .select()
    .from(maintenanceRequests)
    .where(eq(maintenanceRequests.tenancyId, row.tenancy.id));

  return {
    tenancy: row.tenancy,
    landlord: row.landlord,
    unitLabel: row.unit.label,
    address: row.property.address,
    city: row.property.city,
    state: row.property.state,
    ledger,
    strip: ledgerStrip(ledger, year, asOf),
    requests: requests.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
    year,
  };
}

/** Confirm a charge belongs to the tenancy this token opened. */
export async function chargeBelongsToTenancy(tenancyId: string, chargeId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: charges.id })
    .from(charges)
    .where(and(eq(charges.id, chargeId), eq(charges.tenancyId, tenancyId)));
  return Boolean(row);
}

/** Confirm a request belongs to the tenancy this token opened. */
export async function requestBelongsToTenancy(tenancyId: string, requestId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: maintenanceRequests.id })
    .from(maintenanceRequests)
    .where(and(eq(maintenanceRequests.id, requestId), eq(maintenanceRequests.tenancyId, tenancyId)));
  return Boolean(row);
}

/** The landlord's own storage prefix, so a tenant's photo upload is scoped right. */
export async function landlordIdForTenancy(tenancyId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ landlordId: properties.landlordId })
    .from(tenancies)
    .innerJoin(units, eq(units.id, tenancies.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(eq(tenancies.id, tenancyId));
  return row?.landlordId ?? null;
}
