/**
 * src/lib/vendors.ts
 *
 * The vendor registry, its engagements, and CSV import.
 *
 * Import behaviour worth knowing: a row naming properties opens engagements
 * against them, creating the property if the org does not have it yet. That is the
 * whole point of importing — a vendor list with no exposure attached to it is a
 * contact list, and CertShield is not a contact list.
 */

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  engagements,
  properties,
  vendors,
  type Engagement,
  type Org,
  type Property,
  type Vendor,
} from "@/db/schema";
import { appendAudit } from "@/lib/audit";
import { parseVendorCsv, type VendorImportError } from "@/lib/csv";
import { vendorCap } from "@/lib/plans";
import { issueUploadToken } from "@/lib/tokens";

export interface VendorInput {
  name: string;
  trade?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  agentName?: string | null;
  agentEmail?: string | null;
  phone?: string | null;
  notes?: string | null;
  status?: Vendor["status"];
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function cleanEmail(value: string | null | undefined): string | null {
  const text = value?.trim().toLowerCase();
  if (!text) return null;
  if (!EMAIL.test(text)) throw new Error(`"${text}" is not a valid email address.`);
  return text;
}

export async function listVendors(orgId: string): Promise<Vendor[]> {
  const db = getDb();
  return db.select().from(vendors).where(eq(vendors.orgId, orgId)).orderBy(asc(vendors.name));
}

export async function countVendors(orgId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(vendors)
    .where(eq(vendors.orgId, orgId));
  return row?.n ?? 0;
}

export async function vendorById(orgId: string, id: string): Promise<Vendor | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(vendors)
    .where(and(eq(vendors.id, id), eq(vendors.orgId, orgId)));
  return row ?? null;
}

export async function createVendor(
  org: Org,
  actor: string,
  input: VendorInput,
): Promise<Vendor> {
  const name = input.name.trim();
  if (!name) throw new Error("A vendor needs a name.");
  const cap = vendorCap(org.plan, await countVendors(org.id));
  if (cap.reached) {
    throw new Error(
      `The ${org.plan} plan holds ${cap.limit} vendors and you have ${cap.used}. Upgrade to add more — nothing already on file is affected.`,
    );
  }
  const db = getDb();
  const [row] = await db
    .insert(vendors)
    .values({
      orgId: org.id,
      name,
      trade: input.trade?.trim() || null,
      contactName: input.contactName?.trim() || null,
      contactEmail: cleanEmail(input.contactEmail),
      agentName: input.agentName?.trim() || null,
      agentEmail: cleanEmail(input.agentEmail),
      phone: input.phone?.trim() || null,
      notes: input.notes?.trim() || null,
      status: input.status ?? "active",
    })
    .returning();
  await issueUploadToken(row.id);
  await appendAudit({
    orgId: org.id,
    actor,
    action: "vendor.created",
    target: row.name,
    metadata: { vendorId: row.id, trade: row.trade },
  });
  return row;
}

export async function updateVendor(
  org: Org,
  actor: string,
  vendorId: string,
  input: VendorInput,
): Promise<Vendor> {
  const db = getDb();
  const [row] = await db
    .update(vendors)
    .set({
      name: input.name.trim(),
      trade: input.trade?.trim() || null,
      contactName: input.contactName?.trim() || null,
      contactEmail: cleanEmail(input.contactEmail),
      agentName: input.agentName?.trim() || null,
      agentEmail: cleanEmail(input.agentEmail),
      phone: input.phone?.trim() || null,
      notes: input.notes?.trim() || null,
      status: input.status ?? "active",
      updatedAt: new Date(),
    })
    .where(and(eq(vendors.id, vendorId), eq(vendors.orgId, org.id)))
    .returning();
  if (!row) throw new Error("That vendor is not in your registry.");
  await appendAudit({
    orgId: org.id,
    actor,
    action: "vendor.updated",
    target: row.name,
    metadata: { vendorId: row.id },
  });
  return row;
}

