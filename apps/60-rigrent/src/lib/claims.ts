/**
 * src/lib/claims.ts
 *
 * Damage claims: draft from the photo pair, decide, then settle once.
 *
 * "The damage claim is the diff between photo pairs, not a memory contest"
 * (README). Structurally that means a claim always hangs off an order line that
 * has both an out-check and an in-check, and `evidenceFor` is what the screen
 * shows: the two photo sets, side by side, with the counts that disagree.
 */

import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts,
  checks,
  conditionPhotos,
  damageClaims,
  items,
  orderLines,
  orders,
  type Check,
  type ConditionPhoto,
  type DamageClaim,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { claimTotals, draftsFromCheck, feeOptions, planSettlement } from "@/lib/claims-core";
import { captureFor, releaseHold } from "@/lib/deposits";
import { parseDamageFees, parseSettings } from "@/lib/settings";

export interface ClaimWithContext extends DamageClaim {
  itemName: string;
  lineQuantity: number;
  photos: ConditionPhoto[];
}

export async function listClaims(orderId: string): Promise<ClaimWithContext[]> {
  const db = getDb();
  const rows = await db
    .select({
      claim: damageClaims,
      itemName: items.name,
      lineQuantity: orderLines.quantity,
    })
    .from(damageClaims)
    .innerJoin(orderLines, eq(orderLines.id, damageClaims.orderLineId))
    .innerJoin(items, eq(items.id, orderLines.itemId))
    .where(eq(damageClaims.orderId, orderId))
    .orderBy(asc(damageClaims.createdAt));

  const out: ClaimWithContext[] = [];
  for (const row of rows) {
    const photos = row.claim.photoIds.length
      ? await db
          .select()
          .from(conditionPhotos)
          .where(inArray(conditionPhotos.id, row.claim.photoIds))
      : [];
    out.push({ ...row.claim, itemName: row.itemName, lineQuantity: row.lineQuantity, photos });
  }
  return out;
}

export interface PhotoPair {
  orderLineId: string;
  itemName: string;
  quantity: number;
  outCheck: Check | null;
  inCheck: Check | null;
  outPhotos: ConditionPhoto[];
  inPhotos: ConditionPhoto[];
}

/**
 * The photo pair for every line on an order. This is the damage argument, drawn:
 * what left the yard on the left, what came back on the right.
 */
export async function evidenceFor(orderId: string): Promise<PhotoPair[]> {
  const db = getDb();
  const lines = await db
    .select({ id: orderLines.id, quantity: orderLines.quantity, itemName: items.name })
    .from(orderLines)
    .innerJoin(items, eq(items.id, orderLines.itemId))
    .where(eq(orderLines.orderId, orderId))
    .orderBy(asc(items.name));

  const out: PhotoPair[] = [];
  for (const line of lines) {
    const lineChecks = await db.select().from(checks).where(eq(checks.orderLineId, line.id));
    const outCheck = lineChecks.find((c) => c.direction === "out") ?? null;
    const inCheck = lineChecks.find((c) => c.direction === "in") ?? null;
    out.push({
      orderLineId: line.id,
      itemName: line.itemName,
      quantity: line.quantity,
      outCheck,
      inCheck,
      outPhotos: outCheck ? await photosFor(outCheck.id) : [],
      inPhotos: inCheck ? await photosFor(inCheck.id) : [],
    });
  }
  return out;
}

export async function photosFor(checkId: string): Promise<ConditionPhoto[]> {
  return getDb()
    .select()
    .from(conditionPhotos)
    .where(eq(conditionPhotos.checkId, checkId))
    .orderBy(asc(conditionPhotos.takenAt));
}

/** The fee schedule offered when drafting a claim on one line. */
export async function feeOptionsForLine(
  accountId: string,
  orderLineId: string,
): Promise<Array<{ label: string; amountCents: number }>> {
  const db = getDb();
  const [row] = await db
    .select({ item: items })
    .from(orderLines)
    .innerJoin(items, eq(items.id, orderLines.itemId))
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .where(and(eq(orderLines.id, orderLineId), eq(orders.accountId, accountId)));
  if (!row) return [];
  const [account] = await db
    .select({ settings: accounts.settings })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  const defaults = parseSettings(account?.settings).damageFeeDefaults;
  return feeOptions(parseDamageFees(row.item.damageFees), defaults, row.item.replacementCents);
}

/**
 * Draft the claims a check-in implies, priced from the fee schedule. Drafts, not
 * charges: nothing here touches a card, and every one of them can be edited or
 * waived before the order settles.
 */
export async function draftClaimsForCheck(input: {
  accountId: string;
  orderId: string;
  orderLineId: string;
  checkId: string;
  actor: string;
}): Promise<DamageClaim[]> {
  const db = getDb();
  const [check] = await db.select().from(checks).where(eq(checks.id, input.checkId));
  if (!check) throw new Error("That check does not exist.");
  if (check.quantityDamaged === 0 && check.quantityMissing === 0) return [];

  const [row] = await db
    .select({ item: items })
    .from(orderLines)
    .innerJoin(items, eq(items.id, orderLines.itemId))
    .where(eq(orderLines.id, input.orderLineId));
  if (!row) throw new Error("That line does not exist.");

  const photos = await photosFor(input.checkId);
  const drafts = draftsFromCheck(check, {
    name: row.item.name,
    replacementCents: row.item.replacementCents,
    damageFees: parseDamageFees(row.item.damageFees),
  });

  const created: DamageClaim[] = [];
  for (const draft of drafts) {
    const [claim] = await db
      .insert(damageClaims)
      .values({
        orderId: input.orderId,
        orderLineId: input.orderLineId,
        kind: draft.kind,
        description: draft.description,
        amountCents: draft.amountCents,
        photoIds: photos.map((p) => p.id),
        status: "draft",
      })
      .returning();
    created.push(claim);
  }
  if (created.length) {
    await audit(input.accountId, input.actor, "claim.drafted", input.orderId, {
      count: created.length,
      amountCents: created.reduce((s, c) => s + c.amountCents, 0),
    });
  }
  return created;
}

