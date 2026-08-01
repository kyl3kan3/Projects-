/* Throwaway verification harness — deleted before hand-off. */
import "@/lib/load-env";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import {
  accounts,
  executions,
  findings,
  importBatches,
  setups,
  tradeExecutions,
  tradeImages,
  trades,
  users,
  weeklyReviews,
} from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { importText } from "@/lib/imports";
import { closedTradesFor, listAccounts, previewRebuild, rebuildTrades, tradesThisMonth } from "@/lib/trades";
import { recomputeFindings, listFindings } from "@/lib/findings";
import { formatCents, formatPrice, formatQty, formatR, parsePrice } from "@/lib/money";
import { rMultipleFor } from "@/lib/pipeline";
import { decryptSecret, encryptSecret } from "@/lib/secrets";
import { currentWeekStart, getReview, reviewStreak, saveReview, weekInReview, listReviews } from "@/lib/review";
import { summarize } from "@/lib/analytics";

const db = getDb();
const F = "src/lib/parsers/fixtures";
const pass: string[] = [];
const fail: string[] = [];

async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    pass.push(name);
    console.log(`  ok  ${name}`);
  } catch (err) {
    fail.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    console.log(`FAIL  ${name}\n      ${err instanceof Error ? err.stack : err}`);
  }
}

