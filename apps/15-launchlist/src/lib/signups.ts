/**
 * The signup flow, end to end. This is the file that has to be right.
 *
 * Everything here is orchestration: the arithmetic lives in `referrals.ts` and
 * the heuristics in `fraud.ts`, both pure and unit-tested. What this module owns
 * is keeping the materialized `position` column consistent with that arithmetic
 * while several people join at once.
 *
 * Three invariants, enforced by the helpers below and nowhere else:
 *
 *  I1  For a given list, the in-queue rows (`active`, `review`, `unsubscribed`)
 *      hold positions 1..N — no gaps, no duplicates. Everything else is 0.
 *  I2  Ordering is by `join_rank - boost_points` ascending, ties broken by
 *      `join_rank` — identical to `computePositions` in referrals.ts.
 *  I3  A referral pays its referrer at most once, ever: `referral_credited` is
 *      the latch, flipped inside the same transaction as the boost.
 *
 * Position changes are incremental. A referral that moves someone from #347 to
 * #298 updates 50 rows, not the table (ARCHITECTURE.md).
 */

import {
  and,
  asc,
  count as countRows,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  sql,
} from "drizzle-orm";
import { randomInt } from "node:crypto";
import { getDb } from "@/db";
import {
  events,
  lists,
  rewardGrants,
  rewards,
  signups,
  users,
  webhookDeliveries,
  webhookEndpoints,
  type List,
  type PlanId,
  type Signup,
  type SignupSource,
} from "@/db/schema";
import { env } from "@/lib/env";
import {
  canonicalizeEmail,
  isValidEmail,
  resolveAttribution,
  scoreSignup,
  type FraudResult,
} from "@/lib/fraud";
import {
  boostPointsFor,
  generateReferralCode,
  nextReward,
  normalizeReferralCode,
  positionDelta,
  shareUrl,
  type RewardTier,
} from "@/lib/referrals";
import { billableSignupCount, pageUrl, positionUrl, rewardsFor, toRewardTiers } from "@/lib/lists";
import { featureAllowed, signupCapacity } from "@/lib/plans";
import { positionEmail, rewardEmail, sendEmail, verificationEmail } from "@/lib/email";
import { randomToken, unsubscribeToken } from "@/lib/tokens";

/** Statuses that occupy a place in line (invariant I1). */
export const IN_QUEUE = ["active", "review", "unsubscribed"] as const;

/** How long before re-sending someone their own link. Anti-mail-bomb. */
const RESEND_COOLDOWN_MS = 10 * 60 * 1000;

/** Cryptographic randomness for share codes — a code is a capability. */
function secureRandom(): number {
  return randomInt(0, 1_000_000) / 1_000_000;
}

function appBase(): string {
  return env.appUrl.replace(/\/+$/, "");
}

/* ------------------------------------------------------------ queue maths --- */

/** `join_rank - boost_points`, as SQL, so ordering never diverges from I2. */
const sortKeySql = sql`(${signups.joinRank} - ${signups.boostPoints})`;

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * Serialize every queue mutation for one list on that list's own row.
 *
 * Without this, two confirmations arriving at the same moment each run a bulk
 * `UPDATE signups SET position = position + 1 WHERE position >= n`, take row
 * locks in whatever order the planner produced, and deadlock — Postgres kills
 * one of them and the person who clicked their confirmation link gets a 500.
 * That is precisely what a launch spike looks like, and it is the failure a
 * green build hides.
 *
 * Every transaction that touches `position` takes this lock *first*, and the
 * signup insert path already locks the same row (it increments
 * `last_join_rank`). One lock order for every writer means no cycle, so no
 * deadlock. The lock is held for the transaction and released with it.
 */
async function lockList(tx: Tx, listId: string): Promise<void> {
  await tx.execute(sql`select 1 from ${lists} where ${lists.id} = ${listId} for update`);
}

/** How many in-queue rows sort strictly ahead of this (joinRank, boost) pair? */
async function countAhead(
  tx: Tx,
  listId: string,
  selfId: string,
  joinRank: number,
  boostPoints: number,
): Promise<number> {
  const key = joinRank - boostPoints;
  const [row] = await tx
    .select({ n: countRows() })
    .from(signups)
    .where(
      and(
        eq(signups.listId, listId),
        inArray(signups.status, [...IN_QUEUE]),
        // Only *placed* rows count. A row can briefly be in-queue with position
        // 0 while its own transaction is mid-insert; counting it would inflate
        // this position by one and break contiguity (invariant I1).
        gt(signups.position, 0),
        ne(signups.id, selfId),
        sql`(${sortKeySql} < ${key} or (${sortKeySql} = ${key} and ${signups.joinRank} < ${joinRank}))`,
      ),
    );
  return Number(row?.n ?? 0);
}

