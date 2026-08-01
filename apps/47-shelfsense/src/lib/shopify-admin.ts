/**
 * Everything that talks to Shopify over the network, behind one interface.
 *
 * There is no Shopify credential in this environment, so the live client below is
 * unexercised by any test — which is exactly why it is the *only* thing that is.
 * The interface has two implementations:
 *
 *  - `LiveShopifyAdmin` — GraphQL Admin API with cost-limit-aware backoff and
 *    REST for webhook registration. Runs against a real store.
 *  - `FakeShopifyAdmin` — a deterministic store built from lib/demo-data.ts.
 *    It answers the same calls with the same shapes, including pagination and a
 *    page size small enough that the backfill's cursor checkpointing is genuinely
 *    exercised rather than finished in one page.
 *
 * The seam matters because every bug in the backfill lives *around* the API call —
 * cursor handling, day bucketing, upserts, idempotency — and all of that is
 * testable against the fake.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { shops, type Plan, type Shop } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { demoOrdersSince, demoProducts, demoShopInfo } from "@/lib/demo-data";
import { env } from "@/lib/env";
import {
  SHOPIFY_API_VERSION,
  WEBHOOK_TOPICS,
  type ShopifyOrderPayload,
  type WebhookTopic,
} from "@/lib/shopify";
import { plan as planDef, TRIAL_DAYS } from "@/lib/plans";

export interface ShopInfo {
  shopifyShopId: string | null;
  name: string;
  email: string | null;
  timezone: string;
  currency: string;
}

export interface AdminVariant {
  shopifyVariantId: string;
  sku: string;
  title: string;
  priceCents: number;
  costCents: number | null;
  inventoryQuantity: number;
  tracked: boolean;
  inventoryItemId: string | null;
}

export interface AdminProduct {
  shopifyProductId: string;
  title: string;
  status: string;
  vendor: string | null;
  imageUrl: string | null;
  variants: AdminVariant[];
}

export interface OrdersPage {
  orders: ShopifyOrderPayload[];
  nextCursor: string | null;
  /** Best-effort total, for the onboarding progress line. Null when unknown. */
  estimatedTotal: number | null;
}

export interface ProductsPage {
  products: AdminProduct[];
  nextCursor: string | null;
}

export interface SubscriptionHandle {
  chargeId: string;
  confirmationUrl: string | null;
  status: string;
  planName: string;
}

export interface ShopifyAdmin {
  readonly shopDomain: string;
  readonly kind: "live" | "fake";
  fetchShopInfo(): Promise<ShopInfo>;
  listProducts(cursor: string | null): Promise<ProductsPage>;
  /** Orders created on or after `sinceDate` (yyyy-mm-dd), oldest first. */
  listOrders(sinceDate: string, cursor: string | null): Promise<OrdersPage>;
  registerWebhooks(address: string): Promise<{ topic: WebhookTopic; ok: boolean }[]>;
  createSubscription(plan: Plan, returnUrl: string, test: boolean): Promise<SubscriptionHandle>;
  currentSubscription(): Promise<SubscriptionHandle | null>;
  cancelSubscription(chargeId: string): Promise<boolean>;
}

/* ------------------------------------------------------------------ live --- */

/** `gid://shopify/ProductVariant/12345` -> `12345`. */
export function idFromGid(gid: string | null | undefined): string | null {
  if (!gid) return null;
  const tail = gid.split("/").pop();
  return tail && /^\d+$/.test(tail) ? tail : (gid || null);
}

interface GraphqlResult<T> {
  data?: T;
  errors?: { message: string }[];
  extensions?: {
    cost?: {
      throttleStatus?: { currentlyAvailable?: number; maximumAvailable?: number };
    };
  };
}

const ORDERS_PAGE_SIZE = 50;
const PRODUCTS_PAGE_SIZE = 50;

class LiveShopifyAdmin implements ShopifyAdmin {
  readonly kind = "live" as const;

  constructor(
    readonly shopDomain: string,
    private readonly accessToken: string,
  ) {}

