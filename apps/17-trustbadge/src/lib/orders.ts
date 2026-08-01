/**
 * Order ingestion.
 *
 * Orders are the metering unit, so two things must hold no matter what the
 * platform sends:
 *
 *  - **Idempotence.** Shopify retries webhooks, and a retry must not double-count
 *    an order or double-send a request. `(store_id, external_id)` is unique and
 *    ingest is an upsert.
 *  - **Never drop the order.** Going over the plan limit stops *outreach*, not
 *    ingestion. Refusing to record an order because the merchant is on Free would
 *    corrupt their own history and their next invoice.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  orders,
  type LineItem,
  type Order,
  type OrderStatus,
  type Store,
  type Tier,
} from "@/db/schema";
import { scheduleRequestForOrder } from "@/lib/requests";

export interface IngestInput {
  externalId: string;
  orderNumber?: string | null;
  customerEmail: string;
  customerName?: string | null;
  customerPhone?: string | null;
  lineItems?: LineItem[];
  status?: OrderStatus;
  fulfilledAt?: Date | null;
}

export interface IngestResult {
  order: Order;
  created: boolean;
  /** Null when no request was scheduled, with `reason` saying why. */
  requestId: string | null;
  reason:
    | "scheduled"
    | "already_requested"
    | "not_fulfilled"
    | "over_limit"
    | "requests_disabled"
    | "plan_excludes_requests"
    | "no_email";
}

/**
 * Upsert an order and, when it is fulfilled and the plan allows, schedule the
 * review request that follows it.
 */
export async function ingestOrder(args: {
  store: Store;
  tier: Tier;
  merchantId: string;
  input: IngestInput;
}): Promise<IngestResult> {
  const { store, tier, input } = args;
  const db = getDb();

  const email = (input.customerEmail ?? "").trim().toLowerCase();
  const values = {
    storeId: store.id,
    externalId: String(input.externalId),
    orderNumber: input.orderNumber ?? null,
    customerEmail: email,
    customerName: input.customerName ?? null,
    customerPhone: input.customerPhone ?? null,
    lineItems: input.lineItems ?? [],
    status: input.status ?? "pending",
    fulfilledAt: input.fulfilledAt ?? null,
  };

  const [existing] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.storeId, store.id), eq(orders.externalId, values.externalId)));

  let order: Order;
  if (existing) {
    // A later webhook for the same order carries better information (fulfilment,
    // a phone number); it must never reset fields back to null.
    const [updated] = await db
      .update(orders)
      .set({
        orderNumber: values.orderNumber ?? existing.orderNumber,
        customerEmail: values.customerEmail || existing.customerEmail,
        customerName: values.customerName ?? existing.customerName,
        customerPhone: values.customerPhone ?? existing.customerPhone,
        lineItems: values.lineItems.length ? values.lineItems : existing.lineItems,
        status: values.status,
        fulfilledAt: values.fulfilledAt ?? existing.fulfilledAt,
      })
      .where(eq(orders.id, existing.id))
      .returning();
    order = updated;
  } else {
    const [created] = await db.insert(orders).values(values).returning();
    order = created;
  }

  const scheduling = await scheduleRequestForOrder({
    store,
    tier,
    merchantId: args.merchantId,
    order,
  });

  return { order, created: !existing, ...scheduling };
}

/** Cancelling or refunding an order pulls its unsent request. */
export async function cancelOrder(storeId: string, externalId: string): Promise<void> {
  const db = getDb();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.storeId, storeId), eq(orders.externalId, String(externalId))));
  if (!order) return;
  await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, order.id));
}