/**
 * Insert a row into its list's queue and return the position it landed on.
 *
 * Verification order is not join order — someone who joined 5th can confirm
 * after someone who joined 9th — so this is a genuine insertion, not an append.
 * In the common case (confirmations arriving in order) nothing shifts at all.
 */
async function queueInsert(tx: Tx, row: Signup): Promise<number> {
  const position =
    (await countAhead(tx, row.listId, row.id, row.joinRank, row.boostPoints)) + 1;

  await tx
    .update(signups)
    .set({ position: sql`${signups.position} + 1` })
    .where(
      and(
        eq(signups.listId, row.listId),
        inArray(signups.status, [...IN_QUEUE]),
        ne(signups.id, row.id),
        gte(signups.position, position),
      ),
    );

  await tx.update(signups).set({ position }).where(eq(signups.id, row.id));
  return position;
}

/** Take a row out of the queue and close the gap it leaves. */
async function queueRemove(tx: Tx, row: Signup): Promise<void> {
  if (row.position <= 0) return;
  await tx
    .update(signups)
    .set({ position: sql`${signups.position} - 1` })
    .where(
      and(
        eq(signups.listId, row.listId),
        inArray(signups.status, [...IN_QUEUE]),
        ne(signups.id, row.id),
        gt(signups.position, row.position),
      ),
    );
  await tx.update(signups).set({ position: 0 }).where(eq(signups.id, row.id));
}

export interface BoostMove {
  before: number;
  after: number;
  delta: number;
  boostPoints: number;
}

/**
 * Change a row's boost and move it, touching only the rows it passed.
 *
 * The SQL mirror of `applyBoostIncremental` in referrals.ts, which is tested
 * against a full recompute so the two can be trusted to agree.
 */
async function applyBoost(tx: Tx, signupId: string, nextBoost: number): Promise<BoostMove | null> {
  const [row] = await tx.select().from(signups).where(eq(signups.id, signupId));
  if (!row) return null;

  const boost = Math.max(0, nextBoost);
  const before = row.position;
  if (boost === row.boostPoints) {
    return { before, after: before, delta: 0, boostPoints: row.boostPoints };
  }
  if (before <= 0) {
    // Not in the queue (still pending, or blocked). Bank the boost; it will be
    // honoured by queueInsert when the row is activated.
    await tx.update(signups).set({ boostPoints: boost }).where(eq(signups.id, signupId));
    return { before, after: before, delta: 0, boostPoints: boost };
  }

  const after = (await countAhead(tx, row.listId, row.id, row.joinRank, boost)) + 1;

  if (after < before) {
    await tx
      .update(signups)
      .set({ position: sql`${signups.position} + 1` })
      .where(
        and(
          eq(signups.listId, row.listId),
          inArray(signups.status, [...IN_QUEUE]),
          ne(signups.id, row.id),
          gte(signups.position, after),
          lt(signups.position, before),
        ),
      );
  } else if (after > before) {
    await tx
      .update(signups)
      .set({ position: sql`${signups.position} - 1` })
      .where(
        and(
          eq(signups.listId, row.listId),
          inArray(signups.status, [...IN_QUEUE]),
          ne(signups.id, row.id),
          gt(signups.position, before),
          lte(signups.position, after),
        ),
      );
  }

  await tx
    .update(signups)
    .set({ position: after, boostPoints: boost })
    .where(eq(signups.id, signupId));
  return { before, after, delta: positionDelta(before, after), boostPoints: boost };
}

/**
 * Rebuild a whole list's positions from scratch. Not on any hot path — it is the
 * repair tool, and the thing an integration test compares the incremental path
 * against.
 */
export async function recomputePositions(listId: string): Promise<number> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await lockList(tx, listId);
    const rows = await tx
      .select()
      .from(signups)
      .where(and(eq(signups.listId, listId), inArray(signups.status, [...IN_QUEUE])))
      .orderBy(asc(sortKeySql), asc(signups.joinRank));
    let n = 0;
    for (const [i, row] of rows.entries()) {
      if (row.position !== i + 1) {
        await tx.update(signups).set({ position: i + 1 }).where(eq(signups.id, row.id));
        n++;
      }
    }
    return n;
  });
}

/* ------------------------------------------------------------------- join --- */

export type JoinOutcome =
  | { kind: "pending"; signup: Signup; emailSent: boolean }
  | { kind: "joined"; signup: Signup; position: number; total: number }
  | { kind: "duplicate"; status: Signup["status"]; emailSent: boolean }
  | { kind: "rejected"; reason: string }
  | { kind: "full"; reason: string };

