import "@/lib/load-env";
import { and, eq, inArray, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { signups, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { createList } from "@/lib/lists";
import {
  IN_QUEUE,
  activate,
  creditedReferralCount,
  joinList,
  queueSize,
  signupByCode,
  verifySignup,
} from "@/lib/signups";
import { computePositions } from "@/lib/referrals";

let fails = 0;
function ok(label: string, cond: boolean, detail?: unknown) {
  console.log(`  ${cond ? "ok  " : "FAIL"} ${label}${cond ? "" : ` — ${JSON.stringify(detail)}`}`);
  if (!cond) fails++;
}

async function main() {
  const db = getDb();
  await db.delete(users).where(sql`${users.email} like 'conc-%'`);
  const [u] = await db
    .insert(users)
    .values({ email: "conc-a@example.com", passwordHash: await hashPassword("xxxxxxxx"), plan: "pro" })
    .returning();
  const list = await createList(u, { name: "Concurrency Test" });

  console.log("\nA. 40 simultaneous joins");
  const joins = await Promise.all(
    Array.from({ length: 40 }, (_, i) =>
      joinList(list, { email: `conc-j${i}@example.com`, ipHash: `ip-${i}`, userAgent: "x" }),
    ),
  );
  ok("all 40 accepted", joins.every((j) => j.kind === "pending"), joins.map((j) => j.kind));
  const ranks = await db
    .select({ rank: signups.joinRank })
    .from(signups)
    .where(eq(signups.listId, list.id));
  const unique = new Set(ranks.map((r) => r.rank));
  ok("join_rank is unique across concurrent inserts", unique.size === ranks.length, {
    rows: ranks.length,
    unique: unique.size,
  });
  ok("join_rank is 1..40 with no gaps", [...unique].sort((a, b) => a - b).every((r, i) => r === i + 1));

  const codes = await db
    .select({ code: signups.referralCode })
    .from(signups)
    .where(eq(signups.listId, list.id));
  ok("referral codes are unique", new Set(codes.map((c) => c.code)).size === codes.length);

  console.log("\nB. 40 simultaneous confirmations");
  const tokens = await db
    .select({ token: signups.verifyToken })
    .from(signups)
    .where(eq(signups.listId, list.id));
  await Promise.all(tokens.map((t) => verifySignup(t.token!)));
  const size = await queueSize(list.id);
  ok("all 40 are in the queue", size === 40, size);
  await integrity(list.id, "after concurrent confirms");

  console.log("\nC. Same person confirmed 10 times at once");
  const [one] = await db.select().from(signups).where(eq(signups.listId, list.id)).limit(1);
  const posBefore = one.position;
  await Promise.all(Array.from({ length: 10 }, () => verifySignup(one.verifyToken!)));
  const [oneAfter] = await db.select().from(signups).where(eq(signups.id, one.id));
  ok("position unchanged by 10 concurrent confirms", oneAfter.position === posBefore, {
    posBefore,
    after: oneAfter.position,
  });
  await integrity(list.id, "after repeated confirms");

  console.log("\nD. 8 referrals to the same referrer, confirmed simultaneously");
  const [referrer] = await db
    .select()
    .from(signups)
    .where(and(eq(signups.listId, list.id), eq(signups.joinRank, 40)));
  const kids = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      joinList(list, {
        email: `conc-k${i}@example.com`,
        refCode: referrer.referralCode,
        ipHash: `kid-${i}`,
        userAgent: "x",
      }),
    ),
  );
  ok("all referred signups accepted", kids.every((k) => k.kind === "pending"), kids.map((k) => k.kind));
  const kidTokens = kids.map((k) => (k.kind === "pending" ? k.signup.verifyToken! : ""));
  await Promise.all(kidTokens.map((t) => verifySignup(t)));

  const credited = await creditedReferralCount(referrer.id);
  ok("exactly 8 referrals credited", credited === 8, credited);
  const after = await signupByCode(referrer.referralCode);
  ok("boost is 8 × 50 = 400", after!.boostPoints === 400, after!.boostPoints);
  ok("referrer is #1", after!.position === 1, after!.position);
  await integrity(list.id, "after concurrent referral credits");

  console.log("\nE. Repeated activation of the same referred signup");
  const [aKid] = await db
    .select()
    .from(signups)
    .where(eq(signups.email, "conc-k0@example.com"));
  await Promise.all(Array.from({ length: 6 }, () => activate(aKid.id)));
  ok("credit count still 8", (await creditedReferralCount(referrer.id)) === 8, await creditedReferralCount(referrer.id));
  ok("boost still 400", (await signupByCode(referrer.referralCode))!.boostPoints === 400);
  await integrity(list.id, "after concurrent re-activation");

  await db.delete(users).where(eq(users.id, u.id));
  console.log(fails === 0 ? "\nall concurrency checks passed" : `\n${fails} FAILURES`);
  await closeDb();
  process.exit(fails ? 1 : 0);
}

async function integrity(listId: string, label: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(signups)
    .where(and(eq(signups.listId, listId), inArray(signups.status, [...IN_QUEUE])));
  const oracle = computePositions(
    rows.map((r) => ({ id: r.id, joinRank: r.joinRank, boostPoints: r.boostPoints })),
  );
  const bad = rows.filter((r) => r.position !== oracle.get(r.id));
  const sorted = rows.map((r) => r.position).sort((a, b) => a - b);
  const contiguous = sorted.every((p, i) => p === i + 1);
  ok(`${label}: ${rows.length} rows, positions match recompute and are contiguous`, bad.length === 0 && contiguous, {
    bad: bad.slice(0, 6).map((b) => ({ rank: b.joinRank, pos: b.position, want: oracle.get(b.id) })),
    dupes: sorted.filter((p, i) => sorted[i - 1] === p).slice(0, 6),
  });
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
