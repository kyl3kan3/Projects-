/**
 * Install and uninstall: linking a Shopify shop to a merchant account, seeding
 * suppliers, and cleanly deactivating on `app/uninstalled`.
 *
 * The reinstall case is the one that has to be right. A merchant uninstalls, thinks
 * better of it a week later, and reinstalls — they must land back on their own
 * suppliers, lead times, MOQs and 90 days of history, not a blank account. So the
 * shop domain is the identity, and a reinstall clears `uninstalled_at` and stores
 * the fresh token rather than inserting a second shop.
 */

import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  merchants,
  shops,
  suppliers,
  variants,
  type Shop,
  type ShopSettings,
} from "@/db/schema";
import { setSessionCookie } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { trialEndFrom } from "@/lib/billing";
import { DEMO_SUPPLIERS, demoDomainFor, demoShopInfo, demoVariantSpecs } from "@/lib/demo-data";
import { DEFAULT_SETTINGS } from "@/lib/settings";

export interface LinkShopArgs {
  shop: string;
  accessToken: string;
  scope: string;
  shopName?: string | null;
  shopEmail?: string | null;
  timezone?: string | null;
  currency?: string | null;
  /** When set, the shop is attached to this merchant rather than matched by email. */
  merchantId?: string | null;
}

export interface LinkShopResult {
  shop: Shop;
  merchantId: string;
  created: boolean;
  reinstalled: boolean;
}

export async function linkShop(args: LinkShopArgs): Promise<LinkShopResult> {
  const db = getDb();
  const domain = args.shop.toLowerCase();

  const [existing] = await db.select().from(shops).where(eq(shops.shopifyDomain, domain)).limit(1);
  if (existing) {
    const [updated] = await db
      .update(shops)
      .set({
        accessToken: encryptSecret(args.accessToken),
        shopifyScopes: args.scope,
        name: args.shopName ?? existing.name,
        email: args.shopEmail ?? existing.email,
        timezone: args.timezone ?? existing.timezone,
        currency: args.currency ?? existing.currency,
        uninstalledAt: null,
        // A reinstall restarts the trial clock only if they never had one.
        trialEndsAt: existing.trialEndsAt ?? trialEndFrom(),
        updatedAt: new Date(),
      })
      .where(eq(shops.id, existing.id))
      .returning();
    return {
      shop: updated,
      merchantId: updated.merchantId,
      created: false,
      reinstalled: existing.uninstalledAt !== null,
    };
  }

  let merchantId = args.merchantId ?? null;
  const email = (args.shopEmail ?? "").trim().toLowerCase();

  if (!merchantId && email) {
    const [merchant] = await db.select().from(merchants).where(eq(merchants.email, email)).limit(1);
    merchantId = merchant?.id ?? null;
  }

  if (!merchantId) {
    // No account yet: create one with a password hash that cannot ever match, so
    // the only way in is the Shopify install until they set a password.
    const [merchant] = await db
      .insert(merchants)
      .values({
        email: email || `${domain}@shops.shelfsense.invalid`,
        name: args.shopName ?? domain,
        passwordHash: "shopify-install-no-password",
      })
      .returning();
    merchantId = merchant.id;
  }

  const [created] = await db
    .insert(shops)
    .values({
      merchantId,
      shopifyDomain: domain,
      name: args.shopName ?? domain.replace(".myshopify.com", ""),
      email: args.shopEmail ?? null,
      accessToken: encryptSecret(args.accessToken),
      shopifyScopes: args.scope,
      timezone: args.timezone ?? "UTC",
      currency: args.currency ?? "USD",
      // The trial is Backroom-level (see plans.entitlementsFor) so the merchant
      // can actually draft a PO during it.
      plan: "counter",
      trialEndsAt: trialEndFrom(),
      settings: DEFAULT_SETTINGS as Partial<ShopSettings>,
    })
    .returning();

  return { shop: created, merchantId, created: true, reinstalled: false };
}

/**
 * `app/uninstalled`: the token is dead the moment they uninstall, so it is dropped
 * rather than kept. Everything else — history, suppliers, lead times — stays, both
 * because it is the merchant's and because a reinstall has to find it.
 *
 * Marking `uninstalled_at` is what stops all further work: backfills, recomputes
 * and digests all filter on it, so no job, email or API call happens afterwards.
 */