export interface JoinInput {
  email: string;
  refCode?: string | null;
  source?: SignupSource;
  ipHash?: string | null;
  userAgent?: string | null;
  referrerUrl?: string | null;
}

/**
 * Put someone on a list.
 *
 * Order matters and is deliberate:
 *  1. Syntax — a malformed address never reaches the database.
 *  2. Duplicate — one canonical address is one position, always.
 *  3. Capacity — the plan cap is checked before anything is written.
 *  4. Attribution — self-referral drops the referrer but keeps the signup; a
 *     founder testing their own page should still land on the list.
 *  5. Fraud — hard signals reject, circumstantial ones quarantine.
 *  6. Insert, in a transaction that also advances the list's join counter.
 */
export async function joinList(list: List, input: JoinInput): Promise<JoinOutcome> {
  const email = input.email.trim();
  if (!isValidEmail(email)) {
    return { kind: "rejected", reason: "That doesn't look like an email address." };
  }
  const canonical = canonicalizeEmail(email);
  const db = getDb();

  const [existing] = await db
    .select()
    .from(signups)
    .where(and(eq(signups.listId, list.id), eq(signups.emailCanonical, canonical)));
  if (existing) return handleDuplicate(list, existing);

  const ownerPlan = await planForList(list);
  const capacity = signupCapacity(ownerPlan, await billableSignupCount(list.id));
  if (!capacity.allowed) {
    return {
      kind: "full",
      reason: "This waitlist is closed for now — it has reached its signup limit.",
    };
  }

  const code = normalizeReferralCode(input.refCode);
  const referrer = code ? await signupByCode(code) : null;
  const sameList = referrer && referrer.listId === list.id ? referrer : null;
  const attribution = resolveAttribution(
    email,
    sameList ? { id: sameList.id, email: sameList.email } : null,
    Boolean(code),
  );

  const fraud = await scoreWithHistory(list.id, {
    email,
    ipHash: input.ipHash,
    userAgent: input.userAgent,
    referrer: attribution.referrerId ? { ipHash: sameList?.ipHash ?? null } : null,
  });
  if (fraud.verdict === "blocked") {
    return {
      kind: "rejected",
      reason: fraud.reasons.some((r) => r.includes("disposable"))
        ? "Disposable addresses can't join this list — use an address you'll actually read."
        : "We couldn't accept that signup.",
    };
  }

  const verifyRequired = list.requireDoubleOptIn;
  const token = verifyRequired ? randomToken() : null;

  const created = await db.transaction(async (tx) => {
    // Same lock, same order as every other writer (see lockList). It is also
    // what makes join_rank unique: two simultaneous signups serialize here
    // rather than both reading the same counter.
    await lockList(tx, list.id);
    const [updated] = await tx
      .update(lists)
      .set({ lastJoinRank: sql`${lists.lastJoinRank} + 1` })
      .where(eq(lists.id, list.id))
      .returning({ joinRank: lists.lastJoinRank });

    const [row] = await tx
      .insert(signups)
      .values({
        listId: list.id,
        email,
        emailCanonical: canonical,
        referralCode: await mintCode(tx),
        referredBySignupId: attribution.referrerId,
        joinRank: updated.joinRank,
        boostPoints: 0,
        position: 0,
        status: "pending",
        verifyToken: token,
        fraudScore: fraud.score,
        fraudReasons: fraud.reasons,
        source: input.source ?? "page",
        ipHash: input.ipHash ?? null,
        userAgent: input.userAgent ?? null,
        referrerUrl: input.referrerUrl ?? null,
        lastLinkSentAt: verifyRequired ? new Date() : null,
      })
      .returning();

    await tx.insert(events).values({
      listId: list.id,
      signupId: row.id,
      kind: "signup",
      metadata: {
        source: row.source,
        attribution: attribution.outcome,
        fraudScore: fraud.score,
      },
    });

    return row;
  });

  if (verifyRequired) {
    const mail = verificationEmail({
      productName: list.name,
      verifyUrl: `${appBase()}/verify/${token}`,
    });
    const sent = await sendEmail({ to: created.email, ...mail });
    return { kind: "pending", signup: created, emailSent: !sent.error };
  }

  // Double opt-in off: the signup goes live immediately.
  const activated = await activate(created.id);
  return {
    kind: "joined",
    signup: activated?.signup ?? created,
    position: activated?.position ?? 0,
    total: activated?.total ?? 0,
  };
}

/**
 * Someone who is already on the list submitted again.
 *
 * The response never reveals a position: that would turn the public form into an
 * "is this address on the list" oracle. Instead their own link is mailed to
 * them — useful to the person, useless to a prober — at most once per cooldown.
 */
