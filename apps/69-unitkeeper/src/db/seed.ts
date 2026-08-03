/**
 * `npm run db:seed` — a demo yard with real content.
 *
 * Riverbend Storage: 160 units in six rows, 138 rented, a handful in every state
 * the map can show — paid up, six days late with the fee posted, overlocked, and one
 * in a lien case with two statutory steps recorded. Every ledger is built by the
 * same functions the app uses, so the seed is also a smoke test of the domain layer:
 * if `ensureRentCharges` or the ladder is wrong, this script produces a wrong yard.
 *
 * It refuses to run against a database that already has this owner, so it is safe to
 * re-run by mistake.
 */

import "@/lib/load-env";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import {
  DEFAULT_SETTINGS,
  facilities,
  ledgerEntries,
  owners,
  tenancies,
  tenants,
  units,
  type OwnerSettings,
  type Unit,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { ensureRentCharges } from "@/lib/autopay";
import { renderLease, renderLienNotice, renderSignedLease } from "@/lib/docs";
import { issueGateCode } from "@/lib/gate";
import { delinquentRows, runLadderFor } from "@/lib/ladder-run";
import { post } from "@/lib/ledger";
import { attachNotice, caseById, completeStep, openLienCase } from "@/lib/lien";
import { addDays, isoDateOf, prorateFirstMonth } from "@/lib/money";
import { tenancyContext } from "@/lib/tenancy";

const EMAIL = "owner@riverbendstorage.example";
const PASSWORD = "riverbend-demo";

const ROWS: Array<{ prefix: string; row: number; count: number; size: string; rateCents: number }> = [
  { prefix: "A", row: 1, count: 24, size: "5x5", rateCents: 4900 },
  { prefix: "B", row: 2, count: 28, size: "5x10", rateCents: 7900 },
  { prefix: "C", row: 3, count: 32, size: "10x10", rateCents: 12900 },
  { prefix: "D", row: 4, count: 28, size: "10x15", rateCents: 16900 },
  { prefix: "E", row: 5, count: 26, size: "10x20", rateCents: 21900 },
  { prefix: "F", row: 6, count: 22, size: "10x30", rateCents: 28900 },
];

const NAMES = [
  "Marisol Ortega", "Dwayne Petrillo", "Hannah Kobayashi", "Ruben Alcázar",
  "Tessa Lindqvist", "Omar Haddad", "Priya Raghunathan", "Curtis Moreau",
  "Yolanda Beckwith", "Nikhil Advani", "Delia Fontaine", "Grant Yamashiro",
  "Sabine Rutherford", "Emmanuel Osei", "Rosalind Vega", "Trevor Bankole",
  "Ines Malinowska", "Jasper Whitfield", "Carmen Delacroix", "Ade Fashola",
];

const STREETS = [
  "704 Foxglove Trail, Leander, TX 78641",
  "1218 Kestrel Ridge, Cedar Park, TX 78613",
  "88 Old Quarry Rd, Round Rock, TX 78681",
  "3401 Mesquite Bend, Georgetown, TX 78626",
  "615 Persimmon Way, Hutto, TX 78634",
];

function pick<T>(list: readonly T[], i: number): T {
  return list[i % list.length];
}

async function main(): Promise<void> {
  const db = getDb();
  const [existing] = await db.select().from(owners).where(eq(owners.email, EMAIL));
  if (existing) {
    console.log(`Seed already present for ${EMAIL}. Nothing to do.`);
    await closeDb();
    return;
  }

  const today = isoDateOf(new Date());
  const settings: OwnerSettings = {
    ...DEFAULT_SETTINGS,
    legalName: "Riverbend Storage LLC",
    lateLadder: [
      { day: 3, action: "retry" },
      { day: 6, action: "late_fee", feeCents: 2000 },
      { day: 11, action: "overlock" },
      { day: 30, action: "lien_eligible" },
    ],
  };

  const [owner] = await db
    .insert(owners)
    .values({
      name: "Riverbend Storage",
      email: EMAIL,
      passwordHash: await hashPassword(PASSWORD),
      plan: "yard",
      subscriptionStatus: "active",
      settings,
    })
    .returning();

  const [facility] = await db
    .insert(facilities)
    .values({
      ownerId: owner.id,
      name: "Riverbend Storage — Cedar Park",
      address: "1840 Old Mill Rd, Cedar Park, TX 78613",
      state: "TX",
      timezone: "America/Chicago",
      gateSystem: "PTI Falcon keypad",
    })
    .returning();

  const created: Unit[] = [];
  for (const row of ROWS) {
    const values = Array.from({ length: row.count }, (_, i) => ({
      facilityId: facility.id,
      label: `${row.prefix}-${String(i + 1).padStart(2, "0")}`,
      size: row.size,
      monthlyRateCents: row.rateCents,
      mapPosition: { row: row.row, col: i + 1, w: 1, h: 1 },
      status: "vacant" as const,
    }));
    created.push(...(await db.insert(units).values(values).returning()));
  }
  console.log(`${created.length} units drawn.`);

  /**
   * Two units out of service — a real yard always has a couple.
   *
   * The ids are collected first and `rentable` filters on *them*, not on the
   * in-memory `status`: the rows in `created` came back from the insert with status
   * "vacant", so filtering on that value rented the maintenance units straight over
   * the top and the map never showed a dashed door at all.
   */
  const maintenance: Array<[string, string]> = [
    [created[7].id, "Door track bent — parts ordered"],
    [created[95].id, "Roof leak above this unit, do not rent"],
  ];
  for (const [id, note] of maintenance) {
    await db.update(units).set({ status: "maintenance", notes: note }).where(eq(units.id, id));
  }
  const outOfService = new Set(maintenance.map(([id]) => id));

  /**
   * Rent 138 of them. Start dates spread over two years so the ledgers have depth,
   * and a handful deliberately left in a late state so the board and the map have
   * something true to show.
   */
  const rentable = created.filter((u) => !outOfService.has(u.id));
  const target = 138;
  /**
   * How many recent months each late tenant has not paid. One unpaid month means a
   * couple of days late (the current period); two means about a month; three is deep
   * enough for the lien ladder to have flagged it. The spread is what makes the map
   * and the board show something true rather than one colour.
   */
  const lateBy = new Map<number, number>([
    [3, 1],
    [22, 1],
    [56, 1],
    [14, 2],
    [77, 2],
    [101, 2],
    [41, 3],
  ]);

  let rented = 0;
  for (let i = 0; i < rentable.length && rented < target; i += 3) {
    for (const unit of rentable.slice(i, i + 3)) {
      if (rented >= target) break;
      const index = rented;
      const monthsAgo = 1 + (index % 22);
      const startedOn = addDays(today, -(monthsAgo * 30 + (index % 17)));
      const rateCents =
        unit.monthlyRateCents - (index % 4 === 0 ? 1000 : 0); // a few legacy rates

      const [tenant] = await db
        .insert(tenants)
        .values({
          ownerId: owner.id,
          name: pick(NAMES, index),
          email: `${pick(NAMES, index).split(" ")[0].toLowerCase()}${index}@example.com`,
          phone: `512-555-${String(1000 + index).slice(-4)}`,
          address: pick(STREETS, index),
          alternateContact: index % 5 === 0 ? { note: "Brother — Luis, 512-555-0192" } : null,
        })
        .returning();

      const [tenancy] = await db
        .insert(tenancies)
        .values({
          unitId: unit.id,
          tenantId: tenant.id,
          rateCents,
          startedOn,
          status: "active",
          autopay: true,
          stripePaymentMethodId: lateBy.has(index) ? "pm_test_nsf" : "pm_test_ok",
          gateCode: await issueGateCode(facility.id),
          gateCodeStatus: "active",
        })
        .returning();

      await db.update(units).set({ status: "occupied" }).where(eq(units.id, unit.id));

      const ctx = await tenancyContext(tenancy.id);
      if (!ctx) throw new Error("seed: context missing right after insert");

      const firstCents = prorateFirstMonth(rateCents, startedOn, settings.prorateRule);
      // Only a couple of leases get a rendered PDF: the demo does not need 138 of
      // them and the seed should not take a minute.
      if (index < 3) {
        await renderLease(ctx, firstCents);
        await renderSignedLease(ctx, firstCents, tenant.name);
      } else {
        await db
          .update(tenancies)
          .set({ signedAt: new Date(`${startedOn}T15:04:00.000Z`), leaseHash: null })
          .where(eq(tenancies.id, tenancy.id));
      }

      // Generate every rent charge the tenancy owes. `ensureRentCharges` is bounded
      // per call (a tick must not run for ever), so backfilling two years of history
      // takes a few passes — exactly as the nightly job would.
      for (let pass = 0; pass < 6; pass += 1) {
        const [current] = await db.select().from(tenancies).where(eq(tenancies.id, tenancy.id));
        if (!current) break;
        const run = await ensureRentCharges(current, settings, today);
        if (run.created.length === 0) break;
      }

      const charges = await db
        .select()
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.tenancyId, tenancy.id), eq(ledgerEntries.kind, "rent")))
        .orderBy(ledgerEntries.occurredOn);
      const skipLast = lateBy.get(index) ?? 0;
      const toPay = charges.slice(0, Math.max(0, charges.length - skipLast));
      for (const charge of toPay) {
        await post({
          tenancyId: tenancy.id,
          kind: "payment",
          amountCents: -charge.amountCents,
          description: `Autopay ${charge.period ?? charge.occurredOn} (simulated)`,
          occurredOn: charge.occurredOn,
          period: charge.period,
        });
      }
      rented += 1;
    }
  }
  console.log(`${rented} tenancies moved in.`);

  // Walk the ladder for real, so the fired rungs and overlocks are genuine rows.
  const board = await delinquentRows(owner.id, today);
  let rungs = 0;
  for (const row of board) rungs += (await runLadderFor(row, today)).length;
  console.log(`${board.length} delinquent, ${rungs} ladder rungs fired.`);

  // And open one lien case, with its first two steps recorded on their lawful dates.
  const worst = (await delinquentRows(owner.id, today))
    .slice()
    .sort((a, b) => b.delinquency.daysLate - a.delinquency.daysLate)[0];
  if (worst && worst.delinquency.since) {
    const { lienCaseId } = await openLienCase(
      owner.id,
      "seed",
      worst.tenancy.id,
      "TX",
      worst.delinquency.since,
    );
    const ctx = await tenancyContext(worst.tenancy.id);
    const found = await caseById(lienCaseId);
    if (found && ctx) {
      for (const step of found.timeline.steps.slice(0, 2)) {
        const on = step.dueOn <= today ? step.dueOn : null;
        if (!on) break;
        // Generate the notice the way the owner would, so the demo lien file has a
        // real document in it and the packet has something to bind.
        const { r2Key } = await renderLienNotice(
          ctx,
          lienCaseId,
          found.timeline,
          step.key,
          worst.delinquency.outstandingCents,
        );
        await attachNotice(lienCaseId, step.key, r2Key);
        await completeStep(owner.id, "seed", lienCaseId, step.key, {
          trackingNumber: step.requires.includes("certified_mail")
            ? "9407 1000 0000 4471 0092 18"
            : undefined,
          completedOn: on,
        });
      }
    }
    console.log(`Lien case opened on unit ${worst.unit.label}.`);
  }

  console.log(`\nSeeded. Sign in as ${EMAIL} / ${PASSWORD}`);
  await closeDb();
}

main().catch(async (err) => {
  console.error("[seed] failed:", err);
  await closeDb();
  process.exit(1);
});