export async function updateClaim(input: {
  accountId: string;
  claimId: string;
  description?: string;
  amountCents?: number;
  actor: string;
}): Promise<void> {
  const db = getDb();
  const [claim] = await db.select().from(damageClaims).where(eq(damageClaims.id, input.claimId));
  if (!claim) throw new Error("That claim does not exist.");
  if (claim.status !== "draft") {
    throw new Error("Only a draft claim can be edited. This one has already been settled.");
  }
  await db
    .update(damageClaims)
    .set({
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.amountCents === undefined ? {} : { amountCents: Math.max(0, input.amountCents) }),
      updatedAt: new Date(),
    })
    .where(eq(damageClaims.id, input.claimId));
  await audit(input.accountId, input.actor, "claim.edited", claim.orderId, {
    claimId: claim.id,
    amountCents: input.amountCents,
  });
}

export async function waiveClaim(input: {
  accountId: string;
  claimId: string;
  actor: string;
}): Promise<void> {
  const db = getDb();
  const [claim] = await db.select().from(damageClaims).where(eq(damageClaims.id, input.claimId));
  if (!claim) throw new Error("That claim does not exist.");
  await db
    .update(damageClaims)
    .set({ status: "waived", resolvedAt: new Date(), updatedAt: new Date() })
    .where(eq(damageClaims.id, input.claimId));
  await audit(input.accountId, input.actor, "claim.waived", claim.orderId, {
    claimId: claim.id,
    amountCents: claim.amountCents,
  });
}

export async function addClaim(input: {
  accountId: string;
  orderId: string;
  orderLineId: string;
  kind: "damage" | "missing";
  description: string;
  amountCents: number;
  actor: string;
}): Promise<DamageClaim> {
  const db = getDb();
  const [line] = await db
    .select({ id: orderLines.id })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .where(
      and(
        eq(orderLines.id, input.orderLineId),
        eq(orderLines.orderId, input.orderId),
        eq(orders.accountId, input.accountId),
      ),
    );
  if (!line) throw new Error("That line is not on that order.");

  const [inCheck] = await db
    .select()
    .from(checks)
    .where(and(eq(checks.orderLineId, input.orderLineId), eq(checks.direction, "in")));
  const photos = inCheck ? await photosFor(inCheck.id) : [];

  const [claim] = await db
    .insert(damageClaims)
    .values({
      orderId: input.orderId,
      orderLineId: input.orderLineId,
      kind: input.kind,
      description: input.description,
      amountCents: Math.max(0, Math.trunc(input.amountCents)),
      photoIds: photos.map((p) => p.id),
      status: "draft",
    })
    .returning();
  await audit(input.accountId, input.actor, "claim.drafted", input.orderId, {
    claimId: claim.id,
    amountCents: claim.amountCents,
  });
  return claim;
}

export interface SettleResult {
  captured: boolean;
  capturedCents: number;
  releasedCents: number;
  shortfallCents: number;
  note: string;
}

/**
 * Settle the order's deposit in one movement: capture the summed draft claims,
 * mark them charged with the capture id, and let Stripe release the remainder.
 * Nothing to charge means a straight release.
 *
 * One capture per PaymentIntent is a Stripe fact, not a preference, so this is
 * the *only* function that moves deposit money and it runs once per order.
 */
export async function settleDeposit(input: {
  accountId: string;
  orderId: string;
  actor: string;
}): Promise<SettleResult> {
  const db = getDb();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.accountId, input.accountId), eq(orders.id, input.orderId)));
  if (!order) throw new Error("That order is not in this account.");

  const claims = await db.select().from(damageClaims).where(eq(damageClaims.orderId, input.orderId));
  const plan = planSettlement(claims, order.depositCents);

  if (plan.releaseOnly) {
    const released = await releaseHold(input.accountId, input.orderId, input.actor);
    return {
      captured: false,
      capturedCents: 0,
      releasedCents: order.depositCents,
      shortfallCents: 0,
      note: released.note,
    };
  }

  const capture = await captureFor({
    accountId: input.accountId,
    orderId: input.orderId,
    amountCents: plan.captureCents,
    claimIds: plan.chargeIds,
    actor: input.actor,
  });

  await db
    .update(damageClaims)
    .set({
      status: "charged",
      stripeCaptureId: capture.captureId,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(inArray(damageClaims.id, plan.chargeIds));

  return {
    captured: true,
    capturedCents: capture.capturedCents,
    releasedCents: plan.releasedCents,
    shortfallCents: plan.shortfallCents,
    note:
      plan.shortfallCents > 0
        ? `${capture.note} The claims came to more than the hold, so ${(plan.shortfallCents / 100).toFixed(2)} dollars still has to be invoiced separately.`
        : capture.note,
  };
}

export { claimTotals, planSettlement };
