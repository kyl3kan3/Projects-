/**
 * Resolving a store's tier.
 *
 * The tier lives on the merchant, not the store, and the widget read path only
 * has a store. Its own tiny module so the public route does not have to import
 * the whole billing surface (and with it the Stripe SDK) to answer one question.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { merchants, type Store, type Tier } from "@/db/schema";

export async function tierForStore(store: Store): Promise<Tier> {
  const db = getDb();
  const [merchant] = await db
    .select({ tier: merchants.tier })
    .from(merchants)
    .where(eq(merchants.id, store.merchantId));
  return merchant?.tier ?? "free";
}
