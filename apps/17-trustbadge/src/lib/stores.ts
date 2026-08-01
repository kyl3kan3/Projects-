/**
 * Stores: the storefront a merchant collects reviews for, its public widget key,
 * and its request/incentive settings.
 *
 * A store is created with one badge widget already in place. The free tier is the
 * distribution channel (README monetisation), and a merchant who signs up should
 * have something to paste before they have done anything at all.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { stores, type Platform, type Store } from "@/db/schema";
import { newPublicKey } from "@/lib/crypto";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createWidget } from "@/lib/widgets";

/** Strip a domain down to a bare host: no scheme, no path, no trailing dot. */
export function normalizeDomain(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return "";
  const withoutScheme = trimmed.replace(/^[a-z]+:\/\//, "");
  const host = withoutScheme.split("/")[0].split("?")[0].replace(/\.$/, "");
  return host;
}

export async function createDefaultStore(
  merchantId: string,
  args: { name: string; domain: string; platform: Platform; shopifyDomain?: string },
): Promise<Store> {
  const db = getDb();
  const name = args.name.trim() || "My store";
  const [store] = await db
    .insert(stores)
    .values({
      merchantId,
      name: name.slice(0, 80),
      domain: normalizeDomain(args.domain),
      platform: args.platform,
      publicKey: newPublicKey(),
      shopifyDomain: args.shopifyDomain ?? null,
    })
    .returning();

  // Every store starts with the one widget the Free tier includes.
  await createWidget({ storeId: store.id, tier: "free", type: "badge", name: "Footer badge" });
  return store;
}

export async function getStore(id: string, merchantId: string): Promise<Store> {
  const db = getDb();
  const [store] = await db
    .select()
    .from(stores)
    .where(and(eq(stores.id, id), eq(stores.merchantId, merchantId)));
  if (!store) throw new NotFoundError("That store does not exist");
  return store;
}

export async function storeByPublicKey(publicKey: string): Promise<Store | null> {
  if (!publicKey || publicKey.length > 64) return null;
  const db = getDb();
  const [store] = await db.select().from(stores).where(eq(stores.publicKey, publicKey));
  return store ?? null;
}

export interface StoreSettingsPatch {
  name?: string;
  domain?: string;
  requestDelayDays?: number;
  autoPublishMinRating?: number;
  requestsEnabled?: boolean;
  incentiveEnabled?: boolean;
  incentivePercent?: number;
  incentivePrefix?: string;
}

/**
 * Update the settings a merchant controls.
 *
 * `autoPublishMinRating` is validated to 1–5 and nothing else: there is no
 * option here that suppresses a *request* below a rating, because selectively
 * soliciting positive reviews is what the FTC's 2024 rule bans. The threshold
 * only decides whether a review skips the moderation queue.
 */
export async function updateStoreSettings(
  id: string,
  merchantId: string,
  patch: StoreSettingsPatch,
): Promise<void> {
  const store = await getStore(id, merchantId);
  const next: Partial<typeof stores.$inferInsert> = {};

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new ValidationError("Your store needs a name");
    next.name = name.slice(0, 80);
  }
  if (patch.domain !== undefined) next.domain = normalizeDomain(patch.domain);

  if (patch.requestDelayDays !== undefined) {
    const days = Math.round(patch.requestDelayDays);
    if (!Number.isFinite(days) || days < 0 || days > 90) {
      throw new ValidationError("The request delay must be between 0 and 90 days");
    }
    next.requestDelayDays = days;
  }

  if (patch.autoPublishMinRating !== undefined) {
    const rating = Math.round(patch.autoPublishMinRating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new ValidationError("The auto-publish threshold must be between 1 and 5 stars");
    }
    next.autoPublishMinRating = rating;
  }

  if (patch.requestsEnabled !== undefined) next.requestsEnabled = patch.requestsEnabled;
  if (patch.incentiveEnabled !== undefined) next.incentiveEnabled = patch.incentiveEnabled;

  if (patch.incentivePercent !== undefined) {
    const percent = Math.round(patch.incentivePercent);
    if (!Number.isFinite(percent) || percent < 1 || percent > 50) {
      throw new ValidationError("A discount incentive must be between 1% and 50%");
    }
    next.incentivePercent = percent;
  }

  if (patch.incentivePrefix !== undefined) {
    const prefix = patch.incentivePrefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (prefix.length < 3 || prefix.length > 12) {
      throw new ValidationError("The code prefix must be 3–12 letters or digits");
    }
    next.incentivePrefix = prefix;
  }

  if (!Object.keys(next).length) return;
  const db = getDb();
  await db.update(stores).set(next).where(eq(stores.id, store.id));
}

/** Rotate the widget key. Every embed must be updated, so it is never automatic. */
export async function rotatePublicKey(id: string, merchantId: string): Promise<string> {
  const store = await getStore(id, merchantId);
  const publicKey = newPublicKey();
  const db = getDb();
  await db.update(stores).set({ publicKey }).where(eq(stores.id, store.id));
  return publicKey;
}