/** Who a chase goes to: the vendor's contact and their agent, de-duplicated. */
export function chaseRecipients(vendor: Vendor): string[] {
  return [...new Set([vendor.contactEmail, vendor.agentEmail].filter((e): e is string => !!e))];
}

/* -------------------------------------------------------------- properties */

export async function listProperties(orgId: string): Promise<Property[]> {
  const db = getDb();
  return db
    .select()
    .from(properties)
    .where(eq(properties.orgId, orgId))
    .orderBy(asc(properties.name));
}

export async function propertyById(orgId: string, id: string): Promise<Property | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.orgId, orgId)));
  return row ?? null;
}

export async function createProperty(
  org: Org,
  actor: string,
  input: { name: string; kind?: Property["kind"]; address?: string | null },
): Promise<Property> {
  const name = input.name.trim();
  if (!name) throw new Error("A property needs a name.");
  const db = getDb();
  const [row] = await db
    .insert(properties)
    .values({
      orgId: org.id,
      name,
      kind: input.kind ?? (org.kind === "gc" ? "project" : "property"),
      address: input.address?.trim() || null,
    })
    .returning();
  await appendAudit({
    orgId: org.id,
    actor,
    action: "property.created",
    target: row.name,
    metadata: { propertyId: row.id, kind: row.kind },
  });
  return row;
}

/** Find a property by name (case-insensitive), or create it. Used by CSV import. */
async function findOrCreateProperty(org: Org, actor: string, name: string): Promise<Property> {
  const existing = (await listProperties(org.id)).find(
    (p) => p.name.toLowerCase() === name.trim().toLowerCase(),
  );
  return existing ?? createProperty(org, actor, { name });
}

/* ------------------------------------------------------------- engagements */

