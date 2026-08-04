/**
 * src/lib/checkin.ts
 *
 * Recording a check — at load-out on the truck, and at check-in on the return.
 *
 * The one thing this file is careful about: **a clean return releases its hold
 * automatically, and it does it here rather than in a screen.** The release is
 * part of the return, not a button somebody remembers to press, because a deposit
 * left held on a clean return is money the customer's bank is quietly sitting on
 * and the yard gets the phone call.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  checks,
  conditionPhotos,
  damageClaims,
  orderLines,
  orders,
  type Check,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { returnOutcome, validateCounts } from "@/lib/checkin-core";
import { draftClaimsForCheck } from "@/lib/claims";
import { releaseHold } from "@/lib/deposits";
import { getLines, markReturned } from "@/lib/orders";

export class CheckError extends Error {}

export interface RecordCheckInput {
  accountId: string;
  orderId: string;
  orderLineId: string;
  direction: "out" | "in";
  quantityOk: number;
  quantityDamaged: number;
  quantityMissing: number;
  note: string | null;
  userId: string;
  actor: string;
}

export interface RecordCheckResult {
  check: Check;
  /** Present when this check completed a return. */
  outcome: ReturnType<typeof returnOutcome> | null;
  /** What happened to the deposit as a result, if anything. */
  depositNote: string | null;
  claimsDrafted: number;
}

/**
 * Record one line's check. Idempotent per (line, direction): the unique index
 * means a driver tapping twice updates rather than duplicates, which is what a
 * gloved thumb on a phone in a warehouse actually does.
 */
export async function recordCheck(input: RecordCheckInput): Promise<RecordCheckResult> {
  const db = getDb();
  const lines = await getLines(input.orderId);
  const line = lines.find((l) => l.id === input.orderLineId);
  if (!line) throw new CheckError("That line is not on this order.");

  const counts = {
    quantityOk: input.quantityOk,
    quantityDamaged: input.quantityDamaged,
    quantityMissing: input.quantityMissing,
  };
  const valid = validateCounts(counts, line.quantity);
  if (!valid.ok) throw new CheckError(valid.error);

  const [existing] = await db
    .select()
    .from(checks)
    .where(and(eq(checks.orderLineId, input.orderLineId), eq(checks.direction, input.direction)));

  let check: Check;
  if (existing) {
    const [updated] = await db
      .update(checks)
      .set({
        ...counts,
        note: input.note,
        checkedBy: input.userId,
        checkedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(checks.id, existing.id))
      .returning();
    check = updated;
  } else {
    const [inserted] = await db
      .insert(checks)
      .values({
        orderLineId: input.orderLineId,
        direction: input.direction,
        ...counts,
        note: input.note,
        checkedBy: input.userId,
      })
      .returning();
    check = inserted;
  }

  await audit(input.accountId, input.actor, `check.${input.direction}`, input.orderId, {
    orderLineId: input.orderLineId,
    ...counts,
  });

  if (input.direction === "out") {
    return { check, outcome: null, depositNote: null, claimsDrafted: 0 };
  }

  /* --- the return side --- */

  let claimsDrafted = 0;
  if (check.quantityDamaged > 0 || check.quantityMissing > 0) {
    // Re-drafting after a corrected count would stack duplicate claims, so only
    // draft when this line has none yet. Adjusting a claim after the fact is a
    // decision for a person, and the claim list is where they make it.
    const [alreadyClaimed] = await db
      .select({ id: damageClaims.id })
      .from(damageClaims)
      .where(eq(damageClaims.orderLineId, input.orderLineId))
      .limit(1);
    if (!alreadyClaimed) {
      const drafted = await draftClaimsForCheck({
        accountId: input.accountId,
        orderId: input.orderId,
        orderLineId: input.orderLineId,
        checkId: check.id,
        actor: input.actor,
      });
      claimsDrafted = drafted.length;
    }
  }

  const inChecks = await inChecksFor(input.orderId);
  const outcome = returnOutcome(
    lines.map((l) => ({ orderLineId: l.id, quantity: l.quantity })),
    inChecks,
  );

  let depositNote: string | null = null;
  if (outcome.complete) {
    await markReturned(input.accountId, input.orderId, input.actor);
    if (outcome.clean) {
      const released = await releaseHold(input.accountId, input.orderId, input.actor);
      depositNote = released.released
        ? "Clean return — the deposit hold was released automatically. No money moved."
        : released.note;
      await getDb()
        .update(orders)
        .set({ status: "closed", closedAt: new Date(), updatedAt: new Date() })
        .where(eq(orders.id, input.orderId));
    } else {
      depositNote = `Checked in with ${outcome.damagedTotal} damaged and ${outcome.missingTotal} missing. Review the claims, then settle the deposit.`;
    }
  }

  return { check, outcome, depositNote, claimsDrafted };
}

export async function inChecksFor(orderId: string) {
  const db = getDb();
  const rows = await db
    .select({
      orderLineId: checks.orderLineId,
      quantityOk: checks.quantityOk,
      quantityDamaged: checks.quantityDamaged,
      quantityMissing: checks.quantityMissing,
    })
    .from(checks)
    .innerJoin(orderLines, eq(orderLines.id, checks.orderLineId))
    .where(and(eq(orderLines.orderId, orderId), eq(checks.direction, "in")));
  return rows;
}

export async function checksFor(orderId: string, direction: "out" | "in"): Promise<Check[]> {
  const rows = await getDb()
    .select({ check: checks })
    .from(checks)
    .innerJoin(orderLines, eq(orderLines.id, checks.orderLineId))
    .where(and(eq(orderLines.orderId, orderId), eq(checks.direction, direction)));
  return rows.map((r) => r.check);
}

/** Attach a stored photo to a check. The key was produced by lib/storage. */
export async function attachPhoto(input: {
  checkId: string;
  key: string;
  caption: string | null;
}): Promise<void> {
  await getDb().insert(conditionPhotos).values({
    checkId: input.checkId,
    r2Key: input.key,
    caption: input.caption,
  });
}

/**
 * The check a photo should attach to, created empty if the driver photographs
 * before counting. An out-check with zero counts is a real state — "I have
 * photographed this pallet, I have not counted it yet".
 */
export async function ensureCheck(
  orderLineId: string,
  direction: "out" | "in",
  userId: string,
): Promise<Check> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(checks)
    .where(and(eq(checks.orderLineId, orderLineId), eq(checks.direction, direction)));
  if (existing) return existing;
  const [created] = await db
    .insert(checks)
    .values({ orderLineId, direction, checkedBy: userId })
    .returning();
  return created;
}