async function handleDuplicate(list: List, existing: Signup): Promise<JoinOutcome> {
  if (existing.status === "blocked") {
    return { kind: "duplicate", status: existing.status, emailSent: false };
  }

  const last = existing.lastLinkSentAt?.getTime() ?? 0;
  if (Date.now() - last < RESEND_COOLDOWN_MS) {
    return { kind: "duplicate", status: existing.status, emailSent: false };
  }

  const db = getDb();
  let mail: { subject: string; text: string };
  let unsubscribeUrl: string | undefined;

  if (existing.status === "pending" && existing.verifyToken) {
    mail = verificationEmail({
      productName: list.name,
      verifyUrl: `${appBase()}/verify/${existing.verifyToken}`,
    });
  } else {
    const tiers = toRewardTiers(await rewardsFor(list.id));
    const credited = await creditedReferralCount(existing.id);
    const next = nextReward(credited, tiers);
    mail = positionEmail({
      productName: list.name,
      position: existing.position,
      total: await queueSize(list.id),
      shareUrl: shareUrl(pageUrl(list), existing.referralCode),
      positionUrl: positionUrl(list, existing.referralCode),
      nextReward: next ? { label: next.reward.label, remaining: next.remaining } : null,
    });
    unsubscribeUrl = unsubscribeUrlFor(existing.id);
  }

  const sent = await sendEmail({ to: existing.email, ...mail, unsubscribeUrl });
  await db
    .update(signups)
    .set({ lastLinkSentAt: new Date() })
    .where(eq(signups.id, existing.id));
  return { kind: "duplicate", status: existing.status, emailSent: !sent.error };
}

/** Mint a share code that is not already taken. */
async function mintCode(tx: Tx): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = generateReferralCode(secureRandom);
    const [clash] = await tx
      .select({ id: signups.id })
      .from(signups)
      .where(eq(signups.referralCode, code));
    if (!clash) return code;
  }
  // 30^7 ≈ 2×10^10 codes; twelve collisions in a row means something is wrong.
  throw new Error("Could not mint a unique referral code");
}

/* ----------------------------------------------------------- verification --- */

export interface ActivationResult {
  signup: Signup;
  position: number;
  total: number;
  quarantined: boolean;
  /** Set when this activation paid a referrer — drives the live position roll. */
  referrerMove: (BoostMove & { signupId: string }) | null;
  grantedRewards: { label: string; description: string }[];
}

export type VerifyOutcome =
  | { kind: "verified"; list: List; result: ActivationResult }
  | { kind: "already"; list: List; signup: Signup }
  | { kind: "invalid" };

/**
 * Spend a verification token.
 *
 * Idempotent: the status guard in the WHERE clause means only the first click
 * activates. The token is left on the row deliberately so a second click — a
 * double tap, or a mail client prefetching the link — still resolves to the
 * right person and shows them their position instead of an error.
 */
export async function verifySignup(token: string): Promise<VerifyOutcome> {
  const db = getDb();
  // The claim stamps `verified_at` and deliberately leaves the status at
  // `pending`. Flipping the status here instead would publish a row that is in
  // the queue but has no position yet, and a concurrent insert counting it would
  // land on the wrong number. The status changes inside `activate`'s locked
  // transaction, together with the position, or not at all.
  const [claimed] = await db
    .update(signups)
    .set({ verifiedAt: new Date() })
    .where(
      and(
        eq(signups.verifyToken, token),
        eq(signups.status, "pending"),
        isNull(signups.verifiedAt),
      ),
    )
    .returning();

  if (claimed) {
    const result = await activate(claimed.id);
    const [list] = await db.select().from(lists).where(eq(lists.id, claimed.listId));
    if (!result || !list) return { kind: "invalid" };
    return { kind: "verified", list, result };
  }

  const [existing] = await db.select().from(signups).where(eq(signups.verifyToken, token));
  if (!existing) return { kind: "invalid" };
  const [list] = await db.select().from(lists).where(eq(lists.id, existing.listId));
  if (!list) return { kind: "invalid" };
  return { kind: "already", list, signup: existing };
}

/**
 * Bring a verified row into the queue, credit its referrer, check rewards, and
 * fan out webhooks. Shared by the double-opt-in path, the no-opt-in path, and
 * the review queue's approve action, so all three behave identically.
 */
