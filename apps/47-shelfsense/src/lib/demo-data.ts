/**
 * The demo store: Oaklane Goods.
 *
 * This is a *labelled* sample store, not a fabricated customer — the product says
 * so wherever its numbers appear. It exists for two reasons:
 *
 *  1. There are no Shopify credentials in this environment, so it is the only way
 *     to exercise the install -> backfill -> forecast path end to end. Loading it
 *     runs the real backfill against `FakeShopifyAdmin`, the real velocity maths,
 *     and the real forecast writer.
 *  2. Its catalogue is built to contain every case the forecast has to get right,
 *     because a demo store where everything is healthy proves nothing:
 *
 *     - `OAK-MUG-03`  sold 4/day for ten weeks and has been out of stock for the
 *       last 18 days. Its recent sales are zero *because it is empty*. A tool that
 *       reads those as demand calls a best-seller dead.
 *     - `OAK-WRAP-04` launched 14 days ago. Its 30- and 90-day windows contain 14
 *       observed days, not 30 and 90.
 *     - `OAK-BLKT-07` was quiet for eleven weeks and then went 8x in ten days —
 *       the seasonal spike that a flat 90-day average sleeps through.
 *     - `OAK-TOTE-01` sold well for a month, then stopped, and 212 units of it are
 *       sitting in the stockroom.
 *     - `OAK-APRN-05N` and `OAK-APRN-05C` share Northbay Textiles with the tote and
 *       the blanket, so the PO grouping has a supplier with four SKUs and a 34-day
 *       lead time.
 *     - `OAK-CNDL-10C` is falling: 4/day for two months, then 1.4/day for the last
 *       twelve days — the fall has to be inside the 7-day window to read as a trend.
 *     - `OAK-APRN-05C` has no unit cost on file, so the dead-stock screen has to
 *       show an estimate and say that it is one.
 *
 * The daily series are deterministic (a seeded PRNG), so the same demo store
 * produces the same forecasts on every machine and a fixture test can pin them.
 */

import { addDays, daysBetween } from "@/lib/dates";
import type { AdminProduct, ShopInfo } from "@/lib/shopify-admin";
import type { ShopifyOrderPayload } from "@/lib/shopify";

/**
 * The demo store's domain is per-merchant and deliberately **not** a myshopify one.
 *
 * Two reasons, and the first was a real bug: `shops.shopify_domain` is globally unique,
 * so a single shared demo domain meant the second merchant to press "Load the demo
 * store" got a constraint violation instead of a dashboard. The second is safety —
 * `isValidShopDomain` rejects this suffix, so a demo shop can never be the target of an
 * OAuth exchange or a webhook, whatever arrives claiming to be it.
 */
export const DEMO_DOMAIN_SUFFIX = ".demo.shelfsense.invalid";
export const DEMO_WINDOW_DAYS = 90;

export function demoDomainFor(merchantId: string): string {
  return `oaklane-goods-${merchantId.replace(/-/g, "").slice(0, 8)}${DEMO_DOMAIN_SUFFIX}`;
}

export interface DemoSupplier {
  key: string;
  name: string;
  email: string;
  leadTimeDays: number;
  minOrderValueCents: number;
  notes: string;
}

export const DEMO_SUPPLIERS: DemoSupplier[] = [
  {
    key: "apex",
    name: "Apex Goods Co.",
    email: "orders@apexgoods.example",
    leadTimeDays: 18,
    minOrderValueCents: 50_000,
    notes: "Domestic. Ships Tuesdays; cut-off is 14:00 ET the day before.",
  },
  {
    key: "kettle",
    name: "Kettle & Co",
    email: "purchasing@kettleandco.example",
    leadTimeDays: 7,
    minOrderValueCents: 15_000,
    notes: "Local workshop, two towns over. Will split a pack if asked nicely.",
  },
  {
    key: "northbay",
    name: "Northbay Textiles",
    email: "po@northbaytextiles.example",
    leadTimeDays: 34,
    minOrderValueCents: 120_000,
    notes: "Sea freight. Add two weeks around Lunar New Year.",
  },
];

