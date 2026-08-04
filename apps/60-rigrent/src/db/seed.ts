/**
 * src/db/seed.ts — `npm run db:seed`
 *
 * A plausible yard: Whitcomb Party Rentals in Buda, Texas. Real inventory with
 * real counts and real rates, six customers, and orders at every stage of the
 * lifecycle — a draft quote, one sent and waiting, two confirmed for the same
 * Saturday, one out on the road, and one back with a damage claim and its photo
 * pair.
 *
 * It exists so every screen has something honest on it, including the ones a new
 * account never sees. Re-running it drops and rebuilds the demo account only; it
 * touches nothing else.
 */

import "@/lib/load-env";
import { and, eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import {
  accounts,
  auditLog,
  checks,
  conditionPhotos,
  customers,
  damageClaims,
  items,
  maintenanceHolds,
  notices,
  orderLines,
  orders,
  runs,
  units,
  users,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { attachPhoto } from "@/lib/checkin";
import { demoPhotoPng } from "@/lib/demo-photo";
import { renderAndStoreContract } from "@/lib/documents";
import { addDays, dayOfWeek, isoDateOf } from "@/lib/dates";
import { applyDepositEvent } from "@/lib/billing";
import { createOrder, recalcOrder, addLine, markSent, markOut } from "@/lib/orders";
import { acceptQuote } from "@/lib/orders";
import { mintQuoteToken } from "@/lib/links";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { putFile } from "@/lib/storage";
import { TRIAL_DAYS } from "@/lib/plans";

const YARD = "Whitcomb Party Rentals";
const OWNER_EMAIL = "dale@whitcombrentals.com";

async function wipeDemoAccount(): Promise<void> {
  const db = getDb();
  const existing = await db.select().from(accounts).where(eq(accounts.name, YARD));
  for (const account of existing) {
    const accountOrders = await db.select({ id: orders.id }).from(orders).where(eq(orders.accountId, account.id));
    const orderIds = accountOrders.map((o) => o.id);
    if (orderIds.length) {
      const lines = await db
        .select({ id: orderLines.id })
        .from(orderLines)
        .where(inArray(orderLines.orderId, orderIds));
      const lineIds = lines.map((l) => l.id);
      if (lineIds.length) {
        const lineChecks = await db
          .select({ id: checks.id })
          .from(checks)
          .where(inArray(checks.orderLineId, lineIds));
        const checkIds = lineChecks.map((c) => c.id);
        if (checkIds.length) {
          await db.delete(conditionPhotos).where(inArray(conditionPhotos.checkId, checkIds));
        }
        await db.delete(damageClaims).where(inArray(damageClaims.orderId, orderIds));
        await db.delete(checks).where(inArray(checks.orderLineId, lineIds));
        await db.delete(orderLines).where(inArray(orderLines.orderId, orderIds));
      }
      await db.delete(notices).where(inArray(notices.orderId, orderIds));
    }
    await db.delete(runs).where(eq(runs.accountId, account.id));
    await db.delete(orders).where(eq(orders.accountId, account.id));
    const accountItems = await db.select({ id: items.id }).from(items).where(eq(items.accountId, account.id));
    const itemIds = accountItems.map((i) => i.id);
    if (itemIds.length) {
      await db.delete(maintenanceHolds).where(inArray(maintenanceHolds.itemId, itemIds));
      await db.delete(units).where(inArray(units.itemId, itemIds));
    }
    await db.delete(items).where(eq(items.accountId, account.id));
    await db.delete(customers).where(eq(customers.accountId, account.id));
    await db.delete(auditLog).where(eq(auditLog.accountId, account.id));
    await db.delete(users).where(eq(users.accountId, account.id));
    await db.delete(accounts).where(eq(accounts.id, account.id));
  }
}

async function main(): Promise<void> {
  const db = getDb();
  await wipeDemoAccount();

  const today = isoDateOf(new Date());
  // The next Saturday: the day the whole shop plans around.
  const toSaturday = (6 - dayOfWeek(today) + 7) % 7 || 7;
  const saturday = addDays(today, toSaturday);
  const sunday = addDays(saturday, 1);

  const [account] = await db
    .insert(accounts)
    .values({
      name: YARD,
      plan: "trial",
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
      timezone: "America/Chicago",
      settings: {
        ...DEFAULT_SETTINGS,
        depositPercentBps: 2500,
        depositMinimumCents: 5_000,
        taxRateBps: 825,
        deliveryFeeCents: 8_500,
        damageFeeDefaults: [
          { label: "Returned muddy — cleaning", amountCents: 4_500 },
          { label: "Returned wet — drying and re-fold", amountCents: 6_000 },
        ],
      },
      nextOrderNumber: 1041,
    })
    .returning();

  const password = await hashPassword("yardyard1");
  const [owner] = await db
    .insert(users)
    .values({
      accountId: account.id,
      email: OWNER_EMAIL,
      name: "Dale Whitcomb",
      role: "owner",
      passwordHash: password,
    })
    .returning();
  const [driver] = await db
    .insert(users)
    .values({
      accountId: account.id,
      email: "ray@whitcombrentals.com",
      name: "Ray Ocampo",
      role: "driver",
      passwordHash: password,
    })
    .returning();
  await db.insert(users).values({
    accountId: account.id,
    email: "nita@whitcombrentals.com",
    name: "Nita Bello",
    role: "staff",
    passwordHash: password,
  });

  /* --- the catalogue --- */

  const catalogue = await db
    .insert(items)
    .values([
      {
        accountId: account.id,
        name: "White folding chair",
        category: "Seating",
        ownedCount: 200,
        dailyRateCents: 175,
        weekendRateCents: 250,
        replacementCents: 2_400,
        damageFees: [
          { label: "Torn seat fabric", amountCents: 1_500 },
          { label: "Bent frame", amountCents: 2_200 },
        ],
      },
      {
        accountId: account.id,
        name: "6ft banquet table",
        category: "Tables",
        ownedCount: 40,
        dailyRateCents: 900,
        weekendRateCents: 1_400,
        replacementCents: 11_000,
        damageFees: [
          { label: "Gouged top", amountCents: 3_500 },
          { label: "Broken leg latch", amountCents: 2_800 },
        ],
      },
      {
        accountId: account.id,
        name: "60in round table",
        category: "Tables",
        ownedCount: 24,
        dailyRateCents: 1_100,
        weekendRateCents: 1_650,
        replacementCents: 14_500,
        damageFees: [{ label: "Gouged top", amountCents: 4_000 }],
      },
      {
        accountId: account.id,
        name: "20x40 frame tent",
        category: "Tents",
        ownedCount: 3,
        dailyRateCents: 42_500,
        weekendRateCents: 58_000,
        replacementCents: 480_000,
        damageFees: [
          { label: "Sidewall tear per panel", amountCents: 18_000 },
          { label: "Bent leg section", amountCents: 9_500 },
          { label: "Missing stake bag", amountCents: 3_200 },
        ],
      },
      {
        accountId: account.id,
        name: "White linen — 120in round",
        category: "Linens",
        ownedCount: 60,
        dailyRateCents: 1_200,
        replacementCents: 4_800,
        damageFees: [
          { label: "Wax or ink stain", amountCents: 1_800 },
          { label: "Burn hole", amountCents: 3_600 },
        ],
      },
      {
        accountId: account.id,
        name: "Bounce house — castle 15x15",
        category: "Inflatables",
        ownedCount: 2,
        dailyRateCents: 19_500,
        weekendRateCents: 26_000,
        replacementCents: 220_000,
        damageFees: [
          { label: "Seam repair", amountCents: 12_500 },
          { label: "Blower replacement", amountCents: 21_000 },
        ],
      },
      {
        accountId: account.id,
        name: "Portable PA — 12in powered pair",
        category: "AV",
        ownedCount: 4,
        dailyRateCents: 8_500,
        weekendRateCents: 12_000,
        replacementCents: 96_000,
        trackedBy: "serial",
        damageFees: [
          { label: "Blown driver", amountCents: 24_000 },
          { label: "Missing speaker cable", amountCents: 2_400 },
        ],
      },
      {
        accountId: account.id,
        name: "Patio heater — propane",
        category: "Heating",
        ownedCount: 8,
        dailyRateCents: 4_200,
        weekendRateCents: 6_500,
        replacementCents: 32_000,
        damageFees: [{ label: "Cracked reflector", amountCents: 6_800 }],
      },
    ])
    .returning();

  const byName = new Map(catalogue.map((i) => [i.name, i]));
  const chair = byName.get("White folding chair")!;
  const banquet = byName.get("6ft banquet table")!;
  const round = byName.get("60in round table")!;
  const tent = byName.get("20x40 frame tent")!;
  const linen = byName.get("White linen — 120in round")!;
  const bounce = byName.get("Bounce house — castle 15x15")!;
  const pa = byName.get("Portable PA — 12in powered pair")!;
  const heater = byName.get("Patio heater — propane")!;

  await db.insert(units).values([
    { itemId: pa.id, serial: "PA-EV12-0117" },
    { itemId: pa.id, serial: "PA-EV12-0118" },
    { itemId: pa.id, serial: "PA-EV12-0206" },
    { itemId: pa.id, serial: "PA-EV12-0207", status: "maintenance" },
  ]);

  // One tent is in for a sidewall repair over the Saturday everyone wants.
  await db.insert(maintenanceHolds).values({
    itemId: tent.id,
    quantity: 1,
    startsOn: addDays(saturday, -3),
    endsOn: addDays(saturday, 4),
    reason: "Sidewall repair at Fabric Works — panel 3",
  });

  /* --- customers --- */

  const people = await db
    .insert(customers)
    .values([
      {
        accountId: account.id,
        name: "Marisol Vega",
        email: "marisol@vegaevents.com",
        phone: "512 555 0148",
        company: "Vega Events",
        notes: "Books the Pecan Grove barn every spring. Wants tables set, not stacked.",
      },
      {
        accountId: account.id,
        name: "Hays County Parks",
        email: "rentals@hayscountyparks.gov",
        phone: "512 555 0912",
        company: "Hays County",
        taxExempt: true,
        notes: "Purchase orders only. Tax exempt certificate on file, expires next March.",
      },
      {
        accountId: account.id,
        name: "Trevor Nakamura",
        email: "trev.nakamura@gmail.com",
        phone: "737 555 0231",
        notes: "Backyard graduation parties. Always asks about the bounce house first.",
      },
      {
        accountId: account.id,
        name: "Camille Boudreaux",
        email: "camille@stonewellchapel.com",
        phone: "512 555 0774",
        company: "Stonewell Chapel",
        notes: "Two ceremonies most Saturdays. Needs the delivery before 9am.",
      },
      {
        accountId: account.id,
        name: "Ignacio Delacruz",
        email: "nacho@delacruzbbq.com",
        phone: "512 555 0555",
        company: "Delacruz BBQ",
        notes: "Caters at the fairgrounds. Returns everything, sometimes muddy.",
      },
      {
        accountId: account.id,
        name: "Priya Raghunathan",
        email: "priya.r@austinmakers.org",
        phone: "512 555 0390",
        company: "Austin Makers Collective",
        notes: "Quarterly maker market. Needs the PA and heaters in December.",
      },
    ])
    .returning();

  const [marisol, hays, trevor, camille, nacho, priya] = people;

  /* --- orders through their whole life --- */

  // 1. A draft quote nobody has sent yet.
  const draft = await createOrder({
    accountId: account.id,
    customerId: priya.id,
    outOn: addDays(saturday, 14),
    dueBackOn: addDays(saturday, 16),
    delivery: true,
    address: "Austin Makers Collective\n2201 E 6th St, Austin TX",
    notes: "Load in through the alley. PA goes on the mezzanine.",
    actor: OWNER_EMAIL,
  });
  await addLine({ accountId: account.id, orderId: draft.id, itemId: banquet.id, quantity: 18 });
  await addLine({ accountId: account.id, orderId: draft.id, itemId: chair.id, quantity: 60 });
  await addLine({ accountId: account.id, orderId: draft.id, itemId: pa.id, quantity: 2 });
  await addLine({ accountId: account.id, orderId: draft.id, itemId: heater.id, quantity: 4 });

  // 2. A quote sent and waiting on a signature.
  const sent = await createOrder({
    accountId: account.id,
    customerId: trevor.id,
    outOn: addDays(saturday, 7),
    dueBackOn: addDays(saturday, 8),
    delivery: true,
    address: "1408 Cypress Bend\nKyle TX 78640",
    notes: "Backyard through the side gate. Level ground by the pool fence.",
    actor: OWNER_EMAIL,
  });
  await addLine({ accountId: account.id, orderId: sent.id, itemId: bounce.id, quantity: 1 });
  await addLine({ accountId: account.id, orderId: sent.id, itemId: chair.id, quantity: 30 });
  await addLine({ accountId: account.id, orderId: sent.id, itemId: banquet.id, quantity: 6 });
  const sentToken = await mintQuoteToken(sent.id);
  await markSent(account.id, sent.id, sentToken.hash, OWNER_EMAIL);

  // 3 and 4. Two confirmed orders competing for the same Saturday — the whole
  // reason this product exists. Between them they hold 168 of 200 chairs.
  const chapel = await createOrder({
    accountId: account.id,
    customerId: camille.id,
    outOn: saturday,
    dueBackOn: sunday,
    delivery: true,
    address: "Stonewell Chapel\n980 Old Kyle Rd, Wimberley TX",
    notes: "Ceremony at 11 and again at 4. Delivery before 9am, no exceptions.",
    actor: OWNER_EMAIL,
  });
  await addLine({ accountId: account.id, orderId: chapel.id, itemId: chair.id, quantity: 120 });
  await addLine({ accountId: account.id, orderId: chapel.id, itemId: round.id, quantity: 14 });
  await addLine({ accountId: account.id, orderId: chapel.id, itemId: linen.id, quantity: 14 });
  await addLine({ accountId: account.id, orderId: chapel.id, itemId: tent.id, quantity: 1 });
  await confirmOrder(chapel.id, "Camille Boudreaux", "CB");

  const vega = await createOrder({
    accountId: account.id,
    customerId: marisol.id,
    outOn: saturday,
    dueBackOn: sunday,
    delivery: true,
    address: "Pecan Grove Barn\n4180 FM 1626, Buda TX",
    notes: "Gate code 4412. Unload at the north end; the ceremony is on the south lawn.",
    actor: OWNER_EMAIL,
  });
  await addLine({ accountId: account.id, orderId: vega.id, itemId: chair.id, quantity: 48 });
  await addLine({ accountId: account.id, orderId: vega.id, itemId: banquet.id, quantity: 12 });
  await addLine({ accountId: account.id, orderId: vega.id, itemId: linen.id, quantity: 12 });
  await confirmOrder(vega.id, "Marisol Vega", "MV");

  // 5. Out on the road right now, due back tomorrow.
  const outNow = await createOrder({
    accountId: account.id,
    customerId: hays.id,
    outOn: addDays(today, -2),
    dueBackOn: addDays(today, 1),
    delivery: true,
    address: "Five Mile Dam Park\n4001 Old Stagecoach Rd, San Marcos TX",
    notes: "County parks crew will meet the truck at the pavilion.",
    actor: OWNER_EMAIL,
  });
  await addLine({ accountId: account.id, orderId: outNow.id, itemId: banquet.id, quantity: 16 });
  await addLine({ accountId: account.id, orderId: outNow.id, itemId: chair.id, quantity: 80 });
  await confirmOrder(outNow.id, "Dawn Prentiss", "DP");
  await markOut(account.id, outNow.id, OWNER_EMAIL);

  // 6. Back last week, with a damage claim and its photo pair.
  const settled = await createOrder({
    accountId: account.id,
    customerId: nacho.id,
    outOn: addDays(today, -9),
    dueBackOn: addDays(today, -7),
    delivery: false,
    address: null,
    notes: "Customer pickup at 7am. Brought his own trailer.",
    actor: OWNER_EMAIL,
  });
  await addLine({ accountId: account.id, orderId: settled.id, itemId: banquet.id, quantity: 10 });
  await addLine({ accountId: account.id, orderId: settled.id, itemId: linen.id, quantity: 10 });
  await confirmOrder(settled.id, "Ignacio Delacruz", "ID");
  await markOut(account.id, settled.id, OWNER_EMAIL);
  await checkInWithDamage(settled.id);

  /* --- a run for the busy Saturday --- */

  const [deliveryRun] = await db
    .insert(runs)
    .values({
      accountId: account.id,
      kind: "delivery",
      runOn: saturday,
      truckLabel: "Truck 2 — 16ft box",
      driverUserId: driver.id,
      stopOrder: [chapel.id, vega.id],
      status: "planned",
    })
    .returning();

  await db.insert(runs).values({
    accountId: account.id,
    kind: "pickup",
    runOn: addDays(today, 1),
    truckLabel: "Truck 1 — flatbed",
    driverUserId: driver.id,
    stopOrder: [outNow.id],
    status: "planned",
  });

  console.info(
    [
      "",
      `Seeded ${YARD}.`,
      `  owner    ${OWNER_EMAIL} / yardyard1`,
      `  driver   ray@whitcombrentals.com / yardyard1`,
      `  staff    nita@whitcombrentals.com / yardyard1`,
      "",
      `  Saturday everyone wants: ${saturday}`,
      `  Chapel order holds 120 chairs, Vega holds 48 — 168 of 200.`,
      `  Quote a third order for 40 chairs that Saturday and it blocks.`,
      "",
      `  Sent quote link: /q/${sentToken.token}`,
      `  Delivery run:    /runs/${deliveryRun.id}`,
      "",
    ].join("\n"),
  );

  /* ------------------------------------------------------------- helpers --- */

  async function confirmOrder(orderId: string, signer: string, initials: string): Promise<void> {
    const token = await mintQuoteToken(orderId);
    await markSent(account.id, orderId, token.hash, OWNER_EMAIL);
    await acceptQuote({
      accountId: account.id,
      orderId,
      signerName: signer,
      signerInitials: initials,
      signatureKey: null,
    });
    await renderAndStoreContract(account.id, orderId);
    const [row] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (row.depositCents > 0) {
      await applyDepositEvent({
        orderId,
        kind: "held",
        paymentIntentId: `pi_sim_seed_${row.number}`,
        amountCents: row.depositCents,
        actor: "system:seed",
      });
    }
    await recalcOrder(account.id, orderId);
  }

  /**
   * Check the Delacruz order back in the way a real return goes: tables clean,
   * two linens stained, a claim drafted from the fee schedule, and a photo pair on
   * each line so the claim is evidence rather than an assertion.
   */
  async function checkInWithDamage(orderId: string): Promise<void> {
    const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, orderId));
    for (const line of lines) {
      const [item] = await db.select().from(items).where(eq(items.id, line.itemId));
      const stained = item.name.startsWith("White linen");

      for (const direction of ["out", "in"] as const) {
        const damagedCount = stained && direction === "in" ? 2 : 0;
        const [check] = await db
          .insert(checks)
          .values({
            orderLineId: line.id,
            direction,
            quantityOk: line.quantity - damagedCount,
            quantityDamaged: damagedCount,
            quantityMissing: 0,
            checkedBy: direction === "out" ? driver.id : owner.id,
            checkedAt: new Date(
              Date.parse(`${direction === "out" ? addDays(today, -9) : addDays(today, -7)}T14:30:00Z`),
            ),
            note:
              direction === "out"
                ? "Loaded from bay 3, strapped in twos."
                : stained
                  ? "Two linens came back with wax down the centre fold."
                  : "Wiped and stacked, no damage.",
          })
          .returning();

        const png = demoPhotoPng({
          seed: `${item.name}-${line.id}`,
          direction,
          damaged: stained,
        });
        const stored = await putFile(account.id, "photo", "png", png);
        await attachPhoto({
          checkId: check.id,
          key: stored.key,
          caption: `${direction === "out" ? "OUT" : "IN"} · demo data`,
        });
      }

      if (stained) {
        // The IN check specifically. Selecting by line alone returns whichever
        // check the planner hands back first, which was the out-photo — a claim
        // whose only evidence is a picture of undamaged gear.
        const [claimCheck] = await db
          .select()
          .from(checks)
          .where(and(eq(checks.orderLineId, line.id), eq(checks.direction, "in")));
        const photos = await db
          .select()
          .from(conditionPhotos)
          .where(eq(conditionPhotos.checkId, claimCheck.id));
        await db.insert(damageClaims).values({
          orderId,
          orderLineId: line.id,
          kind: "damage",
          description:
            "2 × White linen — 120in round — wax or ink stain, down the centre fold. See the in-photos.",
          amountCents: 3_600,
          photoIds: photos.map((p) => p.id),
          status: "draft",
        });
      }
    }
    await db
      .update(orders)
      .set({ status: "returned", returnedAt: new Date(), updatedAt: new Date() })
      .where(eq(orders.id, orderId));
  }
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("[seed] failed:", err);
    await closeDb();
    process.exit(1);
  });
