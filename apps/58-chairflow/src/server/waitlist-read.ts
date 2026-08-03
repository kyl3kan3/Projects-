/**
 * src/server/waitlist-read.ts
 *
 * The read behind the claim page, kept separate from `server/waitlist.ts` so that rendering an
 * offer cannot accidentally call the function that claims one.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  services,
  stylists,
  waitlistEntries,
  type Client,
  type Service,
  type Stylist,
} from "@/db/schema";
import { hashMatches } from "@/lib/tokens";
import type { OfferedSlotJson } from "@/server/waitlist";

export type OfferView =
  | {
      kind: "offered";
      stylist: Stylist;
      client: Client;
      service: Service;
      startsAt: Date;
      expiresAt: Date;
    }
  | { kind: "claimed"; stylist: Stylist; startsAt: Date };

export async function offeredEntry(
  entryId: string,
  tokenHash: string,
): Promise<OfferView | null> {
  const db = getDb();
  const [row] = await db
    .select({ entry: waitlistEntries, client: clients, service: services, stylist: stylists })
    .from(waitlistEntries)
    .innerJoin(clients, eq(clients.id, waitlistEntries.clientId))
    .innerJoin(services, eq(services.id, waitlistEntries.serviceId))
    .innerJoin(stylists, eq(stylists.id, waitlistEntries.stylistId))
    .where(eq(waitlistEntries.id, entryId));
  if (!row) return null;
  if (!hashMatches(row.entry.claimTokenHash, tokenHash)) return null;

  const slot = row.entry.offeredAppointmentSlot as OfferedSlotJson | null;
  if (!slot) return null;

  if (row.entry.status === "claimed") {
    return { kind: "claimed", stylist: row.stylist, startsAt: new Date(slot.startsAt) };
  }
  if (row.entry.status !== "offered" || !row.entry.offerExpiresAt) return null;

  return {
    kind: "offered",
    stylist: row.stylist,
    client: row.client,
    service: row.service,
    startsAt: new Date(slot.startsAt),
    expiresAt: row.entry.offerExpiresAt,
  };
}