export async function markUninstalled(domain: string): Promise<void> {
  const db = getDb();
  await db
    .update(shops)
    .set({ uninstalledAt: new Date(), accessToken: null, updatedAt: new Date() })
    .where(eq(shops.shopifyDomain, domain.toLowerCase()));
}

/* ------------------------------------------------------------ demo store --- */

/**
 * Create (or reset) the labelled demo store for a merchant.
 *
 * This is the only way to see the product work in an environment with no Shopify
 * credentials, and it is not a shortcut around the real code path: it creates a
 * shop marked `is_demo`, which makes `adminFor` hand back `FakeShopifyAdmin`, and
 * then the ordinary backfill, velocity maths and forecast writer run against it
 * untouched. Every screen the merchant then sees is rendered from real rows.
 *
 * It is labelled everywhere it appears, and it can never be billed.
 */
export async function createDemoShop(merchantId: string): Promise<Shop> {
  const db = getDb();
  const info = demoShopInfo();
  const domain = demoDomainFor(merchantId);

  const [existing] = await db
    .select()
    .from(shops)
    .where(and(eq(shops.merchantId, merchantId), eq(shops.shopifyDomain, domain)))
    .limit(1);
  if (existing) return existing;

  const [shop] = await db
    .insert(shops)
    .values({
      merchantId,
      shopifyDomain: domain,
      name: info.name,
      email: info.email,
      accessToken: null,
      shopifyScopes: "read_products,read_inventory,read_orders",
      timezone: info.timezone,
      currency: info.currency,
      plan: "counter",
      trialEndsAt: trialEndFrom(),
      isDemo: true,
      settings: DEFAULT_SETTINGS as Partial<ShopSettings>,
    })
    .returning();

  await seedDemoSuppliers(shop);
  return shop;
}

/**
 * Suppliers and their lead times for the demo store.
 *
 * Assignments are applied after the catalogue lands (the backfill mirrors products
 * first), so this is called again at the end of the demo install — see
 * `applyDemoSupplierAssignments`.
 */
export async function seedDemoSuppliers(shop: Shop): Promise<void> {
  const db = getDb();
  for (const supplier of DEMO_SUPPLIERS) {
    await db
      .insert(suppliers)
      .values({
        shopId: shop.id,
        name: supplier.name,
        email: supplier.email,
        leadTimeDays: supplier.leadTimeDays,
        minOrderValueCents: supplier.minOrderValueCents,
        notes: supplier.notes,
      })
      .onConflictDoNothing({ target: [suppliers.shopId, suppliers.name] });
  }
}

/** Attach the demo suppliers, MOQs and pack sizes to the mirrored variants. */
export async function applyDemoSupplierAssignments(shop: Shop): Promise<number> {
  const db = getDb();
  const supplierRows = await db.select().from(suppliers).where(eq(suppliers.shopId, shop.id));
  const byName = new Map(supplierRows.map((s) => [s.name, s.id]));
  let updated = 0;

  for (const spec of demoVariantSpecs()) {
    const supplierName = DEMO_SUPPLIERS.find((s) => s.key === spec.supplierKey)?.name;
    const supplierId = supplierName ? byName.get(supplierName) : undefined;
    const result = await db
      .update(variants)
      .set({
        supplierId: supplierId ?? null,
        moq: spec.moq,
        packSize: spec.packSize,
        costCents: spec.costCents,
      })
      .where(and(eq(variants.shopId, shop.id), eq(variants.sku, spec.sku)))
      .returning({ id: variants.id });
    updated += result.length;
  }
  return updated;
}

/** Sign a merchant in after an install, so the redirect lands on a real screen. */
export async function signInMerchant(merchantId: string): Promise<void> {
  const db = getDb();
  const [merchant] = await db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (merchant) await setSessionCookie({ merchantId: merchant.id, email: merchant.email });
}

/** Shops a merchant can switch between. */
export async function shopsForMerchant(merchantId: string): Promise<Shop[]> {
  const db = getDb();
  return db
    .select()
    .from(shops)
    .where(and(eq(shops.merchantId, merchantId), isNull(shops.uninstalledAt)))
    .orderBy(shops.createdAt);
}
