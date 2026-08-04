/**
 * src/lib/customers.ts
 *
 * Customer records, plus the two histories a rental shop actually looks up before
 * saying yes: what they have rented, and what came back broken.
 */

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  customers,
  damageClaims,
  items,
  orderLines,
  orders,
  type Customer,
  type DamageClaim,
} from "@/db/schema";
import { audit } from "@/lib/audit";

export async function listCustomers(accountId: string): Promise<
  Array<Customer & { orderCount: number; lastOutOn: string | null }>
> {
  const db = getDb();
  const rows = await db
    .select({
      customer: customers,
      orderCount: sql<number>`COUNT(${orders.id})`,
      lastOutOn: sql<string | null>`MAX(${orders.outOn})`,
    })
    .from(customers)
    .leftJoin(orders, eq(orders.customerId, customers.id))
    .where(eq(customers.accountId, accountId))
    .groupBy(customers.id)
    .orderBy(asc(customers.name));
  return rows.map((r) => ({
    ...r.customer,
    orderCount: Number(r.orderCount),
    lastOutOn: r.lastOutOn,
  }));
}

export async function getCustomer(accountId: string, customerId: string): Promise<Customer | null> {
  const [customer] = await getDb()
    .select()
    .from(customers)
    .where(and(eq(customers.accountId, accountId), eq(customers.id, customerId)));
  return customer ?? null;
}

export async function createCustomer(input: {
  accountId: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  taxExempt: boolean;
  notes: string | null;
  actor: string;
}): Promise<Customer> {
  if (!input.name.trim()) throw new Error("A customer needs a name.");
  if (input.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) {
    throw new Error("That email address does not look right.");
  }
  const [customer] = await getDb()
    .insert(customers)
    .values({
      accountId: input.accountId,
      name: input.name.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      company: input.company?.trim() || null,
      taxExempt: input.taxExempt,
      notes: input.notes?.trim() || null,
    })
    .returning();
  await audit(input.accountId, input.actor, "customer.created", customer.id, {
    name: customer.name,
  });
  return customer;
}

export async function updateCustomer(input: {
  accountId: string;
  customerId: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  taxExempt: boolean;
  notes: string | null;
  actor: string;
}): Promise<void> {
  if (!input.name.trim()) throw new Error("A customer needs a name.");
  if (input.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) {
    throw new Error("That email address does not look right.");
  }
  await getDb()
    .update(customers)
    .set({
      name: input.name.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      company: input.company?.trim() || null,
      taxExempt: input.taxExempt,
      notes: input.notes?.trim() || null,
      updatedAt: new Date(),
    })
    .where(and(eq(customers.accountId, input.accountId), eq(customers.id, input.customerId)));
  await audit(input.accountId, input.actor, "customer.edited", input.customerId, {
    name: input.name.trim(),
    taxExempt: input.taxExempt,
  });
}

export interface DamageHistoryRow extends DamageClaim {
  itemName: string;
  orderNumber: number;
  outOn: string;
}

/**
 * Every claim ever raised against this customer, newest first. This is the screen
 * somebody looks at before renting a marquee to a name they half remember.
 */
export async function damageHistory(
  accountId: string,
  customerId: string,
): Promise<DamageHistoryRow[]> {
  const rows = await getDb()
    .select({
      claim: damageClaims,
      itemName: items.name,
      orderNumber: orders.number,
      outOn: orders.outOn,
    })
    .from(damageClaims)
    .innerJoin(orders, eq(orders.id, damageClaims.orderId))
    .innerJoin(orderLines, eq(orderLines.id, damageClaims.orderLineId))
    .innerJoin(items, eq(items.id, orderLines.itemId))
    .where(and(eq(orders.accountId, accountId), eq(orders.customerId, customerId)))
    .orderBy(desc(orders.outOn));
  return rows.map((r) => ({
    ...r.claim,
    itemName: r.itemName,
    orderNumber: r.orderNumber,
    outOn: r.outOn,
  }));
}