async function main() {
  // Clean slate for this harness only.
  await db.delete(users).where(sql`email like 'harness%@example.com'`);

  const passwordHash = await hashPassword("correct horse battery staple");
  const [user] = await db
    .insert(users)
    .values({
      email: "harness@example.com",
      passwordHash,
      timezone: "America/New_York",
      plan: "free",
    })
    .returning();
  console.log(`user ${user.id}`);

  await step("password hash verifies, and a wrong password does not", async () => {
    assert.equal(await verifyPassword("correct horse battery staple", user.passwordHash), true);
    assert.equal(await verifyPassword("wrong", user.passwordHash), false);
    assert.equal(await verifyPassword("correct horse battery staple", "garbage"), false);
  });

  const [account] = await db
    .insert(accounts)
    .values({ userId: user.id, broker: "thinkorswim", label: "Schwab · main" })
    .returning();

  /* ------------------------------------------------- 1. import a ToS file --- */

  const tos = readFileSync(`${F}/thinkorswim-account-statement.csv`, "utf8");
  let firstOutcome!: Awaited<ReturnType<typeof importText>>;

  await step("imports a ThinkorSwim statement and reports every row", async () => {
    firstOutcome = await importText({
      user,
      account,
      text: tos,
      filename: "statement.csv",
      source: "upload",
    });
    assert.equal(firstOutcome.ok, true, firstOutcome.refusal ?? "");
    assert.equal(firstOutcome.parserId, "thinkorswim");
    assert.equal(firstOutcome.imported, 8);
    assert.equal(firstOutcome.duplicates, 0);
    assert.equal(firstOutcome.errors.length, 2);
    assert.equal(firstOutcome.matchedTrades, 4);
    assert.equal(firstOutcome.newTrades, 4);
    assert.equal(firstOutcome.openTrades, 0);
  });

  await step("stores fixed-point values that read back exactly", async () => {
    const rows = await db
      .select()
      .from(executions)
      .where(eq(executions.accountId, account.id))
      .orderBy(executions.executedAt);
    assert.equal(rows.length, 8);
    const aapl = rows.find((r) => r.symbol === "AAPL" && r.side === "buy")!;
    assert.equal(formatQty(aapl.qty), "200");
    assert.equal(formatPrice(aapl.price), "241.15");
    assert.equal(aapl.multiplierMilli, 1000);
    assert.equal(aapl.executedAt.toISOString(), "2025-11-04T14:31:12.000Z");
    // The $0.02 fee survives at full precision, not as 0 cents.
    assert.equal(aapl.fees.toString(), "200000000000000000");
    const option = rows.find((r) => r.assetClass === "option")!;
    assert.equal(option.symbol, "AAPL|20260116|C|185000");
    assert.equal(option.multiplierMilli, 100000);
  });

  await step("matched trade P&L in the database equals the hand-checked figures", async () => {
    const rows = await db.select().from(trades).where(eq(trades.accountId, account.id));
    const byKey = new Map(rows.map((t) => [`${t.symbol}:${t.direction}`, t]));
    assert.equal(formatCents(byKey.get("AAPL:long")!.netPnlCents), "$499.92");
    assert.equal(formatCents(byKey.get("AAPL|20260116|C|185000:long")!.netPnlCents), "$228.40");
    assert.equal(formatCents(byKey.get("MESZ5:long")!.netPnlCents), "$39.84");
    assert.equal(formatCents(byKey.get("TSLA:short")!.netPnlCents), "$284.95");
    const total = rows.reduce((sum, t) => sum + t.netPnlCents, 0n);
    assert.equal(formatCents(total), "$1,053.11");
    assert.equal(rows.every((t) => t.status === "closed"), true);
    assert.equal(formatPrice(byKey.get("AAPL:long")!.avgEntry), "241.15");
    assert.equal(formatQty(byKey.get("AAPL:long")!.qtyMax), "200");
  });

  await step("writes the matching audit trail", async () => {
    const rows = await db
      .select()
      .from(tradeExecutions)
      .innerJoin(trades, eq(trades.id, tradeExecutions.tradeId))
      .where(eq(trades.accountId, account.id));
    assert.equal(rows.length, 8, "one leg per fill for these four clean round trips");
  });

  /* -------------------------------------------------------- 2. idempotency --- */

  await step("re-importing the same file changes nothing", async () => {
    const again = await importText({
      user,
      account,
      text: tos,
      filename: "statement.csv",
      source: "upload",
    });
    assert.equal(again.ok, true);
    assert.equal(again.imported, 0);
    assert.equal(again.duplicates, 8);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(executions)
      .where(eq(executions.accountId, account.id));
    assert.equal(count, 8);
  });

  await step("rebuilding twice produces the same trades and the same ids", async () => {
    const before = await db.select().from(trades).where(eq(trades.accountId, account.id));
    const result = await rebuildTrades(account);
    assert.equal(result.matched, 4);
    assert.equal(result.newTrades, 0);
    assert.equal(result.removed, 0);
    const after = await db.select().from(trades).where(eq(trades.accountId, account.id));
    assert.deepEqual(
      before.map((t) => t.id).sort(),
      after.map((t) => t.id).sort(),
      "trade ids are stable across a rebuild",
    );
  });

  /* ------------------------------------- 3. an overlapping partial re-import --- */

  await step("an overlapping export adds only its new fills", async () => {
    // The same statement plus one extra day, as a broker's next export would be.
    const extended = tos.replace(
      ",11/6/25 09:31:02,STOCK,BUY,+150,TO OPEN,NVDA,,,STOCK,notaprice,,LMT,0.00,0.00",
      [
        ",11/6/25 09:31:02,STOCK,BUY,+100,TO OPEN,NVDA,,,STOCK,182.40,182.40,LMT,0.00,0.03",
        ",11/6/25 10:12:44,STOCK,SELL,-100,TO CLOSE,NVDA,,,STOCK,184.10,184.10,LMT,0.00,0.04",
      ].join("\n"),
    );
    const outcome = await importText({
      user,
      account,
      text: extended,
      filename: "statement-week2.csv",
      source: "upload",
    });
    assert.equal(outcome.ok, true, outcome.refusal ?? "");
    assert.equal(outcome.imported, 2, "only the two new NVDA fills");
    assert.equal(outcome.duplicates, 8);
    assert.equal(outcome.matchedTrades, 5);
    assert.equal(outcome.newTrades, 1);
    const [nvda] = await db
      .select()
      .from(trades)
      .where(and(eq(trades.accountId, account.id), eq(trades.symbol, "NVDA")));
    // (184.10 − 182.40) × 100 = $170.00 gross, $0.07 fees.
    assert.equal(formatCents(nvda.netPnlCents), "$169.93");
  });

  /* ------------------------------------------ 4. an open position and a mark --- */

  await step("leaves a half-closed position open and marks it at the last fill", async () => {
    const openCsv = [
      "Account Trade History",
      ",Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,PRICE,Net Price,ORDER TYPE,Commission,Fees",
      ",11/7/25 09:35:00,STOCK,BUY,+100,TO OPEN,AMD,,,STOCK,150.00,150.00,LMT,0.00,0.00",
      ",11/7/25 09:40:00,STOCK,BUY,+100,TO OPEN,AMD,,,STOCK,152.00,152.00,LMT,0.00,0.00",
      ",11/7/25 10:00:00,STOCK,SELL,-100,TO CLOSE,AMD,,,STOCK,155.00,155.00,LMT,0.00,0.00",
      "",
    ].join("\n");
    const outcome = await importText({
      user,
      account,
      text: openCsv,
      filename: "amd-open.csv",
      source: "paste",
    });
    assert.equal(outcome.ok, true, outcome.refusal ?? "");
    const [amd] = await db
      .select()
      .from(trades)
      .where(and(eq(trades.accountId, account.id), eq(trades.symbol, "AMD")));
    assert.equal(amd.status, "open");
    assert.equal(formatQty(amd.qtyOpen), "100");
    // FIFO: the 150.00 lot closed, so the surviving lot is at 152.00 and the
    // realised gross is (155 − 150) × 100 = $500.
    assert.equal(formatCents(amd.grossPnlCents), "$500.00");
    assert.equal(formatPrice(amd.markPrice!), "155.00");
    // Unrealised at the 155.00 mark: (155 − 152) × 100 = $300.
    assert.equal(formatCents(amd.unrealizedPnlCents!), "$300.00");
    assert.equal(amd.closedAt, null);
  });

  /* --------------------------------------------------- 5. the R-multiple path --- */

  await step("setting a stop produces an R-multiple, and clearing it removes one", async () => {
    const [aapl] = await db
      .select()
      .from(trades)
      .where(and(eq(trades.accountId, account.id), eq(trades.symbol, "AAPL")));
    const stop = parsePrice("240.15");
    const r = rMultipleFor(
      {
        avgEntry: aapl.avgEntry,
        qtyMax: aapl.qtyMax,
        multiplierMilli: aapl.multiplierMilli,
        netPnlCents: aapl.netPnlCents,
      },
      stop,
    );
    // Risk $1.00 × 200 = $200; net $499.92 -> 2.4996R
    assert.equal(formatR(r), "+2.50R");
    await db.update(trades).set({ stopPrice: stop, rMultiple: r }).where(eq(trades.id, aapl.id));
    const [stored] = await db.select().from(trades).where(eq(trades.id, aapl.id));
    assert.equal(formatR(stored.rMultiple!), "+2.50R");
    assert.equal(formatPrice(stored.stopPrice!), "240.15");
    // …and it survives a rebuild, because the stop is authored, not derived.
    await rebuildTrades(account);
    const [afterRebuild] = await db.select().from(trades).where(eq(trades.id, aapl.id));
    assert.equal(formatPrice(afterRebuild.stopPrice!), "240.15");
    assert.equal(formatR(afterRebuild.rMultiple!), "+2.50R");
  });

  await step("notes, tags and setup survive a rebuild", async () => {
    const [setup] = await db
      .insert(setups)
      .values({ userId: user.id, name: "ORB breakout", color: "blue" })
      .returning();
    const [tsla] = await db
      .select()
      .from(trades)
      .where(and(eq(trades.accountId, account.id), eq(trades.symbol, "TSLA")));
    await db
      .update(trades)
      .set({
        notes: "Faded the gap into VWAP; sized correctly for once.",
        emotionTags: ["PLANNED", "DISCIPLINED"],
        setupId: setup.id,
        reviewed: true,
      })
      .where(eq(trades.id, tsla.id));
    await rebuildTrades(account);
    const [after] = await db.select().from(trades).where(eq(trades.id, tsla.id));
    assert.match(after.notes ?? "", /Faded the gap/);
    assert.deepEqual(after.emotionTags, ["PLANNED", "DISCIPLINED"]);
    assert.equal(after.setupId, setup.id);
    assert.equal(after.reviewed, true);
  });

  /* ------------------------------------------------ 6. the free-plan trade cap --- */

  await step("the free plan refuses an import that would cross its monthly cap", async () => {
    const used = await tradesThisMonth(user.id);
    const rowsNeeded = 30 - used + 2; // two over the cap
    const lines = [
      "Account Trade History",
      ",Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,PRICE,Net Price,ORDER TYPE,Commission,Fees",
    ];
    for (let i = 0; i < rowsNeeded; i++) {
      const minute = String(i % 50).padStart(2, "0");
      const hour = 10 + Math.floor(i / 50);
      lines.push(
        `,11/10/25 ${hour}:${minute}:00,STOCK,BUY,+10,TO OPEN,CAP${i},,,STOCK,50.00,50.00,LMT,0.00,0.00`,
      );
      lines.push(
        `,11/10/25 ${hour}:${minute}:30,STOCK,SELL,-10,TO CLOSE,CAP${i},,,STOCK,50.50,50.50,LMT,0.00,0.00`,
      );
    }
    lines.push("");
    const before = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(executions)
      .where(eq(executions.accountId, account.id));

    const outcome = await importText({
      user,
      account,
      text: lines.join("\n"),
      filename: "too-many.csv",
      source: "upload",
    });
    assert.equal(outcome.ok, false);
    assert.match(outcome.refusal ?? "", /left this month|used all 30/);
    const after = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(executions)
      .where(eq(executions.accountId, account.id));
    assert.equal(after[0].count, before[0].count, "nothing was written by a refused import");
    // The attempt is still in the history, with the reason.
    const batches = await db
      .select()
      .from(importBatches)
      .where(and(eq(importBatches.accountId, account.id), eq(importBatches.filename, "too-many.csv")));
    assert.equal(batches.length, 1);
    assert.equal(batches[0].importedCount, 0);
    assert.match(batches[0].errors[0]?.message ?? "", /month/);
  });

  await step("a paid plan takes the same file", async () => {
    await db.update(users).set({ plan: "trader" }).where(eq(users.id, user.id));
    const traderUser = { ...user, plan: "trader" as const };
    const lines = [
      "Account Trade History",
      ",Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,PRICE,Net Price,ORDER TYPE,Commission,Fees",
    ];
    for (let i = 0; i < 34; i++) {
      const minute = String(i % 50).padStart(2, "0");
      const hour = 10 + Math.floor(i / 50);
      lines.push(
        `,11/10/25 ${hour}:${minute}:00,STOCK,BUY,+10,TO OPEN,CAP${i},,,STOCK,50.00,50.00,LMT,0.00,0.00`,
      );
      lines.push(
        `,11/10/25 ${hour}:${minute}:30,STOCK,SELL,-10,TO CLOSE,CAP${i},,,STOCK,50.50,50.50,LMT,0.00,0.00`,
      );
    }
    lines.push("");
    const outcome = await importText({
      user: traderUser,
      account,
      text: lines.join("\n"),
      filename: "thirty-four.csv",
      source: "upload",
    });
    assert.equal(outcome.ok, true, outcome.refusal ?? "");
    assert.equal(outcome.newTrades, 34);
  });

  /* ------------------------------------------------------- 7. the leak detector --- */

  await step("detects leaks over a real history and ranks them by cost", async () => {
    // A second account with a deliberately leaky history: mornings win, the last
    // hour loses, and losers are held far longer than winners.
    const [leaky] = await db
      .insert(accounts)
      .values({ userId: user.id, broker: "thinkorswim", label: "Leaky" })
      .returning();
    const lines = [
      "Account Trade History",
      ",Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,PRICE,Net Price,ORDER TYPE,Commission,Fees",
    ];
    // 14 morning winners: +$1.00 x 100 = +$100 each, held 5 minutes.
    for (let i = 0; i < 14; i++) {
      const day = 10 + Math.floor(i / 3);
      const min = String(30 + (i % 3) * 5).padStart(2, "0");
      lines.push(
        `,11/${day}/25 09:${min}:00,STOCK,BUY,+100,TO OPEN,WIN${i},,,STOCK,100.00,100.00,LMT,0.00,0.00`,
      );
      lines.push(
        `,11/${day}/25 09:${String(Number(min) + 5).padStart(2, "0")}:00,STOCK,SELL,-100,TO CLOSE,WIN${i},,,STOCK,101.00,101.00,LMT,0.00,0.00`,
      );
    }
    // 10 late-day losers: −$3.00 x 100 = −$300 each, held 40 minutes.
    for (let i = 0; i < 10; i++) {
      const day = 10 + Math.floor(i / 3);
      const min = String(5 + (i % 3) * 10).padStart(2, "0");
      lines.push(
        `,11/${day}/25 15:${min}:00,STOCK,BUY,+100,TO OPEN,LOSS${i},,,STOCK,100.00,100.00,LMT,0.00,0.00`,
      );
      lines.push(
        `,11/${day}/25 15:${String(Number(min) + 30).padStart(2, "0")}:00,STOCK,SELL,-100,TO CLOSE,LOSS${i},,,STOCK,97.00,97.00,LMT,0.00,0.00`,
      );
    }
    lines.push("");
    const outcome = await importText({
      user: { ...user, plan: "trader" },
      account: leaky,
      text: lines.join("\n"),
      filename: "leaky.csv",
      source: "upload",
    });
    assert.equal(outcome.ok, true, outcome.refusal ?? "");
    assert.equal(outcome.matchedTrades, 24);

    const rows = await listFindings(user.id);
    const kinds = rows.map((r) => r.kind);
    assert.ok(rows.length >= 2, `expected findings, got ${kinds.join(",")}`);
    assert.ok(kinds.includes("time_leak"), `expected a time_leak, got ${kinds.join(",")}`);
    // Ranked by impact, descending.
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i - 1].dollarImpactCents >= rows[i].dollarImpactCents);
    }
    const timeLeak = rows.find((r) => r.kind === "time_leak")!;
    assert.match(timeLeak.statement, /after 15:00 loses money/);
    assert.equal(timeLeak.sampleSize, 10);
    assert.equal(formatCents(timeLeak.dollarImpactCents), "$3,000.00");
    assert.equal(timeLeak.tradeIds.length, 10);
    // Every evidence id is a real trade of this user's.
    const evidence = await db.select().from(trades).where(eq(trades.userId, user.id));
    const known = new Set(evidence.map((t) => t.id));
    assert.ok(timeLeak.tradeIds.every((id) => known.has(id)));
  });

  await step("a dismissed finding stays dismissed while its sentence is unchanged", async () => {
    const before = await listFindings(user.id);
    const target = before.find((f) => f.kind === "time_leak")!;
    await db.update(findings).set({ dismissedAt: new Date() }).where(eq(findings.id, target.id));
    await recomputeFindings({ ...user, plan: "trader" });
    const after = await listFindings(user.id);
    assert.equal(after.some((f) => f.kind === "time_leak"), false, "still hidden");
    const [row] = await db
      .select()
      .from(findings)
      .where(and(eq(findings.userId, user.id), eq(findings.kind, "time_leak")));
    assert.ok(row.dismissedAt, "the dismissal survived the recompute");
    // Restore it for the rest of the run.
    await db.update(findings).set({ dismissedAt: null }).where(eq(findings.id, row.id));
  });

  await step("changing the timezone moves the finding's cutoff", async () => {
    await db.update(users).set({ timezone: "America/Los_Angeles" }).where(eq(users.id, user.id));
    await recomputeFindings({ ...user, plan: "trader", timezone: "America/Los_Angeles" });
    const rows = await listFindings(user.id);
    const timeLeak = rows.find((r) => r.kind === "time_leak");
    assert.ok(timeLeak, "still a time leak");
    assert.match(timeLeak.statement, /after 12:00 loses money/, timeLeak.statement);
    await db.update(users).set({ timezone: "America/New_York" }).where(eq(users.id, user.id));
    await recomputeFindings({ ...user, plan: "trader" });
  });

  /* ------------------------------------------------------- 8. analytics reads --- */

  await step("the analytics projection reads back from Postgres", async () => {
    const closed = await closedTradesFor(user.id);
    const summary = summarize(closed);
    assert.ok(summary.closedCount > 50, `${summary.closedCount} closed trades`);
    assert.ok(summary.winners > 0 && summary.losers > 0);
    assert.notEqual(summary.profitFactor, null);
    assert.ok(summary.maxDrawdownCents > 0n);
    // The summed net matches a plain SQL sum over the same rows.
    const [{ total }] = await db
      .select({ total: sql<string>`coalesce(sum(net_pnl_cents), 0)::text` })
      .from(trades)
      .where(and(eq(trades.userId, user.id), eq(trades.status, "closed")));
    assert.equal(summary.netCents, BigInt(total));
  });

  /* --------------------------------------------------- 9. undo an import batch --- */

  await step("undoing an import removes its fills and re-derives the trades", async () => {
    const [batch] = await db
      .select()
      .from(importBatches)
      .where(and(eq(importBatches.accountId, account.id), eq(importBatches.filename, "amd-open.csv")));
    assert.ok(batch);
    await db.delete(executions).where(eq(executions.importBatchId, batch.id));
    await db.delete(importBatches).where(eq(importBatches.id, batch.id));
    const result = await rebuildTrades(account);
    const remaining = await db
      .select()
      .from(trades)
      .where(and(eq(trades.accountId, account.id), eq(trades.symbol, "AMD")));
    assert.equal(remaining.length, 0, "the AMD trade went with its fills");
    assert.equal(result.removed, 1);
  });

  /* ---------------------------------------------- 10. images, secrets, reviews --- */

  await step("a chart snapshot round-trips through bytea", async () => {
    const [trade] = await db.select().from(trades).where(eq(trades.userId, user.id)).limit(1);
    const png = Buffer.from(
      "89504e470d0a1a0a0000000d494844520000000100000001080600000" + "01f15c4890000000a49444154789c6300010000050001",
      "hex",
    );
    const [image] = await db
      .insert(tradeImages)
      .values({
        tradeId: trade.id,
        userId: user.id,
        mimeType: "image/png",
        byteSize: png.byteLength,
        caption: "5-minute chart at entry",
        bytes: png,
      })
      .returning();
    const [read] = await db.select().from(tradeImages).where(eq(tradeImages.id, image.id));
    assert.equal(read.byteSize, png.byteLength);
    assert.equal(Buffer.compare(Buffer.from(read.bytes), png), 0);
  });

  await step("broker credentials encrypt and decrypt, and tamper detection works", async () => {
    const token = "123456789012345";
    const stored = encryptSecret(token);
    assert.notEqual(stored, token);
    assert.equal(decryptSecret(stored), token);
    const [iv, tag, data] = stored.split(":");
    assert.throws(() => decryptSecret(`${iv}:${tag}:${data.slice(0, -2)}AA`));
    assert.throws(() => decryptSecret("nonsense"));
  });

  await step("the weekly review saves, completes and streaks", async () => {
    const week = currentWeekStart({ ...user });
    await saveReview(user.id, week, {
      wentWell: "Took only the ORB setup.",
      wentWrong: "Held two losers past the plan.",
      oneChange: "Hard stop at 11:30, no new risk after it.",
      complete: true,
    });
    const stored = await getReview(user.id, week);
    assert.ok(stored?.completedAt, "completed");
    assert.match(stored!.oneChange ?? "", /11:30/);
    const reviews = await listReviews(user.id);
    assert.equal(reviewStreak(reviews, week), 1);
    const summary = await weekInReview({ ...user }, week);
    assert.equal(typeof summary.summary.closedCount, "number");
    // Saving again updates in place rather than duplicating.
    await saveReview(user.id, week, { wentWell: "x", complete: false });
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(weeklyReviews)
      .where(eq(weeklyReviews.userId, user.id));
    assert.equal(count, 1);
  });

  /* --------------------------------------------- 11. the other three parsers --- */

  for (const [file, label, expected] of [
    ["ibkr-flex-trades.csv", "ibkr-flex", { imported: 6, trades: 3 }],
    ["tradovate-fills.csv", "tradovate", { imported: 5, trades: 2 }],
    ["binance-trades.csv", "binance", { imported: 4, trades: 2 }],
    ["ibkr-flex-statement.xml", "ibkr-flex-xml", { imported: 4, trades: 2 }],
  ] as const) {
    await step(`imports the ${label} fixture end to end`, async () => {
      const [acct] = await db
        .insert(accounts)
        .values({ userId: user.id, broker: label, label: `${label} account` })
        .returning();
      const outcome = await importText({
        user: { ...user, plan: "pro" },
        account: acct,
        text: readFileSync(`${F}/${file}`, "utf8"),
        filename: file,
        source: "upload",
      });
      assert.equal(outcome.ok, true, outcome.refusal ?? "");
      assert.equal(outcome.parserId, label);
      assert.equal(outcome.imported, expected.imported);
      const rows = await db.select().from(trades).where(eq(trades.accountId, acct.id));
      assert.equal(rows.length, expected.trades);
    });
  }

  await step("an unrecognised file is refused with a helpful message", async () => {
    const outcome = await importText({
      user,
      account,
      text: "name,email\nAda,ada@example.com\n",
      filename: "contacts.csv",
      source: "upload",
    });
    assert.equal(outcome.ok, false);
    assert.match(outcome.refusal ?? "", /don't recognise this export/);
  });

  await step("an empty file is refused", async () => {
    const outcome = await importText({
      user,
      account,
      text: "",
      filename: "empty.csv",
      source: "upload",
    });
    assert.equal(outcome.ok, false);
    assert.match(outcome.refusal ?? "", /empty/);
  });

  await step("accounts are scoped to their owner", async () => {
    const [other] = await db
      .insert(users)
      .values({ email: "harness2@example.com", passwordHash })
      .returning();
    const mine = await listAccounts(user.id);
    const theirs = await listAccounts(other.id);
    assert.ok(mine.length > 0);
    assert.equal(theirs.length, 0);
    const closedForOther = await closedTradesFor(other.id);
    assert.equal(closedForOther.length, 0);
  });

  await step("previewRebuild counts new trades without writing", async () => {
    const before = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(trades)
      .where(eq(trades.accountId, account.id));
    const preview = await previewRebuild(account.id, []);
    assert.equal(preview.newKeys.length, 0);
    assert.equal(preview.unmatched, 0);
    const after = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(trades)
      .where(eq(trades.accountId, account.id));
    assert.equal(after[0].count, before[0].count);
  });

  console.log(`\n${pass.length} passed, ${fail.length} failed`);
  if (fail.length) {
    for (const f of fail) console.log(` - ${f}`);
  }
  await closeDb();
  process.exit(fail.length ? 1 : 0);
}

void main();
