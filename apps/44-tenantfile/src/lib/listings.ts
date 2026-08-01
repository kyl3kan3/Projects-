/**
 * Listings — the hosted page per vacancy and the link a landlord pastes into
 * Zillow, Craigslist or a Facebook group.
 *
 * The slug deliberately does not contain the street address. A landlord chooses
 * what to show on the page; the URL should not leak more than they chose, and it
 * lives on forever in somebody's Marketplace post.
 */

import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  applications,
  listings,
  properties,
  units,
  type Listing,
  type ListingRequirements,
  type Property,
  type Unit,
} from "@/db/schema";
import { urlForKey } from "@/lib/storage";
import { formatMoney } from "@/lib/money";
import { audit } from "@/lib/audit";

export const listingInput = z.object({
  headline: z.string().trim().min(8, "Give the listing a headline of at least 8 characters").max(120),
  description: z.string().trim().max(4000).default(""),
  minIncomeMultiple: z.coerce.number().min(0).max(10).default(3),
  depositCents: z.coerce.number().int().min(0).max(100_000_00),
  petsAllowed: z.coerce.boolean().default(false),
  smokingAllowed: z.coerce.boolean().default(false),
  availableOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an availability date"),
  leaseMonths: z.coerce.number().int().min(1).max(36).default(12),
});

export type ListingInput = z.infer<typeof listingInput>;

/** `2b-maple-7f3a` — readable, unique, and it gives away nothing. */
async function uniqueSlug(unitLabel: string, city: string): Promise<string> {
  const root =
    `${unitLabel} ${city}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 28) || "unit";
  const db = getDb();
  for (let attempt = 0; attempt < 20; attempt++) {
    const slug = `${root}-${randomBytes(2).toString("hex")}`;
    const [clash] = await db.select({ id: listings.id }).from(listings).where(eq(listings.slug, slug));
    if (!clash) return slug;
  }
  return `${root}-${randomBytes(6).toString("hex")}`;
}

export async function createListing(
  landlordId: string,
  unitId: string,
  input: ListingInput,
  photoKeys: string[],
  actor: string,
): Promise<Listing> {
  const db = getDb();
  const [owned] = await db
    .select({ unit: units, property: properties })
    .from(units)
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(and(eq(units.id, unitId), eq(properties.landlordId, landlordId)));
  if (!owned) throw new Error("No such unit");

  const requirements: ListingRequirements = {
    minIncomeMultiple: input.minIncomeMultiple,
    depositCents: input.depositCents,
    petsAllowed: input.petsAllowed,
    smokingAllowed: input.smokingAllowed,
    availableOn: input.availableOn,
    leaseMonths: input.leaseMonths,
  };

  const [listing] = await db
    .insert(listings)
    .values({
      unitId,
      slug: await uniqueSlug(owned.unit.label, owned.property.city),
      headline: input.headline,
      description: input.description,
      photoKeys,
      requirements,
      status: "live",
    })
    .returning();

  await db.update(units).set({ status: "listed" }).where(eq(units.id, unitId));
  await audit(landlordId, actor, "listing.create", listing.id, { slug: listing.slug });
  return listing;
}

export async function updateListing(
  landlordId: string,
  listingId: string,
  input: ListingInput,
  photoKeys: string[],
): Promise<void> {
  const db = getDb();
  const owned = await landlordListing(landlordId, listingId);
  if (!owned) throw new Error("No such listing");
  await db
    .update(listings)
    .set({
      headline: input.headline,
      description: input.description,
      photoKeys,
      requirements: {
        minIncomeMultiple: input.minIncomeMultiple,
        depositCents: input.depositCents,
        petsAllowed: input.petsAllowed,
        smokingAllowed: input.smokingAllowed,
        availableOn: input.availableOn,
        leaseMonths: input.leaseMonths,
      },
    })
    .where(eq(listings.id, listingId));
}

/** Closing a listing takes the page down and stops new applications arriving. */
export async function closeListing(landlordId: string, listingId: string, actor: string): Promise<void> {
  const db = getDb();
  const owned = await landlordListing(landlordId, listingId);
  if (!owned) throw new Error("No such listing");
  await db.update(listings).set({ status: "closed" }).where(eq(listings.id, listingId));
  const [tenancyCount] = await db.execute<{ n: string }>(sql`
    select count(*) as n from tenancies where unit_id = ${owned.unit.id} and status = 'active'
  `);
  if (Number(tenancyCount?.n ?? 0) === 0) {
    await db.update(units).set({ status: "vacant" }).where(eq(units.id, owned.unit.id));
  }
  await audit(landlordId, actor, "listing.close", listingId);
}

export interface OwnedListing {
  listing: Listing;
  unit: Unit;
  property: Property;
}

export async function landlordListing(landlordId: string, listingId: string): Promise<OwnedListing | null> {
  const db = getDb();
  const [row] = await db
    .select({ listing: listings, unit: units, property: properties })
    .from(listings)
    .innerJoin(units, eq(units.id, listings.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(and(eq(listings.id, listingId), eq(properties.landlordId, landlordId)));
  return row ?? null;
}

export async function landlordListings(landlordId: string) {
  const db = getDb();
  const rows = await db
    .select({ listing: listings, unit: units, property: properties })
    .from(listings)
    .innerJoin(units, eq(units.id, listings.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(eq(properties.landlordId, landlordId))
    .orderBy(desc(listings.createdAt));

  const counts = await db
    .select({ listingId: applications.listingId, id: applications.id })
    .from(applications);
  const byListing = new Map<string, number>();
  for (const c of counts) byListing.set(c.listingId, (byListing.get(c.listingId) ?? 0) + 1);

  return rows.map((r) => ({ ...r, applicationCount: byListing.get(r.listing.id) ?? 0 }));
}

/* --------------------------------------------------------- the public page --- */

export interface PublicListing {
  slug: string;
  headline: string;
  description: string;
  rentCents: number;
  rentLabel: string;
  beds: number;
  baths: number;
  sqft: number | null;
  unitLabel: string;
  city: string;
  state: string;
  landlordName: string;
  photoUrls: string[];
  requirements: ListingRequirements;
  closed: boolean;
}

export async function getPublicListing(slug: string): Promise<PublicListing | null> {
  const db = getDb();
  const [row] = await db
    .select({
      listing: listings,
      unit: units,
      property: properties,
      landlordName: sql<string>`(select name from landlords where id = ${properties.landlordId})`,
    })
    .from(listings)
    .innerJoin(units, eq(units.id, listings.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(eq(listings.slug, slug));
  if (!row) return null;

  return {
    slug: row.listing.slug,
    headline: row.listing.headline,
    description: row.listing.description,
    rentCents: row.unit.rentCents,
    rentLabel: formatMoney(row.unit.rentCents),
    beds: row.unit.beds,
    baths: row.unit.baths,
    sqft: row.unit.sqft,
    unitLabel: row.unit.label,
    city: row.property.city,
    state: row.property.state,
    landlordName: row.landlordName,
    photoUrls: row.listing.photoKeys.map(urlForKey),
    requirements: row.listing.requirements,
    closed: row.listing.status !== "live",
  };
}

export async function listingBySlug(slug: string) {
  const db = getDb();
  const [row] = await db
    .select({ listing: listings, unit: units, property: properties })
    .from(listings)
    .innerJoin(units, eq(units.id, listings.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(eq(listings.slug, slug));
  return row ?? null;
}

export async function listingsForUnit(unitId: string) {
  return getDb().select().from(listings).where(eq(listings.unitId, unitId)).orderBy(asc(listings.createdAt));
}