interface DemoVariantSpec {
  sku: string;
  productKey: string;
  productTitle: string;
  variantTitle: string;
  vendor: string;
  supplierKey: string;
  priceCents: number;
  costCents: number | null;
  moq: number;
  packSize: number;
  /** Units on hand today. */
  available: number;
  /**
   * Units/day as a function of days-ago (0 = yesterday, 89 = ninety days ago).
   * Written backwards from today because that is how every case is described:
   * "out of stock for the last 18 days", "launched 14 days ago".
   */
  rate: (daysAgo: number) => number;
}

const SPECS: DemoVariantSpec[] = [
  {
    sku: "OAK-SACH-06",
    productKey: "sachets",
    productTitle: "Cedar drawer sachets",
    variantTitle: "6-pack",
    vendor: "Oaklane",
    supplierKey: "apex",
    priceCents: 2400,
    costCents: 890,
    moq: 100,
    packSize: 24,
    available: 38,
    rate: () => 6.2,
  },
  {
    sku: "OAK-MUG-03",
    productKey: "mug",
    productTitle: "Enamel camp mug",
    variantTitle: "Speckled white",
    vendor: "Apex",
    supplierKey: "apex",
    priceCents: 2200,
    costCents: 780,
    moq: 144,
    packSize: 12,
    available: 0,
    // Out of stock for the last 18 days: the zeros are censored, not demand.
    rate: (daysAgo) => (daysAgo < 18 ? 0 : 4.1),
  },
  {
    sku: "OAK-WRAP-04",
    productKey: "wraps",
    productTitle: "Beeswax food wraps",
    variantTitle: "Set of 3",
    vendor: "Kettle",
    supplierKey: "kettle",
    priceCents: 1800,
    costCents: 610,
    moq: 60,
    packSize: 6,
    available: 40,
    // Launched 14 days ago.
    rate: (daysAgo) => (daysAgo < 14 ? 9.1 : 0),
  },
  {
    sku: "OAK-BLKT-07",
    productKey: "blanket",
    productTitle: "Wool picnic blanket",
    variantTitle: "Fern check",
    vendor: "Northbay",
    supplierKey: "northbay",
    priceCents: 14_800,
    costCents: 5900,
    moq: 40,
    packSize: 10,
    available: 61,
    // Eleven quiet weeks, then a spike.
    rate: (daysAgo) => (daysAgo < 10 ? 5.4 : 0.6),
  },
  {
    sku: "OAK-TOTE-01",
    productKey: "tote",
    productTitle: "Waxed canvas tote",
    variantTitle: "Olive",
    vendor: "Northbay",
    supplierKey: "northbay",
    priceCents: 12_800,
    costCents: 1800,
    moq: 50,
    packSize: 10,
    available: 212,
    // Sold for a month, then stopped. 212 units of it left.
    rate: (daysAgo) => (daysAgo > 62 ? 1.3 : 0.02),
  },
  {
    sku: "OAK-APRN-05N",
    productKey: "apron",
    productTitle: "Linen work apron",
    variantTitle: "Natural",
    vendor: "Northbay",
    supplierKey: "northbay",
    priceCents: 6400,
    costCents: 2450,
    moq: 60,
    packSize: 12,
    available: 92,
    rate: () => 2.4,
  },
  {
    sku: "OAK-APRN-05C",
    productKey: "apron",
    productTitle: "Linen work apron",
    variantTitle: "Charcoal",
    vendor: "Northbay",
    supplierKey: "northbay",
    priceCents: 6400,
    // No unit cost on file — the dead-stock screen has to estimate and say so.
    costCents: null,
    moq: 60,
    packSize: 12,
    available: 70,
    rate: () => 0.9,
  },
  {
    sku: "OAK-HOOK-02",
    productKey: "hooks",
    productTitle: "Brass hook rail",
    variantTitle: "Three hook",
    vendor: "Kettle",
    supplierKey: "kettle",
    priceCents: 4200,
    costCents: 1550,
    moq: 24,
    packSize: 6,
    available: 70,
    rate: () => 1.8,
  },
  {
    sku: "OAK-BOWL-08",
    productKey: "bowl",
    productTitle: "Stoneware mixing bowl",
    variantTitle: "Large",
    vendor: "Apex",
    supplierKey: "apex",
    priceCents: 5400,
    costCents: 2100,
    moq: 36,
    packSize: 6,
    available: 95,
    rate: () => 1.1,
  },
  {
    sku: "OAK-CAN-09",
    productKey: "can",
    productTitle: "Copper watering can",
    variantTitle: "1.5L",
    vendor: "Kettle",
    supplierKey: "kettle",
    priceCents: 7800,
    costCents: 3100,
    moq: 24,
    packSize: 4,
    available: 88,
    rate: () => 2.0,
  },
  {
    sku: "OAK-CNDL-10F",
    productKey: "candle",
    productTitle: "Soy candle",
    variantTitle: "Fig & bay",
    vendor: "Apex",
    supplierKey: "apex",
    priceCents: 3200,
    costCents: 1150,
    moq: 96,
    packSize: 12,
    available: 150,
    rate: () => 3.4,
  },
  {
    sku: "OAK-CNDL-10C",
    productKey: "candle",
    productTitle: "Soy candle",
    variantTitle: "Cedar & smoke",
    vendor: "Apex",
    supplierKey: "apex",
    priceCents: 3200,
    costCents: 1150,
    moq: 96,
    packSize: 12,
    available: 40,
    // Falling: 4/day for two months, then 1.4/day for the last twelve days. The fall
    // has to be inside the 7-day window to *be* a trend — a drop that happened five
    // weeks ago is simply the new normal, and the arrow says flat, correctly.
    rate: (daysAgo) => (daysAgo < 12 ? 1.4 : 4.0),
  },
];

