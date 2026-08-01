/**
 * Integration tests for the queue — the parts that cannot be proved without a
 * real Postgres, because what is being tested is the SQL.
 *
 * `referrals.test.ts` proves the *arithmetic* (and proves the incremental
 * algorithm can never disagree with a full recompute). This file proves the
 * database implementation of that algorithm agrees with it too, including under
 * concurrency, which is where the interesting bugs live: two people confirming
 * at the same instant is not an edge case on launch day, it is the load.
 *
 * Skipped unless `DATABASE_URL` is set, so `npm test` stays green with no
 * infrastructure. To run it:
 *
 *   DATABASE_URL=postgres://postgres@localhost:5433/app_15_launchlist \
 *   AUTH_SECRET=test-secret npx tsx --test src/lib/queue.integration.test.ts
 */

import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq, inArray, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { lists, signups, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { createList } from "@/lib/lists";
import { computePositions } from "@/lib/referrals";
import {
  IN_QUEUE,
  activate,
  approveSignup,
  creditedReferralCount,
  joinList,
  queueSize,
  rejectSignup,
  signupByCode,
  verifySignup,
} from "@/lib/signups";

const LIVE = Boolean(process.env.DATABASE_URL && process.env.AUTH_SECRET);
const EMAIL_PREFIX = "queue-it-";

/** Assert invariants I1 and I2 from signups.ts directly against the rows. */
async function assertQueueIntact(listId: string, label: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(signups)
    .where(and(eq(signups.listId, listId), inArray(signups.status, [...IN_QUEUE])));

  const oracle = computePositions(
    rows.map((r) => ({ id: r.id, joinRank: r.joinRank, boostPoints: r.boostPoints })),
  );
  for (const row of rows) {
    assert.equal(
      row.position,
      oracle.get(row.id),
      `${label}: join_rank ${row.joinRank} sits at ${row.position}, recompute says ${oracle.get(row.id)}`,
    );
  }

  const positions = rows.map((r) => r.position).sort((a, b) => a - b);
  assert.deepEqual(
    positions,
    Array.from({ length: rows.length }, (_, i) => i + 1),
    `${label}: positions are not 1..N without gaps`,
  );

  const [stray] = await db
    .select({ n: sql<number>`count(*)` })
    .from(signups)
    .where(
      and(
        eq(signups.listId, listId),
        sql`${signups.status} not in ('active','review','unsubscribed')`,
        sql`${signups.position} <> 0`,
      ),
    );
  assert.equal(Number(stray.n), 0, `${label}: a row outside the queue holds a position`);
}

async function freshList(name: string) {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({
      email: `${EMAIL_PREFIX}${name}-owner@example.test`,
      passwordHash: await hashPassword("integration-test-password"),
      plan: "pro",
    })
    .returning();
  return { user, list: await createList(user, { name }) };
}

async function join(listId: string, email: string, opts: { ref?: string; ip?: string } = {}) {
  const db = getDb();
  const [list] = await db.select().from(lists).where(eq(lists.id, listId));
  return joinList(list, {
    email,
    refCode: opts.ref ?? null,
    ipHash: opts.ip ?? `ip-${email}`,
    userAgent: "Mozilla/5.0 (integration test)",
  });
}

async function confirm(listId: string, email: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(signups)
    .where(and(eq(signups.listId, listId), eq(signups.email, email)));
  assert.ok(row?.verifyToken, `no verify token for ${email}`);
  return verifySignup(row.verifyToken!);
}

describe("queue against a real database", { skip: !LIVE && "DATABASE_URL is not set" }, () => {
  after(async () => {
    if (!LIVE) return;
    const db = getDb();
    await db.delete(users).where(sql`${users.email} like ${EMAIL_PREFIX + "%"}`);
    await closeDb();
  });

  it("only a confirmed signup takes a place in line", async () => {
    const { list } = await freshList("holds-place");
    const result = await join(list.id, `${EMAIL_PREFIX}a@example.test`);
    assert.equal(result.kind, "pending");
    if (result.kind === "pending") assert.equal(result.signup.position, 0);
    assert.equal(await queueSize(list.id), 0);

    const confirmed = await confirm(list.id, `${EMAIL_PREFIX}a@example.test`);
    assert.equal(confirmed.kind, "verified");
    assert.equal(await queueSize(list.id), 1);
    await assertQueueIntact(list.id, "one confirmed signup");
  });

  it("collapses the four ways of writing one address into one position", async () => {
    const { list } = await freshList("dedupe");
    const first = await join(list.id, `${EMAIL_PREFIX}dd@gmail.com`);
    assert.equal(first.kind, "pending");

    for (const variant of [
      `${EMAIL_PREFIX}dd+launch@gmail.com`,
      `${EMAIL_PREFIX.toUpperCase()}DD@GMAIL.COM`,
      `${EMAIL_PREFIX}d.d@gmail.com`.replace("d.d", "dd"),
    ]) {
      const dup = await join(list.id, variant);
      assert.equal(dup.kind, "duplicate", `${variant} should be a duplicate`);
    }

    const db = getDb();
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(signups)
      .where(eq(signups.listId, list.id));
    assert.equal(Number(row.n), 1);
  });

  it("a confirmed referral moves the referrer up and shifts exactly the people passed", async () => {
    const { list } = await freshList("jump");
    for (let i = 1; i <= 10; i++) {
      const email = `${EMAIL_PREFIX}j${i}@example.test`;
      await join(list.id, email, { ip: `jump-ip-${i}` });
      await confirm(list.id, email);
    }
    await assertQueueIntact(list.id, "ten in line");

    const db = getDb();
    const [last] = await db
      .select()
      .from(signups)
      .where(and(eq(signups.listId, list.id), eq(signups.joinRank, 10)));
    assert.equal(last.position, 10);

    await join(list.id, `${EMAIL_PREFIX}friend@example.test`, {
      ref: last.referralCode,
      ip: "friend-ip",
    });
    assert.equal((await signupByCode(last.referralCode))!.position, 10, "no credit before confirming");

    const result = await confirm(list.id, `${EMAIL_PREFIX}friend@example.test`);
    assert.equal(result.kind, "verified");
    if (result.kind === "verified") {
      assert.ok(result.result.referrerMove, "the move should be reported for the roll");
      assert.equal(result.result.referrerMove!.before, 10);
      assert.equal(result.result.referrerMove!.after, 1);
      assert.equal(result.result.referrerMove!.delta, 9);
    }

    const moved = await signupByCode(last.referralCode);
    assert.equal(moved!.boostPoints, 50);
    assert.equal(moved!.position, 1);
    await assertQueueIntact(list.id, "after the jump");
  });

  it("pays a referral exactly once, however many times activation runs", async () => {
    const { list } = await freshList("once");
    await join(list.id, `${EMAIL_PREFIX}o-ref@example.test`, { ip: "once-a" });
    await confirm(list.id, `${EMAIL_PREFIX}o-ref@example.test`);
    const referrer = (await getDb()
      .select()
      .from(signups)
      .where(and(eq(signups.listId, list.id), eq(signups.joinRank, 1))))[0];

    await join(list.id, `${EMAIL_PREFIX}o-kid@example.test`, {
      ref: referrer.referralCode,
      ip: "once-b",
    });
    const [kid] = await getDb()
      .select()
      .from(signups)
      .where(eq(signups.email, `${EMAIL_PREFIX}o-kid@example.test`));

    await verifySignup(kid.verifyToken!);
    // Re-run the whole activation, twice, and concurrently.
    await Promise.all([activate(kid.id), activate(kid.id), activate(kid.id)]);
    await verifySignup(kid.verifyToken!);

    assert.equal(await creditedReferralCount(referrer.id), 1);
    assert.equal((await signupByCode(referrer.referralCode))!.boostPoints, 50);
    await assertQueueIntact(list.id, "after repeated activation");
  });

  it("holds a same-network referral for review, then settles the maths either way", async () => {
    const { list } = await freshList("review");
    await join(list.id, `${EMAIL_PREFIX}r-ref@example.test`, { ip: "shared-network" });
    await confirm(list.id, `${EMAIL_PREFIX}r-ref@example.test`);
    const [referrer] = await getDb()
      .select()
      .from(signups)
      .where(and(eq(signups.listId, list.id), eq(signups.joinRank, 1)));

    await join(list.id, `${EMAIL_PREFIX}r-sock@example.test`, {
      ref: referrer.referralCode,
      ip: "shared-network",
    });
    const result = await confirm(list.id, `${EMAIL_PREFIX}r-sock@example.test`);
    assert.equal(result.kind, "verified");
    if (result.kind === "verified") assert.equal(result.result.quarantined, true);

    const [sock] = await getDb()
      .select()
      .from(signups)
      .where(eq(signups.email, `${EMAIL_PREFIX}r-sock@example.test`));
    assert.equal(sock.status, "review");
    assert.ok(sock.position > 0, "a quarantined signup keeps its place in line");
    assert.equal(
      (await signupByCode(referrer.referralCode))!.boostPoints,
      0,
      "a held referral must not pay the referrer",
    );

    await approveSignup(sock.id);
    assert.equal((await signupByCode(referrer.referralCode))!.boostPoints, 50);
    await assertQueueIntact(list.id, "after approve");

    await rejectSignup(sock.id);
    assert.equal((await signupByCode(referrer.referralCode))!.boostPoints, 0, "rejecting revokes");
    const [rejected] = await getDb().select().from(signups).where(eq(signups.id, sock.id));
    assert.equal(rejected.position, 0);
    await assertQueueIntact(list.id, "after reject");
  });

  it("survives simultaneous joins and confirmations", async () => {
    const { list } = await freshList("concurrent");
    const N = 24;

    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        join(list.id, `${EMAIL_PREFIX}c${i}@example.test`, { ip: `conc-ip-${i}` }),
      ),
    );

    const db = getDb();
    const rows = await db.select().from(signups).where(eq(signups.listId, list.id));
    assert.equal(rows.length, N);
    assert.equal(new Set(rows.map((r) => r.joinRank)).size, N, "join_rank must be unique");
    assert.equal(new Set(rows.map((r) => r.referralCode)).size, N, "codes must be unique");

    // The failure this catches: concurrent bulk position shifts deadlocking, or
    // an in-queue row being visible before it has a position.
    await Promise.all(rows.map((r) => verifySignup(r.verifyToken!)));
    assert.equal(await queueSize(list.id), N);
    await assertQueueIntact(list.id, "after concurrent confirmations");
  });

  it("survives many referrals to one referrer confirming at once", async () => {
    const { list } = await freshList("fanin");
    await join(list.id, `${EMAIL_PREFIX}f-ref@example.test`, { ip: "fanin-ref" });
    await confirm(list.id, `${EMAIL_PREFIX}f-ref@example.test`);
    const [referrer] = await getDb()
      .select()
      .from(signups)
      .where(and(eq(signups.listId, list.id), eq(signups.joinRank, 1)));

    const K = 8;
    await Promise.all(
      Array.from({ length: K }, (_, i) =>
        join(list.id, `${EMAIL_PREFIX}f${i}@example.test`, {
          ref: referrer.referralCode,
          ip: `fanin-kid-${i}`,
        }),
      ),
    );
    const kids = await getDb()
      .select()
      .from(signups)
      .where(and(eq(signups.listId, list.id), eq(signups.status, "pending")));
    await Promise.all(kids.map((k) => verifySignup(k.verifyToken!)));

    assert.equal(await creditedReferralCount(referrer.id), K);
    const moved = await signupByCode(referrer.referralCode);
    assert.equal(moved!.boostPoints, 50 * K);
    assert.equal(moved!.position, 1);
    await assertQueueIntact(list.id, "after concurrent referral credits");
  });
});
