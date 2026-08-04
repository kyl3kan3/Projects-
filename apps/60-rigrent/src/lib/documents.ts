/**
 * src/lib/documents.ts
 *
 * Where the PDF renderers meet the database and storage. Kept apart from
 * lib/contracts.ts so the rendering stays pure and testable, and apart from the
 * screens so a page never assembles a document by hand.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, items, orderLines, orders } from "@/db/schema";
import { audit } from "@/lib/audit";
import { depositsAreSimulated } from "@/lib/deposit-gateway";
import { hashDocument, renderContractPdf, renderRunSheetPdf } from "@/lib/contracts";
import { attachContract, getOrder } from "@/lib/orders";
import { attachRunSheet, getRun } from "@/lib/runs";
import { parseDamageFees, parseSettings } from "@/lib/settings";
import { putFile } from "@/lib/storage";

/**
 * Render and store the signed contract, then record its hash on the order.
 *
 * Called once, at signing. The hash is the evidence, so re-rendering later from
 * live data would replace the evidence with a different document — the function
 * refuses if the order already has one.
 */
export async function renderAndStoreContract(
  accountId: string,
  orderId: string,
): Promise<{ key: string; docHash: string } | null> {
  const db = getDb();
  const full = await getOrder(accountId, orderId);
  if (!full) throw new Error("That order is not in this account.");
  if (full.order.contractR2Key && full.order.docHash) {
    return { key: full.order.contractR2Key, docHash: full.order.docHash };
  }
  if (!full.order.signedAt || !full.order.signerName) return null;

  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  const settings = parseSettings(account?.settings);

  const damageFees = [];
  for (const line of full.lines) {
    const [item] = await db.select().from(items).where(eq(items.id, line.itemId));
    if (!item) continue;
    damageFees.push({
      itemName: item.name,
      fees: parseDamageFees(item.damageFees),
      replacementCents: item.replacementCents,
    });
  }

  const bytes = await renderContractPdf({
    yardName: account?.name ?? "RigRent",
    orderNumber: full.order.number,
    customerName: full.customer.name,
    customerCompany: full.customer.company,
    outOn: full.order.outOn,
    dueBackOn: full.order.dueBackOn,
    delivery: full.order.delivery,
    address: full.order.address,
    lines: full.lines.map((l) => ({
      itemName: l.itemName,
      quantity: l.quantity,
      rateCents: l.rateCents,
      lineTotalCents: l.lineTotalCents,
    })),
    subtotalCents: full.order.subtotalCents,
    taxCents: full.order.taxCents,
    totalCents: full.order.totalCents,
    depositCents: full.order.depositCents,
    damageFees,
    terms: settings.terms,
    damageClause: settings.damageClause,
    signerName: full.order.signerName,
    signerInitials: full.order.signerInitials ?? "",
    signedAt: full.order.signedAt,
    simulatedDeposit: depositsAreSimulated(),
  });

  const docHash = hashDocument(bytes);
  const stored = await putFile(accountId, "contract", "pdf", Buffer.from(bytes));
  await attachContract(orderId, stored.key, docHash);
  await audit(accountId, `customer:${full.order.signerName}`, "contract.signed", orderId, {
    docHash,
    number: full.order.number,
  });
  return { key: stored.key, docHash };
}

/** Render and store the run sheet. Safe to call again; it overwrites the key. */
export async function renderRunSheet(
  accountId: string,
  runId: string,
): Promise<{ key: string } | null> {
  const detail = await getRun(accountId, runId);
  if (!detail) return null;
  const db = getDb();
  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));

  const bytes = await renderRunSheetPdf({
    yardName: account?.name ?? "RigRent",
    kind: detail.run.kind,
    runOn: detail.run.runOn,
    truckLabel: detail.run.truckLabel,
    driverName: detail.driverName,
    stops: detail.stops,
    loadList: detail.loadList,
  });
  const stored = await putFile(accountId, "runsheet", "pdf", Buffer.from(bytes));
  await attachRunSheet(runId, stored.key);
  return { key: stored.key };
}

/** Line count on an order, without loading the whole thing. */
export async function lineCount(orderId: string): Promise<number> {
  const rows = await getDb()
    .select({ id: orderLines.id })
    .from(orderLines)
    .where(eq(orderLines.orderId, orderId));
  return rows.length;
}

/** Guard used by the download routes: does this key belong to this account? */
export async function orderForContractKey(key: string): Promise<string | null> {
  const [order] = await getDb()
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.contractR2Key, key));
  return order?.id ?? null;
}
