/**
 * Throwaway end-to-end verification against the real database.
 * Deleted before finishing; anything worth keeping becomes a unit test.
 */
import "@/lib/load-env";
import { and, eq, inArray, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { blasts, events, lists, rewardGrants, signups, users, webhookDeliveries, webhookEndpoints } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { createList, listCounters, pageUrl, positionUrl, rewardsFor, toRewardTiers } from "@/lib/lists";
import {
  IN_QUEUE,
  activate,
  approveSignup,
  creditedReferralCount,
  joinList,
  queueSize,
  queueView,
  rejectSignup,
  recomputePositions,
  signupByCode,
  unsubscribeSignup,
  verifySignup,
  leaderboard,
  sourceBreakdown,
  reviewQueue,
  enqueueSignupWebhooks,
  allSignups,
  creditedCountsFor,
} from "@/lib/signups";
import { computePositions } from "@/lib/referrals";
import { overview } from "@/lib/dashboard";
import { runBlast, segmentSize } from "@/lib/blasts";
import { applyPlan } from "@/lib/billing";
import { hashIp } from "@/lib/fraud";
import { toCsv, SIGNUP_EXPORT_HEADER } from "@/lib/csv";

let failures = 0;
let checks = 0;

function ok(label: string, condition: boolean, detail?: unknown) {
  checks++;
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

function eqCheck(label: string, actual: unknown, expected: unknown) {
  checks++;
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  if (same) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label} — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  }
}

const db = getDb();

/** Assert I1/I2: positions are 1..N and match a full recompute. */
async function assertQueueIntegrity(listId: string, label: string) {
  const rows = await db
    .select()
    .from(signups)
    .where(and(eq(signups.listId, listId), inArray(signups.status, [...IN_QUEUE])));
  const oracle = computePositions(
    rows.map((r) => ({ id: r.id, joinRank: r.joinRank, boostPoints: r.boostPoints })),
  );
  const bad = rows.filter((r) => r.position !== oracle.get(r.id));
  const positions = rows.map((r) => r.position).sort((a, b) => a - b);
  const contiguous = positions.every((p, i) => p === i + 1);
  ok(
    `${label}: DB positions match a full recompute and are contiguous (${rows.length} rows)`,
    bad.length === 0 && contiguous,
    { bad: bad.map((b) => ({ rank: b.joinRank, pos: b.position, want: oracle.get(b.id) })), positions },
  );
  const notInQueue = await db
    .select({ n: sql<number>`count(*)` })
    .from(signups)
    .where(and(eq(signups.listId, listId), sql`${signups.status} not in ('active','review','unsubscribed')`, sql`${signups.position} <> 0`));
  ok(`${label}: rows outside the queue hold position 0`, Number(notInQueue[0]?.n ?? 0) === 0);
}

async function join(list: Awaited<ReturnType<typeof createList>>, email: string, opts: { ref?: string; ip?: string; ua?: string | null; source?: "page" | "widget" | "api" } = {}) {
  return joinList(list, {
    email,
    refCode: opts.ref ?? null,
    source: opts.source ?? "page",
    ipHash: hashIp(opts.ip ?? "198.51.100.1", "test-salt"),
    userAgent: opts.ua === undefined ? "Mozilla/5.0 (iPhone)" : opts.ua,
  });
}

async function confirm(email: string, listId: string) {
  const [row] = await db
    .select()
    .from(signups)
    .where(and(eq(signups.listId, listId), eq(signups.email, email)));
  if (!row?.verifyToken) throw new Error(`no verify token for ${email}`);
  return verifySignup(row.verifyToken);
}

