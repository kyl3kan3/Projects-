/**
 * src/lib/listings.ts
 *
 * Listings and vacancies: the hosted listing page per unit and its
 * shareable slug (the link landlords paste into Zillow/Craigslist/FB
 * Marketplace posts).
 *
 * TODO:
 * - [ ] createListing(unitId, input): headline, description, requirements,
 *       photo keys; slug generation (unique, readable, no address leaks
 *       beyond what the landlord chose to show).
 * - [ ] publish/close lifecycle; closing a listing archives its pipeline.
 * - [ ] getPublicListing(slug): everything the /apply/[slug] page renders,
 *       with photo URLs resolved via storage.presignGet.
 * - [ ] OG image metadata for link sharing (unit photo + rent).
 * - [ ] Validation (zod) on all landlord-editable fields.
 */

export interface PublicListing {
  headline: string;
  rentCents: number;
  photoUrls: string[];
  requirements: Record<string, string>;
}

export function getPublicListing(_slug: string): Promise<PublicListing> {
  throw new Error("Not implemented");
}