export async function activate(signupId: string): Promise<ActivationResult | null> {
  const db = getDb();
  const [row] = await db.select().from(signups).where(eq(signups.id, signupId));
  if (!row) return null;
  const [list] = await db.select().from(lists).where(eq(lists.id, row.listId));
  if (!list) return null;

  // Re-score with the confirmed address and the traffic seen since: quarantine
  // happens here, so a flagged signup keeps its place but pays no referrer.
  const fraud = await scoreWithHistory(
    list.id,
    {
      email: row.email,
      ipHash: row.ipHash,
      userAgent: row.userAgent,
      referrer: row.referredBySignupId ? await referrerSignals(row.referredBySignupId) : null,
    },
    row.id,
  );
  // Both `review` and `blocked` verdicts quarantine here rather than reject.
  // The address is confirmed and already holds a place in line by this point;
  // silently deleting someone's position on a heuristic — after they clicked a
  // link we sent them — is worse than putting the decision in front of a human.
  // Hard rejection only happens at join time, before a position exists.
  const quarantined = fraud.verdict !== "ok";

  const placed = await db.transaction(async (tx) => {
    await lockList(tx, list.id);
    const [fresh] = await tx.select().from(signups).where(eq(signups.id, signupId));
    const [updated] = await tx
      .update(signups)
      .set({
        status: quarantined ? "review" : "active",
        verifiedAt: fresh.verifiedAt ?? new Date(),
        fraudScore: fraud.score,
        fraudReasons: fraud.reasons,
      })
      .where(eq(signups.id, signupId))
      .returning();

    const position = fresh.position > 0 ? fresh.position : await queueInsert(tx, updated);

    await tx.insert(events).values({
      listId: list.id,
      signupId,
      kind: "verified",
      metadata: { position, status: updated.status },
    });

    return { ...updated, position };
  });

  let referrerMove: (BoostMove & { signupId: string }) | null = null;
  if (!quarantined && row.referredBySignupId && !row.referralCredited) {
    referrerMove = await creditReferral(signupId);
  }

  // A tier with threshold 0 exists on some lists ("just for joining").
  const grantedRewards = await grantRewards(signupId);

  if (!quarantined && featureAllowed(await planForList(list), "webhooks")) {
    await enqueueSignupWebhooks(placed, list);
  }

  const [finalRow] = await db.select().from(signups).where(eq(signups.id, signupId));
  return {
    signup: finalRow ?? placed,
    position: finalRow?.position ?? placed.position,
    total: await queueSize(list.id),
    quarantined,
    referrerMove,
    grantedRewards,
  };
}

/**
 * Pay a referrer for one confirmed referral.
 *
 * The latch (`referral_credited`) is set in the same transaction as the boost and
 * only from false, so concurrent calls for the same signup produce exactly one
 * payment (invariant I3).
 */
export async function creditReferral(
  signupId: string,
): Promise<(BoostMove & { signupId: string }) | null> {
  const db = getDb();

  // Read the row before opening the transaction, only to learn which list to
  // lock. It may be stale — the WHERE clause below is the actual guard.
  const known = await signupById(signupId);
  if (!known?.referredBySignupId) return null;

  const move = await db.transaction(async (tx) => {
    await lockList(tx, known.listId);
    const [claimed] = await tx
      .update(signups)
      .set({ referralCredited: true })
      .where(and(eq(signups.id, signupId), eq(signups.referralCredited, false)))
      .returning();
    if (!claimed?.referredBySignupId) return null;

    const [list] = await tx.select().from(lists).where(eq(lists.id, claimed.listId));
    const credited = await countCredited(tx, claimed.referredBySignupId);
    const applied = await applyBoost(
      tx,
      claimed.referredBySignupId,
      boostPointsFor(credited, list.boostPerReferral, list.maxBoost),
    );
    if (!applied) return null;

    await tx.insert(events).values({
      listId: claimed.listId,
      signupId: claimed.referredBySignupId,
      kind: "referral",
      metadata: { from: applied.before, to: applied.after, delta: applied.delta },
    });

    return { ...applied, signupId: claimed.referredBySignupId };
  });

  if (move) await grantRewards(move.signupId);
  return move;
}

/** Undo a credited referral — used when a quarantined signup is rejected. */
export async function revokeReferral(signupId: string): Promise<void> {
  const db = getDb();
  const known = await signupById(signupId);
  if (!known?.referredBySignupId) return;

  await db.transaction(async (tx) => {
    await lockList(tx, known.listId);
    const [claimed] = await tx
      .update(signups)
      .set({ referralCredited: false })
      .where(and(eq(signups.id, signupId), eq(signups.referralCredited, true)))
      .returning();
    if (!claimed?.referredBySignupId) return;

    const [list] = await tx.select().from(lists).where(eq(lists.id, claimed.listId));
    const credited = await countCredited(tx, claimed.referredBySignupId);
    await applyBoost(
      tx,
      claimed.referredBySignupId,
      boostPointsFor(credited, list.boostPerReferral, list.maxBoost),
    );
  });
}

async function countCredited(tx: Tx, referrerId: string): Promise<number> {
  const [row] = await tx
    .select({ n: countRows() })
    .from(signups)
    .where(and(eq(signups.referredBySignupId, referrerId), eq(signups.referralCredited, true)));
  return Number(row?.n ?? 0);
}