export async function createEngagement(
  org: Org,
  actor: string,
  input: {
    vendorId: string;
    propertyId: string;
    requirementTemplateId: string;
    startsOn?: string | null;
  },
): Promise<Engagement | null> {
  const db = getDb();
  const [row] = await db
    .insert(engagements)
    .values({
      vendorId: input.vendorId,
      propertyId: input.propertyId,
      requirementTemplateId: input.requirementTemplateId,
      startsOn: input.startsOn ?? null,
      status: "active",
    })
    // One engagement per (vendor, property): re-adding the same pair reactivates it
    // rather than creating a second verdict for the same exposure.
    .onConflictDoUpdate({
      target: [engagements.vendorId, engagements.propertyId],
      set: {
        requirementTemplateId: input.requirementTemplateId,
        status: "active",
        endsOn: null,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (row) {
    await appendAudit({
      orgId: org.id,
      actor,
      action: "engagement.created",
      target: `${input.vendorId} @ ${input.propertyId}`,
      metadata: { engagementId: row.id },
    });
  }
  return row ?? null;
}

export async function endEngagement(org: Org, actor: string, engagementId: string): Promise<void> {
  const db = getDb();
  const [row] = await db
    .update(engagements)
    .set({ status: "ended", endsOn: new Date().toISOString().slice(0, 10), updatedAt: new Date() })
    .where(eq(engagements.id, engagementId))
    .returning();
  if (row) {
    await appendAudit({
      orgId: org.id,
      actor,
      action: "engagement.ended",
      target: engagementId,
      metadata: {},
    });
  }
}

export async function engagementsForVendor(vendorId: string): Promise<Engagement[]> {
  const db = getDb();
  return db.select().from(engagements).where(eq(engagements.vendorId, vendorId));
}

/* ------------------------------------------------------------------ import */

export interface ImportSummary {
  created: number;
  updated: number;
  engagements: number;
  propertiesCreated: number;
  skipped: number;
  errors: VendorImportError[];
  ignoredColumns: string[];
}

/**
 * Import a vendor CSV. Partial success by design: good rows land, bad rows are
 * reported by line number, and the plan cap stops the import at the limit with a
 * sentence naming how many did not fit.
 */
export async function importVendorsCsv(
  org: Org,
  actor: string,
  text: string,
  defaultTemplateId: string,
): Promise<ImportSummary> {
  const parsed = parseVendorCsv(text);
  const summary: ImportSummary = {
    created: 0,
    updated: 0,
    engagements: 0,
    propertiesCreated: 0,
    skipped: 0,
    errors: [...parsed.errors],
    ignoredColumns: parsed.ignoredColumns,
  };
  if (!parsed.rows.length) return summary;

  const db = getDb();
  const existing = await listVendors(org.id);
  const byName = new Map(existing.map((v) => [v.name.toLowerCase(), v]));
  const propertiesBefore = (await listProperties(org.id)).length;
  let used = existing.length;
  const cap = vendorCap(org.plan, used);

  for (const row of parsed.rows) {
    const prior = byName.get(row.name.toLowerCase());
    let vendor: Vendor;

    if (prior) {
      const [updated] = await db
        .update(vendors)
        .set({
          trade: row.trade ?? prior.trade,
          contactName: row.contactName ?? prior.contactName,
          contactEmail: row.contactEmail ?? prior.contactEmail,
          agentName: row.agentName ?? prior.agentName,
          agentEmail: row.agentEmail ?? prior.agentEmail,
          phone: row.phone ?? prior.phone,
          notes: row.notes ?? prior.notes,
          updatedAt: new Date(),
        })
        .where(eq(vendors.id, prior.id))
        .returning();
      vendor = updated;
      summary.updated += 1;
    } else {
      if (cap.limit != null && used >= cap.limit) {
        summary.skipped += 1;
        continue;
      }
      const [created] = await db
        .insert(vendors)
        .values({
          orgId: org.id,
          name: row.name,
          trade: row.trade,
          contactName: row.contactName,
          contactEmail: row.contactEmail,
          agentName: row.agentName,
          agentEmail: row.agentEmail,
          phone: row.phone,
          notes: row.notes,
        })
        .returning();
      await issueUploadToken(created.id);
      vendor = created;
      byName.set(row.name.toLowerCase(), created);
      summary.created += 1;
      used += 1;
    }

    for (const propertyName of row.properties) {
      const property = await findOrCreateProperty(org, actor, propertyName);
      const [engagement] = await db
        .insert(engagements)
        .values({
          vendorId: vendor.id,
          propertyId: property.id,
          requirementTemplateId: defaultTemplateId,
          status: "active",
        })
        .onConflictDoNothing({ target: [engagements.vendorId, engagements.propertyId] })
        .returning();
      if (engagement) summary.engagements += 1;
    }
  }

  summary.propertiesCreated = (await listProperties(org.id)).length - propertiesBefore;

  if (summary.skipped) {
    summary.errors.push({
      line: 0,
      message: `${summary.skipped} vendor${summary.skipped === 1 ? "" : "s"} did not fit: the ${org.plan} plan holds ${cap.limit}. Everything already on file is untouched.`,
    });
  }

  await appendAudit({
    orgId: org.id,
    actor,
    action: "vendor.imported",
    target: `${summary.created} added, ${summary.updated} updated`,
    metadata: { ...summary, errors: summary.errors.length },
  });
  return summary;
}

/** Vendors with no engagement yet — the "not tracked anywhere" list. */
export async function vendorsWithoutEngagements(orgId: string): Promise<Vendor[]> {
  const all = await listVendors(orgId);
  if (!all.length) return [];
  const db = getDb();
  const rows = await db
    .select({ vendorId: engagements.vendorId })
    .from(engagements)
    .where(
      and(
        inArray(
          engagements.vendorId,
          all.map((v) => v.id),
        ),
        eq(engagements.status, "active"),
      ),
    );
  const engaged = new Set(rows.map((r) => r.vendorId));
  return all.filter((v) => !engaged.has(v.id));
}