const PRODUCT_META: Record<string, { title: string; vendor: string; status: string }> = {
  sachets: { title: "Cedar drawer sachets", vendor: "Oaklane", status: "active" },
  mug: { title: "Enamel camp mug", vendor: "Apex Goods Co.", status: "active" },
  wraps: { title: "Beeswax food wraps", vendor: "Kettle & Co", status: "active" },
  blanket: { title: "Wool picnic blanket", vendor: "Northbay Textiles", status: "active" },
  tote: { title: "Waxed canvas tote", vendor: "Northbay Textiles", status: "active" },
  apron: { title: "Linen work apron", vendor: "Northbay Textiles", status: "active" },
  hooks: { title: "Brass hook rail", vendor: "Kettle & Co", status: "active" },
  bowl: { title: "Stoneware mixing bowl", vendor: "Apex Goods Co.", status: "active" },
  can: { title: "Copper watering can", vendor: "Kettle & Co", status: "active" },
  candle: { title: "Soy candle", vendor: "Apex Goods Co.", status: "active" },
};

/** Stable numeric ids, so a reload of the demo store updates rather than duplicates. */
function productId(key: string): string {
  const index = Object.keys(PRODUCT_META).indexOf(key);
  return String(880_000_000 + index);
}

function variantId(sku: string): string {
  const index = SPECS.findIndex((s) => s.sku === sku);
  return String(990_000_000 + index);
}