/* ---------------------------------------------------------------- rewards --- */

/**
 * Grant any tier this person now qualifies for and mail them about it.
 *
 * The unique index on (signup_id, reward_id) is the guard: `onConflictDoNothing`
 * plus `returning()` means only the insert that actually created a row sends an
 * email, however many times this runs.
 */
export async function grantRewards(
  signupId: string,
): Promise<{ label: string; description: string }[]> {
  const db = getDb();
  const [row] = await db.select().from(signups).where(eq(signups.id, signupId));
  if (!row) return [];
  const [list] = await db.select().from(lists).where(eq(lists.id, row.listId));
  if (!list) return [];

  const credited = await creditedReferralCount(signupId);
  const tiers = await db
    .select()
    .from(rewards)
    .where(and(eq(rewards.listId, row.listId), lte(rewards.threshold, credited)))
    .orderBy(asc(rewards.threshold));
  if (!tiers.length) return [];

  const granted: { label: string; description: string }[] = [];
  for (const tier of tiers) {
    const inserted = await db
      .insert(rewardGrants)
      .values({ signupId, rewardId: tier.id })
      .onConflictDoNothing()
      .returning();
    if (!inserted.length) continue;

    granted.push({ label: tier.label, description: tier.description });
    await db.insert(events).values({
      listId: row.listId,
      signupId,
      kind: "reward",
      metadata: { reward: tier.label, threshold: tier.threshold },
    });

    if (row.status === "unsubscribed") continue;
    const mail = rewardEmail({
      productName: list.name,
      rewardLabel: tier.label,
      rewardDescription: tier.description || "You've unlocked a new tier.",
      position: row.position,
      positionUrl: positionUrl(list, row.referralCode),
    });
    const sent = await sendEmail({
      to: row.email,
      ...mail,
      unsubscribeUrl: unsubscribeUrlFor(signupId),
    });
    if (!sent.error) {
      await db
        .update(rewardGrants)
        .set({ notifiedAt: new Date() })
        .where(and(eq(rewardGrants.signupId, signupId), eq(rewardGrants.rewardId, tier.id)));
    }
  }
  return granted;
}

/* ----------------------------------------------------------- review queue --- */

/** Clear a flagged signup: it becomes active and its referral finally pays. */
export async function approveSignup(signupId: string): Promise<void> {
  const db = getDb();
  const [row] = await db.select().from(signups).where(eq(signups.id, signupId));
  if (!row || row.status !== "review") return;

  // The status change and the queue insert are one transaction under the list
  // lock, so no other writer can see an in-queue row without a position.
  await db.transaction(async (tx) => {
    await lockList(tx, row.listId);
    const [fresh] = await tx
      .update(signups)
      .set({ status: "active", reviewedAt: new Date(), fraudScore: 0, fraudReasons: [] })
      .where(and(eq(signups.id, signupId), eq(signups.status, "review")))
      .returning();
    if (fresh && fresh.position <= 0) await queueInsert(tx, fresh);
  });

  if (row.referredBySignupId && !row.referralCredited) await creditReferral(signupId);
  await grantRewards(signupId);
}

/** Reject a flagged signup: it leaves the queue and stops paying its referrer. */
export async function rejectSignup(signupId: string): Promise<void> {
  const db = getDb();
  const [row] = await db.select().from(signups).where(eq(signups.id, signupId));
  if (!row) return;
  if (row.referralCredited) await revokeReferral(signupId);
  await db.transaction(async (tx) => {
    await lockList(tx, row.listId);
    const [fresh] = await tx.select().from(signups).where(eq(signups.id, signupId));
    await queueRemove(tx, fresh);
    await tx
      .update(signups)
      .set({ status: "blocked", reviewedAt: new Date() })
      .where(eq(signups.id, signupId));
  });
}

/* ----------------------------------------------------------- unsubscribes --- */

/**
 * Honour an unsubscribe. The position is kept: someone who wants no more email
 * still earned their place, and removing it would silently rewrite everyone
 * else's number.
 */
export async function unsubscribeSignup(signupId: string): Promise<Signup | null> {
  const db = getDb();
  const [row] = await db
    .update(signups)
    .set({ status: "unsubscribed", unsubscribedAt: new Date() })
    .where(and(eq(signups.id, signupId), inArray(signups.status, [...IN_QUEUE])))
    .returning();
  if (!row) return null;
  await db.insert(events).values({ listId: row.listId, signupId, kind: "unsubscribe" });
  return row;
}

export function unsubscribeUrlFor(signupId: string): string {
  return `${appBase()}/unsubscribe/${unsubscribeToken(signupId, env.authSecret)}`;
}

