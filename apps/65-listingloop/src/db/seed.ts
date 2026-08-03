/**
 * src/db/seed.ts — `npm run db:seed`
 *
 * Loads the holiday calendar (which the date engine cannot work without) and,
 * unless SEED_HOLIDAYS_ONLY=1, a demo desk: one coordinator, three files at
 * different stages, real parties, and documents. Every date on those files is
 * computed by the engine from the anchors, not typed in — the demo is the
 * product running, which is the only kind of demo worth having.
 *
 * Idempotent: holidays upsert on (scope, date), and the demo account is skipped
 * if its email already exists.
 */

import "@/lib/load-env";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { accounts, checklistTemplates, holidays, parties, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { clearHolidayCache, loadHolidayMap } from "@/lib/calendar";
import { addDays, computeDate, todayInZone } from "@/lib/dates";
import { openDeal, setTaskStatus } from "@/lib/deals";
import { allHolidayRows } from "@/lib/holidays";
import { TRIAL_DAYS } from "@/lib/plans";
import { partyTokenHash } from "@/lib/tokens";
import { STARTER_TEMPLATES } from "@/lib/templates";

const DEMO_EMAIL = "rita@bellcoordination.test";
const DEMO_PASSWORD = "closing-file-2026";

async function seedHolidays(): Promise<number> {
  const db = getDb();
  const thisYear = new Date().getUTCFullYear();
  const rows = allHolidayRows(thisYear - 1, thisYear + 4);
  for (const row of rows) {
    await db
      .insert(holidays)
      .values(row)
      .onConflictDoUpdate({
        target: [holidays.scope, holidays.date],
        set: { label: row.label, year: row.year },
      });
  }
  clearHolidayCache();
  return rows.length;
}

async function seedDemo(): Promise<void> {
  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL));
  if (existing) {
    console.log(`[seed] demo account already present (${DEMO_EMAIL}) — skipping`);
    return;
  }

  const [account] = await db
    .insert(accounts)
    .values({
      name: "Bell Transaction Coordination",
      plan: "trial",
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
      state: "TX",
      timezone: "America/Chicago",
      settings: { reminderOffsets: [7, 3, 1], alwaysNotifyCoordinator: true },
    })
    .returning();

  await db.insert(users).values({
    accountId: account.id,
    email: DEMO_EMAIL,
    name: "Rita Bell",
    role: "owner",
    passwordHash: await hashPassword(DEMO_PASSWORD),
  });

  const templates = await db
    .insert(checklistTemplates)
    .values(
      STARTER_TEMPLATES.map((t) => ({
        accountId: account.id,
        name: t.name,
        contractType: t.contractType,
        tasks: t.tasks,
      })),
    )
    .returning();
  const byType = new Map(templates.map((t) => [t.contractType, t]));

  const today = todayInZone(account.timezone);
  const actor = "Rita Bell (owner)";

  /**
   * Demo anchors land on a day business is actually done — not a weekend and not
   * an observed federal holiday. Nobody closes on Labor Day, and a demo file that
   * did would show the closing task rolling forward, which reads as a bug rather
   * than as the engine working. Uses the engine itself, so the demo is generated
   * by the same code the product runs.
   */
  const holidays = await loadHolidayMap(account.state);
  const businessDay = (offsetDays: number): string => {
    const result = computeDate(
      { anchor: "contract_date", offsetDays: 0, businessDays: true, observeHolidays: true },
      { contract_date: addDays(today, offsetDays) },
      holidays,
    );
    return result.ok ? result.value.dueOn : addDays(today, offsetDays);
  };

  // File 1: mid-flight buyer side. Contract eleven days ago, closing in five
  // weeks, so the near dates are inside the at-risk window.
  const buyer = await openDeal(
    {
      accountId: account.id,
      address: "412 Pecan Grove Ln, Round Rock, TX 78664",
      mlsNumber: "TX-4471902",
      contractType: "buyer",
      templateId: byType.get("buyer")!.id,
      priceCents: 43_800_000,
      contractDate: businessDay(-11),
      acceptanceDate: businessDay(-11),
      closingDate: businessDay(34),
      commission: {
        rateBps: 250,
        split: [
          { label: "Buyer's agent — Marisol Vance", bps: 7000 },
          { label: "Brokerage", bps: 3000 },
        ],
        referralFeeCents: 0,
        tcFeeCents: 45_000,
      },
      parties: [
        { role: "buyer", name: "Dana Okafor", email: "dana.okafor@example.test", phone: "512-555-0148" },
        { role: "seller", name: "Priya & Tomas Reyes", email: "reyes.family@example.test" },
        { role: "buyer_agent", name: "Marisol Vance", email: "marisol@vancerealty.test", phone: "512-555-0119" },
        { role: "listing_agent", name: "Grant Whitlow", email: "grant@whitlowgroup.test" },
        { role: "lender", name: "Sam Ozturk — Lone Star Mortgage", email: "sozturk@lonestarmtg.test" },
        { role: "title", name: "Cypress Title, Sarah Deng", email: "sdeng@cypresstitle.test" },
        { role: "hoa", name: "Pecan Grove HOA — Meridian Mgmt", email: "docs@meridianhoa.test" },
        { role: "tc", name: "Rita Bell", email: DEMO_EMAIL, phone: "512-555-0102" },
      ],
    },
    actor,
    account.state,
  );

  // File 2: clear to close next week.
  const listing = await openDeal(
    {
      accountId: account.id,
      address: "88 Larkspur Dr, Georgetown, TX 78628",
      mlsNumber: "TX-4468815",
      contractType: "listing",
      templateId: byType.get("listing")!.id,
      priceCents: 61_000_000,
      contractDate: businessDay(-46),
      acceptanceDate: businessDay(-38),
      closingDate: businessDay(6),
      commission: {
        rateBps: 300,
        split: [
          { label: "Listing agent — Grant Whitlow", bps: 6000 },
          { label: "Brokerage", bps: 4000 },
        ],
        referralFeeCents: 150_000,
        tcFeeCents: 45_000,
      },
      parties: [
        { role: "seller", name: "Helen Marchetti", email: "helen.m@example.test", phone: "512-555-0173" },
        { role: "buyer", name: "Aaron Piedra", email: "apiedra@example.test" },
        { role: "listing_agent", name: "Grant Whitlow", email: "grant@whitlowgroup.test" },
        { role: "buyer_agent", name: "Yuki Tanaka", email: "yuki@tanakahomes.test" },
        { role: "title", name: "Cypress Title, Sarah Deng", email: "sdeng@cypresstitle.test" },
        { role: "tc", name: "Rita Bell", email: DEMO_EMAIL },
      ],
    },
    actor,
    account.state,
  );

  // File 3: brand new, no closing date yet — the honest "needs a date" state.
  await openDeal(
    {
      accountId: account.id,
      address: "1500 Bellaire Ave, Austin, TX 78704",
      contractType: "dual",
      templateId: byType.get("dual")!.id,
      priceCents: 22_500_000,
      contractDate: businessDay(-1),
      acceptanceDate: businessDay(-1),
      closingDate: null,
      commission: {
        rateBps: 275,
        split: [{ label: "In-house split", bps: 5000 }],
        referralFeeCents: 0,
        tcFeeCents: 60_000,
      },
      parties: [
        { role: "buyer", name: "Noor Haddad", email: "noor.haddad@example.test" },
        { role: "seller", name: "Bellaire Holdings LLC", email: "ops@bellaireholdings.test" },
        { role: "tc", name: "Rita Bell", email: DEMO_EMAIL },
      ],
    },
    actor,
    account.state,
  );

  // Mark the early work on the mid-flight file done, so the timeline shows met
  // nodes rather than a wall of identical outlines.
  const buyerTasks = await db.query.tasks.findMany({ where: (t, { eq: e }) => e(t.dealId, buyer.dealId) });
  for (const key of ["emd_delivered", "sellers_disclosure", "loan_application"]) {
    const task = buyerTasks.find((t) => t.key === key);
    if (task) {
      const [owner] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL));
      await setTaskStatus(buyer.dealId, account.id, task.id, "done", owner.id, actor);
    }
  }

  // A portal link for the buyer on the mid-flight file.
  const [buyerParty] = await db
    .select()
    .from(parties)
    .where(eq(parties.dealId, buyer.dealId));
  if (buyerParty) {
    await db
      .update(parties)
      .set({ portalTokenHash: partyTokenHash(buyerParty.id) })
      .where(eq(parties.id, buyerParty.id));
  }

  console.log(`[seed] demo desk ready:`);
  console.log(`[seed]   login ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`[seed]   buyer-side file: ${buyer.dateCount} computed dates, ${buyer.unresolvedCount} waiting`);
  console.log(`[seed]   listing file: ${listing.dateCount} computed dates`);
}

async function main(): Promise<void> {
  const count = await seedHolidays();
  console.log(`[seed] ${count} holiday rows loaded (US federal + state scopes)`);
  if (process.env.SEED_HOLIDAYS_ONLY === "1") {
    console.log("[seed] SEED_HOLIDAYS_ONLY=1 — stopping before the demo desk");
  } else {
    await seedDemo();
  }
  await closeDb();
}

main().catch(async (err) => {
  console.error("[seed] failed:", err);
  await closeDb();
  process.exit(1);
});