/** mulberry32 — small, fast, and identical on every machine. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function demoShopInfo(): ShopInfo {
  return {
    shopifyShopId: "70000001",
    name: "Oaklane Goods (demo)",
    email: "hello@oaklanegoods.example",
    timezone: "America/New_York",
    currency: "USD",
  };
}

export function demoSupplierFor(sku: string): DemoSupplier | undefined {
  const spec = SPECS.find((s) => s.sku === sku);
  return DEMO_SUPPLIERS.find((s) => s.key === spec?.supplierKey);
}

export function demoVariantSpecs() {
  return SPECS.map((spec) => ({
    sku: spec.sku,
    supplierKey: spec.supplierKey,
    moq: spec.moq,
    packSize: spec.packSize,
    costCents: spec.costCents,
  }));
}

/** The catalogue as the Admin API would return it. */
export function demoProducts(): AdminProduct[] {
  const byProduct = new Map<string, AdminProduct>();
  for (const spec of SPECS) {
    const meta = PRODUCT_META[spec.productKey];
    let product = byProduct.get(spec.productKey);
    if (!product) {
      product = {
        shopifyProductId: productId(spec.productKey),
        title: meta.title,
        status: meta.status,
        vendor: meta.vendor,
        imageUrl: null,
        variants: [],
      };
      byProduct.set(spec.productKey, product);
    }
    product.variants.push({
      shopifyVariantId: variantId(spec.sku),
      sku: spec.sku,
      title: spec.variantTitle,
      priceCents: spec.priceCents,
      costCents: spec.costCents,
      inventoryQuantity: spec.available,
      tracked: true,
      inventoryItemId: `70${variantId(spec.sku)}`,
    });
  }
  return [...byProduct.values()];
}

/** Units sold on a given date for a given SKU. Deterministic. */
export function demoUnitsOn(sku: string, date: string, today: string): number {
  const spec = SPECS.find((s) => s.sku === sku);
  if (!spec) return 0;
  const daysAgo = daysBetween(date, today) - 1; // 0 = yesterday
  if (daysAgo < 0 || daysAgo >= DEMO_WINDOW_DAYS) return 0;
  const base = spec.rate(daysAgo);
  if (base <= 0) return 0;
  const random = rng(hash(`${sku}:${date}`))();
  // Weekend lift, then ±35% jitter — enough texture that variance is real.
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const weekend = weekday === 0 || weekday === 6 ? 1.25 : 1;
  const jittered = base * weekend * (0.65 + random * 0.7);
  const whole = Math.floor(jittered);
  return whole + (random < jittered - whole ? 1 : 0);
}

/**
 * The 90 days of orders the backfill pages through.
 *
 * Line items are bundled into orders of up to three SKUs, which is what a real
 * store looks like and means the mapper has to attribute a multi-line order
 * correctly. One order carries a refund and one is a test order — both exist so
 * the ingestion path has something real to exclude.
 */
export function demoOrdersSince(sinceDate: string, today: string): ShopifyOrderPayload[] {
  const orders: ShopifyOrderPayload[] = [];
  const start = addDays(today, -DEMO_WINDOW_DAYS);
  const from = sinceDate > start ? sinceDate : start;
  const end = addDays(today, -1);
  let orderSeq = 1000;
  let lineSeq = 500_000;

  for (let date = from; date <= end; date = addDays(date, 1)) {
    const lines: NonNullable<ShopifyOrderPayload["line_items"]> = [];
    for (const spec of SPECS) {
      const units = demoUnitsOn(spec.sku, date, today);
      if (units <= 0) continue;
      lines.push({
        id: String(lineSeq++),
        product_id: productId(spec.productKey),
        variant_id: variantId(spec.sku),
        sku: spec.sku,
        title: PRODUCT_META[spec.productKey].title,
        variant_title: spec.variantTitle,
        quantity: units,
        price: (spec.priceCents / 100).toFixed(2),
      });
    }
    if (!lines.length) continue;

    // Deterministic hour inside the shop's day (America/New_York, UTC-4/5).
    for (let i = 0; i < lines.length; i += 3) {
      const chunk = lines.slice(i, i + 3);
      const hour = 14 + (i % 6); // 10:00-16:00 local
      const id = orderSeq++;
      const order: ShopifyOrderPayload = {
        id: String(id),
        name: `#${id}`,
        created_at: `${date}T${String(hour).padStart(2, "0")}:12:00Z`,
        cancelled_at: null,
        test: false,
        line_items: chunk,
      };
      // One order in the window is refunded in part, and one is a test order.
      if (id === 1007) {
        order.refunds = [
          { refund_line_items: [{ line_item_id: chunk[0].id, quantity: chunk[0].quantity }] },
        ];
      }
      if (id === 1011) order.test = true;
      orders.push(order);
    }
  }
  return orders;
}
