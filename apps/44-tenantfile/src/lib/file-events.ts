/**
 * The File's append path and its reads.
 *
 * Split out from files.ts (which renders the PDF) so that the ledger, leases,
 * screening and maintenance modules can all append events without importing the
 * exporter — which imports the ledger. One direction only: everything depends on
 * this, this depends on nothing but the database.
 *
 * Nothing here updates or deletes an event. `dedupeKey` is what makes a replayed
 * job safe: a cron tick that runs twice, a Stripe webhook delivered three times,
 * a reminder retried after a timeout — each passes the same key and the second
 * write is dropped by a unique index rather than by a race-prone existence check.
 */

import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { fileEvents, properties, tenancies, units, type FileEvent, type FileEventKind } from "@/db/schema";

export interface StitchInput {
  tenancyId: string;
  kind: FileEventKind;
  summary: string;
  occurredAt?: Date;
  refId?: string | null;
  detail?: string;
  amountCents?: number | null;
  /** Pass one for anything a retry could produce twice. */
  dedupeKey?: string;
}

/**
 * Append one event. Returns the row, or null when an identical event was already
 * on file (a replay). Never throws on a duplicate — most callers are jobs.
 */
export async function stitch(input: StitchInput): Promise<FileEvent | null> {
  const rows = await getDb()
    .insert(fileEvents)
    .values({
      tenancyId: input.tenancyId,
      kind: input.kind,
      refId: input.refId ?? null,
      occurredAt: input.occurredAt ?? new Date(),
      summary: input.summary,
      detail: input.detail ?? "",
      amountCents: input.amountCents ?? null,
      dedupeKey: input.dedupeKey ?? null,
    })
    .onConflictDoNothing()
    .returning();
  return rows[0] ?? null;
}

/** The tenancy timeline, newest first (the mobile order in DESIGN.md). */
export async function getTimeline(tenancyId: string, limit = 200): Promise<FileEvent[]> {
  return getDb()
    .select()
    .from(fileEvents)
    .where(eq(fileEvents.tenancyId, tenancyId))
    .orderBy(desc(fileEvents.occurredAt), desc(fileEvents.createdAt))
    .limit(limit);
}

export interface FeedRow {
  event: FileEvent;
  unitLabel: string;
  address: string;
  tenancyId: string;
}

/** The portfolio-wide feed: the right rail at ≥1024px, and the File tab on phones. */
export async function getPortfolioFeed(landlordId: string, limit = 40): Promise<FeedRow[]> {
  const db = getDb();
  const scoped = await db
    .select({ tenancyId: tenancies.id, unitLabel: units.label, address: properties.address })
    .from(tenancies)
    .innerJoin(units, eq(units.id, tenancies.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(eq(properties.landlordId, landlordId));
  if (scoped.length === 0) return [];

  const byTenancy = new Map(scoped.map((s) => [s.tenancyId, s]));
  const events = await db
    .select()
    .from(fileEvents)
    .where(inArray(fileEvents.tenancyId, [...byTenancy.keys()]))
    .orderBy(desc(fileEvents.occurredAt))
    .limit(limit);

  return events.map((event) => ({
    event,
    tenancyId: event.tenancyId,
    unitLabel: byTenancy.get(event.tenancyId)!.unitLabel,
    address: byTenancy.get(event.tenancyId)!.address,
  }));
}