/* ------------------------------------------------------------------ reads --- */

export async function signupByCode(code: string): Promise<Signup | null> {
  const db = getDb();
  const [row] = await db.select().from(signups).where(eq(signups.referralCode, code));
  return row ?? null;
}

export async function signupById(id: string): Promise<Signup | null> {
  const db = getDb();
  const [row] = await db.select().from(signups).where(eq(signups.id, id));
  return row ?? null;
}

export async function creditedReferralCount(signupId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: countRows() })
    .from(signups)
    .where(and(eq(signups.referredBySignupId, signupId), eq(signups.referralCredited, true)));
  return Number(row?.n ?? 0);
}

/** How many people are in line — the denominator for "top 12%". */
export async function queueSize(listId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: countRows() })
    .from(signups)
    .where(and(eq(signups.listId, listId), inArray(signups.status, [...IN_QUEUE])));
  return Number(row?.n ?? 0);
}

export interface QueueView {
  signup: Signup;
  list: List;
  total: number;
  creditedReferrals: number;
  /** Referrals confirmed but held in review — shown honestly, not silently. */
  pendingReferrals: number;
  tiers: RewardTier[];
  grantedRewardIds: string[];
  shareLink: string;
}

/** Everything the position page needs, in one call. */
export async function queueView(code: string): Promise<QueueView | null> {
  const db = getDb();
  const signup = await signupByCode(code);
  if (!signup) return null;
  const [list] = await db.select().from(lists).where(eq(lists.id, signup.listId));
  if (!list) return null;

  const [total, credited, tierRows, grants, held] = await Promise.all([
    queueSize(list.id),
    creditedReferralCount(signup.id),
    rewardsFor(list.id),
    db.select().from(rewardGrants).where(eq(rewardGrants.signupId, signup.id)),
    db
      .select({ n: countRows() })
      .from(signups)
      .where(
        and(
          eq(signups.referredBySignupId, signup.id),
          eq(signups.referralCredited, false),
          inArray(signups.status, ["pending", "review"]),
        ),
      ),
  ]);

  return {
    signup,
    list,
    total,
    creditedReferrals: credited,
    pendingReferrals: Number(held[0]?.n ?? 0),
    tiers: toRewardTiers(tierRows),
    grantedRewardIds: grants.map((g) => g.rewardId),
    shareLink: shareUrl(pageUrl(list), signup.referralCode),
  };
}

/* --------------------------------------------------------- fraud plumbing --- */

async function referrerSignals(referrerId: string): Promise<{ ipHash: string | null } | null> {
  const row = await signupById(referrerId);
  return row ? { ipHash: row.ipHash } : null;
}

/**
 * Gather the history-dependent signals (IP clustering, velocity) and score.
 * Kept out of fraud.ts so that module stays pure and exhaustively testable.
 */
async function scoreWithHistory(
  listId: string,
  base: {
    email: string;
    ipHash?: string | null;
    userAgent?: string | null;
    referrer?: { ipHash: string | null } | null;
  },
  excludeSignupId?: string,
): Promise<FraudResult> {
  let sameIpCount = 0;
  let sameIpRecentCount = 0;
  if (base.ipHash) {
    const db = getDb();
    const [row] = await db
      .select({
        total: countRows(),
        recent: sql<number>`count(*) filter (where ${signups.createdAt} > now() - interval '1 hour')`,
      })
      .from(signups)
      .where(
        and(
          eq(signups.listId, listId),
          eq(signups.ipHash, base.ipHash),
          ne(signups.status, "blocked"),
          excludeSignupId ? ne(signups.id, excludeSignupId) : undefined,
        ),
      );
    sameIpCount = Number(row?.total ?? 0);
    sameIpRecentCount = Number(row?.recent ?? 0);
  }
  return scoreSignup({ ...base, sameIpCount, sameIpRecentCount });
}

/** The plan of the founder who owns a list. */
export async function planForList(list: Pick<List, "userId">): Promise<PlanId> {
  const db = getDb();
  const [owner] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, list.userId));
  return owner?.plan ?? "free";
}

/* ------------------------------------------------------- webhook dispatch --- */

/**
 * Queue a signup event for every active endpoint on the list. Delivery happens
 * in the cron route / worker so a slow customer endpoint can never make a
 * visitor wait on the hosted page.
 */