async function main() {
  // ---- clean slate for this run ----
  await db.delete(users).where(sql`${users.email} like 'verify-%@example.com'`);

  console.log("\n1. Account + list creation");
  const [user] = await db
    .insert(users)
    .values({
      email: "verify-founder@example.com",
      name: "Sofia Marchetti",
      passwordHash: await hashPassword("correct horse battery"),
      plan: "free",
    })
    .returning();
  ok("founder created", Boolean(user.id));

  const list = await createList(user, { name: "Ledgerly" });
  ok("list created with slug", list.slug === "ledgerly", list.slug);
  const tiers = await rewardsFor(list.id);
  eqCheck("default reward ladder seeded", tiers.map((t) => t.threshold), [3, 10, 25]);
  ok("page url is reachable form", pageUrl(list).endsWith("/l/ledgerly"), pageUrl(list));

  // second list on free must be refused
  let secondListError: string | null = null;
  try {
    await createList(user, { name: "Bench Notes" });
  } catch (err) {
    secondListError = err instanceof Error ? err.message : "?";
  }
  ok("free plan refuses a second list", Boolean(secondListError), secondListError);

  console.log("\n2. Signup + double opt-in");
  const a = await join(list, "verify-anna@example.com");
  ok("first signup is pending", a.kind === "pending", a.kind);
  if (a.kind === "pending") {
    ok("pending signup holds no position", a.signup.position === 0);
    ok("pending signup got a referral code", a.signup.referralCode.length === 7, a.signup.referralCode);
  }
  eqCheck("pending signup is not counted in the queue", await queueSize(list.id), 0);

  const confirmA = await confirm("verify-anna@example.com", list.id);
  ok("verification activated", confirmA.kind === "verified", confirmA.kind);
  if (confirmA.kind === "verified") {
    eqCheck("first confirmed signup is #1", confirmA.result.position, 1);
    eqCheck("total is 1", confirmA.result.total, 1);
  }
  await assertQueueIntegrity(list.id, "after first confirm");

  // Idempotency: clicking the link again must not re-activate or re-credit.
  const [annaRow] = await db.select().from(signups).where(eq(signups.email, "verify-anna@example.com"));
  const again = await verifySignup(annaRow.verifyToken!);
  ok("second click on the same link is 'already', not an error", again.kind === "already", again.kind);
  const [annaAfter] = await db.select().from(signups).where(eq(signups.id, annaRow.id));
  eqCheck("position unchanged after a second click", annaAfter.position, 1);

  console.log("\n3. Duplicate emails");
  const dup = await join(list, "VERIFY-ANNA+launch@example.com");
  ok("plus-alias + case variant is treated as a duplicate", dup.kind === "duplicate", dup);
  eqCheck("queue size unchanged by the duplicate", await queueSize(list.id), 1);
  const dupCount = await db
    .select({ n: sql<number>`count(*)` })
    .from(signups)
    .where(and(eq(signups.listId, list.id), eq(signups.emailCanonical, "verify-anna@example.com")));
  eqCheck("only one row exists for that canonical address", Number(dupCount[0].n), 1);

  const dupAgain = await join(list, "verify-anna@example.com");
  ok("re-submitting inside the cooldown does not re-send", dupAgain.kind === "duplicate" && dupAgain.emailSent === false, dupAgain);

  console.log("\n4. Referral attribution + the queue jump");
  // Fill the queue so a jump is visible.
  const cohort: string[] = [];
  for (let i = 2; i <= 12; i++) {
    const email = `verify-p${i}@example.com`;
    cohort.push(email);
    await join(list, email, { ip: `198.51.100.${i}` });
    await confirm(email, list.id);
  }
  await assertQueueIntegrity(list.id, "after cohort");
  eqCheck("twelve people in line", await queueSize(list.id), 12);

  const [tail] = await db.select().from(signups).where(eq(signups.email, "verify-p12@example.com"));
  eqCheck("last joiner is #12", tail.position, 12);

  // tail refers someone from a different network
  const referred = await join(list, "verify-friend@example.com", { ref: tail.referralCode, ip: "203.0.113.55" });
  ok("referred signup is pending", referred.kind === "pending", referred.kind);
  if (referred.kind === "pending") {
    eqCheck("attribution recorded", referred.signup.referredBySignupId, tail.id);
  }
  eqCheck("referrer has not moved before confirmation", (await signupByCode(tail.referralCode))!.position, 12);

  const confirmFriend = await confirm("verify-friend@example.com", list.id);
  ok("friend confirmed", confirmFriend.kind === "verified", confirmFriend.kind);
  if (confirmFriend.kind === "verified") {
    ok("the referrer move was reported", confirmFriend.result.referrerMove !== null);
    const move = confirmFriend.result.referrerMove!;
    eqCheck("referrer moved from #12 to #1", [move.before, move.after], [12, 1]);
    eqCheck("delta is 11", move.delta, 11);
  }
  const tailAfter = await signupByCode(tail.referralCode);
  eqCheck("referrer boost is 50", tailAfter!.boostPoints, 50);
  eqCheck("referrer is now #1", tailAfter!.position, 1);
  await assertQueueIntegrity(list.id, "after the jump");

  // The person who was #1 should now be #2.
  const [annaNow] = await db.select().from(signups).where(eq(signups.id, annaRow.id));
  eqCheck("the previous #1 is now #2", annaNow.position, 2);

  console.log("\n5. Credit is paid exactly once");
  const [friendRow] = await db.select().from(signups).where(eq(signups.email, "verify-friend@example.com"));
  const boostBefore = (await signupByCode(tail.referralCode))!.boostPoints;
  await activate(friendRow.id); // re-run activation
  await activate(friendRow.id);
  const boostAfter = (await signupByCode(tail.referralCode))!.boostPoints;
  eqCheck("re-activating does not pay the referrer twice", boostAfter, boostBefore);
  eqCheck("credited referral count is 1", await creditedReferralCount(tail.id), 1);
  await assertQueueIntegrity(list.id, "after repeated activation");

  console.log("\n6. Self-referral");
  const selfRef = await join(list, "verify-p12+alt@example.com", { ref: tail.referralCode });
  ok("self-referral by alias is caught as a duplicate address", selfRef.kind === "duplicate", selfRef);

  // A genuinely different address on the same network as the referrer.
  const [tailRow] = await db.select().from(signups).where(eq(signups.id, tail.id));
  const sameNet = await join(list, "verify-sock@example.com", {
    ref: tail.referralCode,
    ip: "198.51.100.12", // same IP as verify-p12
  });
  ok("same-network signup is accepted", sameNet.kind === "pending", sameNet);
  const confirmSock = await confirm("verify-sock@example.com", list.id);
  ok("same-network signup is quarantined on confirmation", confirmSock.kind === "verified" && confirmSock.result.quarantined, confirmSock);
  eqCheck("quarantined referral did not pay the referrer", (await signupByCode(tail.referralCode))!.boostPoints, 50);
  const [sockRow] = await db.select().from(signups).where(eq(signups.email, "verify-sock@example.com"));
  eqCheck("quarantined row status", sockRow.status, "review");
  ok("quarantined row still holds a position", sockRow.position > 0, sockRow.position);
  ok("quarantine reason recorded", sockRow.fraudReasons.length > 0, sockRow.fraudReasons);
  void tailRow;
  await assertQueueIntegrity(list.id, "after quarantine");

  console.log("\n7. Review queue decisions");
  const queue = await reviewQueue(list.id);
  eqCheck("one row waiting for review", queue.length, 1);

  await approveSignup(sockRow.id);
  const [sockApproved] = await db.select().from(signups).where(eq(signups.id, sockRow.id));
  eqCheck("approved row is active", sockApproved.status, "active");
  eqCheck("approving pays the held referral", (await signupByCode(tail.referralCode))!.boostPoints, 100);
  eqCheck("referrer now has 2 credited referrals", await creditedReferralCount(tail.id), 2);
  await assertQueueIntegrity(list.id, "after approve");

  // Now reject it and confirm the boost is taken back.
  await rejectSignup(sockRow.id);
  const [sockRejected] = await db.select().from(signups).where(eq(signups.id, sockRow.id));
  eqCheck("rejected row is blocked", sockRejected.status, "blocked");
  eqCheck("rejected row left the queue", sockRejected.position, 0);
  eqCheck("rejecting revokes the boost", (await signupByCode(tail.referralCode))!.boostPoints, 50);
  eqCheck("credited count back to 1", await creditedReferralCount(tail.id), 1);
  await assertQueueIntegrity(list.id, "after reject");

  console.log("\n8. Disposable email");
  const burner = await join(list, "throwaway@mailinator.com");
  ok("disposable domain rejected", burner.kind === "rejected", burner);
  if (burner.kind === "rejected") ok("rejection explains itself", burner.reason.includes("Disposable"), burner.reason);
  const burnerRows = await db.select().from(signups).where(eq(signups.email, "throwaway@mailinator.com"));
  eqCheck("no row was written for the disposable address", burnerRows.length, 0);

  console.log("\n9. Malformed input");
  for (const bad of ["", "nope", "a@b", "two words@x.com"]) {
    const result = await join(list, bad);
    ok(`rejects ${JSON.stringify(bad)}`, result.kind === "rejected", result);
  }

  console.log("\n10. Milestone rewards");
  // Give the tail referrer three credited referrals to unlock "Early access".
  for (const email of ["verify-r1@example.com", "verify-r2@example.com"]) {
    await join(list, email, { ref: tail.referralCode, ip: `203.0.113.${email.length}` });
    await confirm(email, list.id);
  }
  eqCheck("three credited referrals", await creditedReferralCount(tail.id), 3);
  const grants = await db
    .select({ rewardId: rewardGrants.rewardId })
    .from(rewardGrants)
    .where(eq(rewardGrants.signupId, tail.id));
  const earlyAccess = tiers.find((t) => t.threshold === 3)!;
  ok("Early access granted at exactly 3 referrals", grants.some((g) => g.rewardId === earlyAccess.id), grants);
  eqCheck("only the 3-referral tier is granted", grants.length, 1);

  // Re-running the grant must not duplicate.
  const { grantRewards } = await import("@/lib/signups");
  const regrant = await grantRewards(tail.id);
  eqCheck("re-granting is a no-op", regrant.length, 0);
  const grantsAfter = await db.select().from(rewardGrants).where(eq(rewardGrants.signupId, tail.id));
  eqCheck("still one grant row", grantsAfter.length, 1);

  console.log("\n11. Position page view");
  const view = await queueView(tail.referralCode);
  ok("queueView resolves", view !== null);
  eqCheck("view reports 3 credited referrals", view!.creditedReferrals, 3);
  eqCheck("view reports position 1", view!.signup.position, 1);
  ok("share link carries the code", view!.shareLink.endsWith(`?ref=${tail.referralCode}`), view!.shareLink);
  ok("position url shape", positionUrl(list, tail.referralCode).includes(`/joined/${tail.referralCode}`));

  console.log("\n12. Unsubscribe keeps the position");
  const [p5] = await db.select().from(signups).where(eq(signups.email, "verify-p5@example.com"));
  const posBefore = p5.position;
  const unsub = await unsubscribeSignup(p5.id);
  eqCheck("unsubscribed", unsub!.status, "unsubscribed");
  eqCheck("position kept", unsub!.position, posBefore);
  await assertQueueIntegrity(list.id, "after unsubscribe");

  console.log("\n13. Dashboard read models");
  const data = await overview(list.id);
  ok("counters present", data.counters.inQueue > 0, data.counters);
  eqCheck("funnel has four stages", data.funnel.length, 4);
  eqCheck("daily curve has 14 points", data.daily.length, 14);
  const board = await leaderboard(list.id);
  ok("leaderboard has the referrer on top", board[0]?.signup.id === tail.id, board.map((b) => [b.signup.email, b.referrals]));
  eqCheck("leaderboard counts 3", board[0]?.referrals, 3);
  const sources = await sourceBreakdown(list.id);
  ok("sources reported", sources.length >= 1, sources);

  console.log("\n14. Plan cap on signups");
  await db.update(users).set({ plan: "free" }).where(eq(users.id, user.id));
  // Pretend the list is at the free cap by inserting filler rows cheaply.
  const filler = Array.from({ length: 250 }, (_, i) => ({
    listId: list.id,
    email: `verify-filler${i}@example.com`,
    emailCanonical: `verify-filler${i}@example.com`,
    referralCode: `F${String(i).padStart(6, "0")}`.slice(0, 7),
    joinRank: 1000 + i,
    position: 0,
    status: "pending" as const,
  }));
  await db.insert(signups).values(filler);
  const full = await join(list, "verify-late@example.com");
  ok("page refuses signups past the plan cap", full.kind === "full", full);
  await db.delete(signups).where(sql`${signups.email} like 'verify-filler%'`);
  const afterClear = await join(list, "verify-late@example.com");
  ok("accepting again once under the cap", afterClear.kind === "pending", afterClear);

  console.log("\n15. Widget source + API source");
  await join(list, "verify-widget@example.com", { ip: "203.0.113.90", source: "widget" });
  await confirm("verify-widget@example.com", list.id);
  const sources2 = await sourceBreakdown(list.id);
  ok("widget source recorded", sources2.some((s) => s.source === "widget"), sources2);

  console.log("\n16. CSV export");
  const rows = await allSignups(list.id);
  const counts = await creditedCountsFor(rows.map((r) => r.id));
  const csv = toCsv(
    SIGNUP_EXPORT_HEADER,
    rows.map((r) => [r.email, r.position, r.joinRank, r.status, r.referralCode, "", counts.get(r.id) ?? 0, r.boostPoints, r.source, r.fraudScore, "", r.createdAt.toISOString()]),
  );
  ok("csv has a header and a row per signup", csv.split("\r\n").length === rows.length + 2, csv.split("\r\n").length);
  ok("csv contains the referrer's code", csv.includes(tail.referralCode));

  console.log("\n17. Blasts (console transport)");
  await applyPlan(user.id, "growth");
  const [freshUser] = await db.select().from(users).where(eq(users.id, user.id));
  eqCheck("plan applied", freshUser.plan, "growth");

  const segAll = await segmentSize(list.id, { segment: "all", value: 0 });
  const segTop = await segmentSize(list.id, { segment: "reward_tier", value: 3 });
  ok("segment 'all' has recipients", segAll > 0, segAll);
  eqCheck("reward_tier(3) matches the one person with 3 referrals", segTop, 1);

  const [blast] = await db
    .insert(blasts)
    .values({
      listId: list.id,
      subject: "Ledgerly is live",
      body: "You're {{position}} of {{total}}. {{page_url}}",
      segment: "all",
      status: "scheduled",
      scheduledAt: new Date(),
    })
    .returning();
  const run = await runBlast(blast, { batchSize: 10, budgetMs: 8000 });
  ok("blast completed", run.done, run);
  eqCheck("sent count equals the segment size", run.sent, segAll);
  const [blastAfter] = await db.select().from(blasts).where(eq(blasts.id, blast.id));
  eqCheck("blast marked sent", blastAfter.status, "sent");

  // Resumability: a second run must not re-send.
  const rerun = await runBlast(blastAfter, { batchSize: 10, budgetMs: 4000 });
  eqCheck("re-running a finished blast sends nothing new", rerun.sent, segAll);

  // Unsubscribed people must not be recipients.
  const unsubEmailIncluded = await db
    .select({ n: sql<number>`count(*)` })
    .from(signups)
    .where(and(eq(signups.listId, list.id), eq(signups.status, "unsubscribed")));
  ok("there is an unsubscribed row to have excluded", Number(unsubEmailIncluded[0].n) === 1);

  console.log("\n18. Webhooks");
  await applyPlan(user.id, "pro");
  const [endpoint] = await db
    .insert(webhookEndpoints)
    .values({ listId: list.id, url: "http://127.0.0.1:9/never", secret: "whsec_test" })
    .returning();
  const [someone] = await db.select().from(signups).where(eq(signups.id, tail.id));
  const queued = await enqueueSignupWebhooks(someone, list);
  eqCheck("one delivery queued", queued, 1);
  const { dueDeliveries, deliver } = await import("@/lib/webhooks");
  const due = await dueDeliveries(5);
  ok("delivery is due", due.length === 1, due.length);
  const attempt = await deliver(due[0]);
  ok("unreachable endpoint fails and is retried, not dropped", attempt.ok === false, attempt);
  const [deliveryRow] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, due[0].id));
  eqCheck("still pending for retry", deliveryRow.status, "pending");
  eqCheck("attempt counted", deliveryRow.attempt, 1);
  ok("next attempt is in the future", deliveryRow.nextAttemptAt.getTime() > Date.now(), deliveryRow.nextAttemptAt);
  void endpoint;

  console.log("\n19. Downgrade behaviour");
  await db.update(lists).set({ badgeHidden: true, customDomain: "waitlist.ledgerly.test", customDomainVerified: true }).where(eq(lists.id, list.id));
  await applyPlan(user.id, "free");
  const [downgraded] = await db.select().from(lists).where(eq(lists.id, list.id));
  eqCheck("badge comes back on downgrade", downgraded.badgeHidden, false);
  eqCheck("custom domain unverified, not deleted", [downgraded.customDomain, downgraded.customDomainVerified], ["waitlist.ledgerly.test", false]);
  const survivors = await queueSize(list.id);
  ok("no signups were lost in the downgrade", survivors > 0, survivors);

  console.log("\n20. Repair path");
  // Corrupt positions deliberately, then repair.
  await db.update(signups).set({ position: 99 }).where(and(eq(signups.listId, list.id), eq(signups.status, "active")));
  const repaired = await recomputePositions(list.id);
  ok("recompute fixed rows", repaired > 0, repaired);
  await assertQueueIntegrity(list.id, "after repair");

  console.log("\n21. Counters and events");
  const counters = await listCounters(list.id);
  ok("counters reflect the run", counters.inQueue > 0 && counters.creditedReferrals === 3, counters);
  const eventKinds = await db
    .select({ kind: events.kind, n: sql<number>`count(*)` })
    .from(events)
    .where(eq(events.listId, list.id))
    .groupBy(events.kind);
  ok("events recorded for signup/verified/referral/reward", eventKinds.length >= 4, eventKinds);

  console.log("\n--- cleanup ---");
  await db.delete(users).where(eq(users.id, user.id));
  const orphans = await db.select({ n: sql<number>`count(*)` }).from(signups).where(eq(signups.listId, list.id));
  eqCheck("deleting the founder cascades the list and its signups", Number(orphans[0].n), 0);

  console.log(`\n${checks - failures}/${checks} checks passed`);
  await closeDb();
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