  private async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    // Shopify's cost limiter refills at a fixed rate; a 429 or a nearly-empty
    // bucket is answered by waiting, not by hammering. Five attempts with
    // exponential backoff covers the worst documented refill wait.
    let lastError = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await fetch(
        `https://${this.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-shopify-access-token": this.accessToken,
          },
          body: JSON.stringify({ query, variables }),
        },
      );

      if (response.status === 429 || response.status >= 500) {
        lastError = `Shopify responded ${response.status}`;
        await sleep(1_000 * 2 ** attempt);
        continue;
      }
      if (!response.ok) {
        throw new Error(`Shopify Admin API error ${response.status}`);
      }

      const body = (await response.json()) as GraphqlResult<T>;
      if (body.errors?.length) {
        const throttled = body.errors.some((e) => /throttled/i.test(e.message));
        if (throttled) {
          lastError = body.errors.map((e) => e.message).join("; ");
          await sleep(1_000 * 2 ** attempt);
          continue;
        }
        throw new Error(`Shopify Admin API error: ${body.errors.map((e) => e.message).join("; ")}`);
      }
      if (!body.data) throw new Error("Shopify Admin API returned no data");

      // Pre-emptive backoff: if the bucket is nearly empty, the next call would
      // be throttled anyway, and a backfill of 90 days makes hundreds of calls.
      const status = body.extensions?.cost?.throttleStatus;
      if (
        status?.currentlyAvailable !== undefined &&
        status.maximumAvailable !== undefined &&
        status.currentlyAvailable < status.maximumAvailable * 0.15
      ) {
        await sleep(1_500);
      }
      return body.data;
    }
    throw new Error(`Shopify Admin API unavailable after retries: ${lastError}`);
  }

  async fetchShopInfo(): Promise<ShopInfo> {
    const data = await this.graphql<{
      shop: { id: string; name: string; email: string | null; ianaTimezone: string; currencyCode: string };
    }>(`query { shop { id name email ianaTimezone currencyCode } }`);
    return {
      shopifyShopId: idFromGid(data.shop.id),
      name: data.shop.name,
      email: data.shop.email,
      timezone: data.shop.ianaTimezone || "UTC",
      currency: data.shop.currencyCode || "USD",
    };
  }

  async listProducts(cursor: string | null): Promise<ProductsPage> {
    const data = await this.graphql<{
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: {
          id: string;
          title: string;
          status: string;
          vendor: string | null;
          featuredImage: { url: string } | null;
          variants: {
            nodes: {
              id: string;
              sku: string | null;
              title: string | null;
              price: string | null;
              inventoryQuantity: number | null;
              inventoryItem: {
                id: string;
                tracked: boolean;
                unitCost: { amount: string } | null;
              } | null;
            }[];
          };
        }[];
      };
    }>(
      `query($first: Int!, $after: String) {
        products(first: $first, after: $after, sortKey: ID) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id title status vendor
            featuredImage { url }
            variants(first: 100) {
              nodes {
                id sku title price inventoryQuantity
                inventoryItem { id tracked unitCost { amount } }
              }
            }
          }
        }
      }`,
      { first: PRODUCTS_PAGE_SIZE, after: cursor },
    );

    return {
      products: data.products.nodes.map((node) => ({
        shopifyProductId: idFromGid(node.id) ?? node.id,
        title: node.title,
        status: (node.status ?? "ACTIVE").toLowerCase(),
        vendor: node.vendor,
        imageUrl: node.featuredImage?.url ?? null,
        variants: node.variants.nodes.map((v) => ({
          shopifyVariantId: idFromGid(v.id) ?? v.id,
          sku: (v.sku ?? "").trim() || `VAR-${idFromGid(v.id) ?? v.id}`,
          title: v.title ?? "Default",
          priceCents: Math.round(Number(v.price ?? 0) * 100),
          costCents: v.inventoryItem?.unitCost
            ? Math.round(Number(v.inventoryItem.unitCost.amount) * 100)
            : null,
          inventoryQuantity: v.inventoryQuantity ?? 0,
          tracked: v.inventoryItem?.tracked ?? false,
          inventoryItemId: idFromGid(v.inventoryItem?.id),
        })),
      })),
      nextCursor: data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null,
    };
  }

  async listOrders(sinceDate: string, cursor: string | null): Promise<OrdersPage> {
    const data = await this.graphql<{
      orders: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: {
          id: string;
          name: string;
          createdAt: string;
          cancelledAt: string | null;
          test: boolean;
          lineItems: {
            nodes: {
              id: string;
              sku: string | null;
              title: string | null;
              quantity: number;
              variantTitle: string | null;
              variant: { id: string } | null;
              product: { id: string } | null;
              originalUnitPriceSet: { shopMoney: { amount: string } } | null;
            }[];
          };
          refunds: {
            refundLineItems: { nodes: { quantity: number; lineItem: { id: string } | null }[] };
          }[];
        }[];
      };
    }>(
      `query($first: Int!, $after: String, $query: String!) {
        orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id name createdAt cancelledAt test
            lineItems(first: 100) {
              nodes {
                id sku title quantity variantTitle
                variant { id }
                product { id }
                originalUnitPriceSet { shopMoney { amount } }
              }
            }
            refunds { refundLineItems(first: 100) { nodes { quantity lineItem { id } } } }
          }
        }
      }`,
      {
        first: ORDERS_PAGE_SIZE,
        after: cursor,
        query: `created_at:>=${sinceDate}`,
      },
    );

    const orders: ShopifyOrderPayload[] = data.orders.nodes.map((node) => ({
      id: idFromGid(node.id) ?? node.id,
      name: node.name,
      created_at: node.createdAt,
      cancelled_at: node.cancelledAt,
      test: node.test,
      line_items: node.lineItems.nodes.map((line) => ({
        id: idFromGid(line.id) ?? line.id,
        product_id: idFromGid(line.product?.id),
        variant_id: idFromGid(line.variant?.id),
        sku: line.sku,
        title: line.title,
        variant_title: line.variantTitle,
        quantity: line.quantity,
        price: line.originalUnitPriceSet?.shopMoney.amount ?? "0",
      })),
      refunds: node.refunds.map((refund) => ({
        refund_line_items: refund.refundLineItems.nodes.map((rli) => ({
          line_item_id: idFromGid(rli.lineItem?.id),
          quantity: rli.quantity,
        })),
      })),
    }));

    return {
      orders,
      nextCursor: data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null,
      estimatedTotal: null,
    };
  }

  async registerWebhooks(address: string): Promise<{ topic: WebhookTopic; ok: boolean }[]> {
    const results: { topic: WebhookTopic; ok: boolean }[] = [];
    for (const topic of WEBHOOK_TOPICS) {
      try {
        const response = await fetch(
          `https://${this.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-shopify-access-token": this.accessToken,
            },
            body: JSON.stringify({ webhook: { topic, address, format: "json" } }),
          },
        );
        // 422 here is almost always "already exists", which is success for us.
        results.push({ topic, ok: response.ok || response.status === 422 });
      } catch {
        results.push({ topic, ok: false });
      }
    }
    return results;
  }

  async createSubscription(
    plan: Plan,
    returnUrl: string,
    test: boolean,
  ): Promise<SubscriptionHandle> {
    const def = planDef(plan);
    const data = await this.graphql<{
      appSubscriptionCreate: {
        confirmationUrl: string | null;
        appSubscription: { id: string; status: string; name: string } | null;
        userErrors: { field: string[]; message: string }[];
      };
    }>(
      `mutation($name: String!, $returnUrl: URL!, $trialDays: Int!, $test: Boolean!, $amount: Decimal!) {
        appSubscriptionCreate(
          name: $name
          returnUrl: $returnUrl
          trialDays: $trialDays
          test: $test
          lineItems: [{
            plan: { appRecurringPricingDetails: { price: { amount: $amount, currencyCode: USD }, interval: EVERY_30_DAYS } }
          }]
        ) {
          confirmationUrl
          appSubscription { id status name }
          userErrors { field message }
        }
      }`,
      {
        name: `ShelfSense ${def.name}`,
        returnUrl,
        trialDays: TRIAL_DAYS,
        test,
        amount: (def.priceCents / 100).toFixed(2),
      },
    );

    const result = data.appSubscriptionCreate;
    if (result.userErrors?.length) {
      throw new Error(`Shopify Billing refused the subscription: ${result.userErrors[0].message}`);
    }
    if (!result.appSubscription) throw new Error("Shopify Billing returned no subscription");
    return {
      chargeId: idFromGid(result.appSubscription.id) ?? result.appSubscription.id,
      confirmationUrl: result.confirmationUrl,
      status: result.appSubscription.status,
      planName: result.appSubscription.name,
    };
  }

  async currentSubscription(): Promise<SubscriptionHandle | null> {
    const data = await this.graphql<{
      currentAppInstallation: {
        activeSubscriptions: { id: string; status: string; name: string }[];
      };
    }>(
      `query { currentAppInstallation { activeSubscriptions { id status name } } }`,
    );
    const active = data.currentAppInstallation?.activeSubscriptions?.[0];
    if (!active) return null;
    return {
      chargeId: idFromGid(active.id) ?? active.id,
      confirmationUrl: null,
      status: active.status,
      planName: active.name,
    };
  }

  async cancelSubscription(chargeId: string): Promise<boolean> {
    const data = await this.graphql<{
      appSubscriptionCancel: {
        appSubscription: { id: string; status: string } | null;
        userErrors: { message: string }[];
      };
    }>(
      `mutation($id: ID!) {
        appSubscriptionCancel(id: $id) {
          appSubscription { id status }
          userErrors { message }
        }
      }`,
      { id: `gid://shopify/AppSubscription/${chargeId}` },
    );
    return Boolean(data.appSubscriptionCancel?.appSubscription);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ fake --- */

/**
 * A deterministic Shopify store.
 *
 * Used by the tests and by the labelled demo store in the product, which means
 * "Load the demo store" runs the real backfill, the real velocity maths, and the
 * real forecast writer against generated order pages — the only code that is
 * skipped is the HTTP call itself.
 */
export class FakeShopifyAdmin implements ShopifyAdmin {
  readonly kind = "fake" as const;
  /** Small on purpose: the backfill's cursor logic must be exercised. */
  static readonly PAGE_SIZE = 40;

  constructor(
    readonly shopDomain: string,
    private readonly today: string,
  ) {}

  async fetchShopInfo(): Promise<ShopInfo> {
    return demoShopInfo();
  }

  async listProducts(cursor: string | null): Promise<ProductsPage> {
    const all = demoProducts();
    const start = cursor ? Number(cursor) : 0;
    const slice = all.slice(start, start + FakeShopifyAdmin.PAGE_SIZE);
    const next = start + slice.length;
    return { products: slice, nextCursor: next < all.length ? String(next) : null };
  }

  async listOrders(sinceDate: string, cursor: string | null): Promise<OrdersPage> {
    const all = demoOrdersSince(sinceDate, this.today);
    const start = cursor ? Number(cursor) : 0;
    const slice = all.slice(start, start + FakeShopifyAdmin.PAGE_SIZE);
    const next = start + slice.length;
    return {
      orders: slice,
      nextCursor: next < all.length ? String(next) : null,
      estimatedTotal: all.length,
    };
  }

  async registerWebhooks(): Promise<{ topic: WebhookTopic; ok: boolean }[]> {
    return WEBHOOK_TOPICS.map((topic) => ({ topic, ok: true }));
  }

  async createSubscription(plan: Plan): Promise<SubscriptionHandle> {
    return {
      chargeId: `demo-charge-${plan}`,
      confirmationUrl: null,
      status: "ACTIVE",
      planName: `ShelfSense ${planDef(plan).name}`,
    };
  }

  async currentSubscription(): Promise<SubscriptionHandle | null> {
    return null;
  }

  async cancelSubscription(): Promise<boolean> {
    return true;
  }
}

/* --------------------------------------------------------------- resolver --- */

/**
 * The admin client for a shop.
 *
 * A demo shop always gets the fake — it has no Shopify credentials and never
 * will. A real shop gets the live client, and a real shop whose token is missing
 * or undecryptable gets a clear error rather than a fake: silently serving
 * generated data to a merchant who thinks it is theirs would be much worse than
 * an error.
 */
export function adminFor(shop: Shop, today?: string): ShopifyAdmin {
  if (shop.isDemo) {
    return new FakeShopifyAdmin(shop.shopifyDomain, today ?? new Date().toISOString().slice(0, 10));
  }
  const token = decryptSecret(shop.accessToken);
  if (!token) {
    throw new Error(
      `No usable Shopify credentials for ${shop.shopifyDomain}. The merchant needs to reinstall.`,
    );
  }
  return new LiveShopifyAdmin(shop.shopifyDomain, token);
}

/** The shop a webhook or callback names, or null. */
export async function shopByDomain(domain: string): Promise<Shop | null> {
  const db = getDb();
  const [shop] = await db
    .select()
    .from(shops)
    .where(eq(shops.shopifyDomain, domain.toLowerCase()))
    .limit(1);
  return shop ?? null;
}

/** A merchant's shop by id, scoped so one merchant cannot read another's. */
export async function shopForMerchant(merchantId: string, shopId: string): Promise<Shop | null> {
  const db = getDb();
  const [shop] = await db
    .select()
    .from(shops)
    .where(and(eq(shops.id, shopId), eq(shops.merchantId, merchantId)))
    .limit(1);
  return shop ?? null;
}

export const WEBHOOK_ADDRESS = () => `${env.appUrl}/api/webhooks/shopify`;