export async function enqueueSignupWebhooks(signup: Signup, list: List): Promise<number> {
  const db = getDb();
  const endpoints = await db
    .select()
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.listId, list.id), eq(webhookEndpoints.active, true)));
  if (!endpoints.length) return 0;

  const payload = {
    event: "signup.verified",
    list: { id: list.id, slug: list.slug, name: list.name },
    signup: {
      id: signup.id,
      email: signup.email,
      position: signup.position,
      referralCode: signup.referralCode,
      referredBy: signup.referredBySignupId,
      source: signup.source,
      createdAt: signup.createdAt.toISOString(),
    },
  };

  await db
    .insert(webhookDeliveries)
    .values(endpoints.map((e) => ({ endpointId: e.id, eventKind: "verified" as const, payload })));
  return endpoints.length;
}

/* -------------------------------------------------------------- dashboard --- */

export interface FeedRow {
  signup: Signup;
  referrerEmail: string | null;
}

/** The live join feed: newest first, with who referred them. */
export async function joinFeed(listId: string, limit = 25): Promise<FeedRow[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(signups)
    .where(eq(signups.listId, listId))
    .orderBy(desc(signups.createdAt))
    .limit(limit);

  const referrerIds = [
    ...new Set(rows.map((r) => r.referredBySignupId).filter((v): v is string => Boolean(v))),
  ];
  const referrers = referrerIds.length
    ? await db
        .select({ id: signups.id, email: signups.email })
        .from(signups)
        .where(inArray(signups.id, referrerIds))
    : [];
  const byId = new Map(referrers.map((r) => [r.id, r.email]));

  return rows.map((signup) => ({
    signup,
    referrerEmail: signup.referredBySignupId
      ? byId.get(signup.referredBySignupId) ?? null
      : null,
  }));
}

export interface LeaderRow {
  signup: Signup;
  referrals: number;
}

/**
 * Credited referrals for the row being selected.
 *
 * The outer table is referenced by *name* (`signups.id`) rather than by passing
 * the Column object: drizzle renders a Column inside a select-list `sql`
 * fragment unqualified — as `"id"` — which inside this subquery binds to the
 * inner alias `r` instead of the outer row, so the count is silently always
 * zero. It renders qualified in WHERE and ORDER BY, which is what made the bug
 * survive a green build: only the leaderboard's select list was wrong.
 */
const creditedSubquery = sql<number>`(
  select count(*) from signups r
  where r.referred_by_signup_id = signups.id and r.referral_credited = true
)`;

/** Referral leaderboard: most credited referrals first, position as tie-break. */
export async function leaderboard(listId: string, limit = 20): Promise<LeaderRow[]> {
  const db = getDb();
  const rows = await db
    .select({ signup: signups, referrals: creditedSubquery })
    .from(signups)
    .where(and(eq(signups.listId, listId), inArray(signups.status, [...IN_QUEUE])))
    .orderBy(desc(creditedSubquery), asc(signups.position))
    .limit(limit);
  return rows
    .map((r) => ({ signup: r.signup, referrals: Number(r.referrals) }))
    .filter((r) => r.referrals > 0);
}

/** Signup sources, biggest first. */
export async function sourceBreakdown(
  listId: string,
): Promise<{ source: SignupSource; count: number }[]> {
  const db = getDb();
  const rows = await db
    .select({ source: signups.source, n: countRows() })
    .from(signups)
    .where(and(eq(signups.listId, listId), ne(signups.status, "blocked")))
    .groupBy(signups.source);
  return rows
    .map((r) => ({ source: r.source, count: Number(r.n) }))
    .sort((a, b) => b.count - a.count);
}

/** Rows waiting on a human decision. */
export async function reviewQueue(listId: string, limit = 50): Promise<Signup[]> {
  const db = getDb();
  return db
    .select()
    .from(signups)
    .where(and(eq(signups.listId, listId), eq(signups.status, "review")))
    .orderBy(desc(signups.fraudScore), desc(signups.createdAt))
    .limit(limit);
}

/** The signup table for the founder, in queue order. */
export async function signupPage(
  listId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<Signup[]> {
  const db = getDb();
  return db
    .select()
    .from(signups)
    .where(and(eq(signups.listId, listId), inArray(signups.status, [...IN_QUEUE])))
    .orderBy(asc(signups.position))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
}

/** Every row, for CSV export. */
export async function allSignups(listId: string): Promise<Signup[]> {
  const db = getDb();
  return db.select().from(signups).where(eq(signups.listId, listId)).orderBy(asc(signups.joinRank));
}

/** Referral counts for a batch of signups — used by the export and the table. */
export async function creditedCountsFor(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const db = getDb();
  const rows = await db
    .select({ id: signups.referredBySignupId, n: countRows() })
    .from(signups)
    .where(
      and(inArray(signups.referredBySignupId, ids), eq(signups.referralCredited, true)),
    )
    .groupBy(signups.referredBySignupId);
  const out = new Map<string, number>();
  for (const row of rows) if (row.id) out.set(row.id, Number(row.n));
  return out;
}
