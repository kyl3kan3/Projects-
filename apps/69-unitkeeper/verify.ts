/* Throwaway end-to-end exercise of the MVP list against real Postgres. Deleted after use. */
import "@/lib/load-env";
import assert from "node:assert/strict";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import {
  DEFAULT_SETTINGS,
  facilities,
  ladderEvents,
  ledgerEntries,
  lienCases,
  owners,
  tenancies,
  tenants,
  units,
  type OwnerSettings,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { collectAutopay, ensureRentCharges } from "@/lib/autopay";
import { renderLease, renderLienNotice, renderLienPacket, renderRateChangeLetter, renderSignedLease, renderStatement } from "@/lib/docs";
import { gateRowsFor } from "@/lib/gate";
import { delinquentRows, reverseLadderIfPaid, runLadderFor, ladderHistory } from "@/lib/ladder-run";
import { balance, entriesFor, post, runningRowsFor } from "@/lib/ledger";
import { attachNotice, caseById, completeStep, HardStopError, openLienCase, packOfRow } from "@/lib/lien";
import { addDays, isoDateOf, monthsBetween, periodOf, prorateFirstMonth } from "@/lib/money";
import { noticesFor } from "@/lib/notices";
import { applyDueRateChanges, earliestEffectiveOn, scheduleRateChange, setStreetRate, streetRateRows } from "@/lib/rates";
import { facilityReport } from "@/lib/reports";
import { completeMoveIn, moveOut, savePaymentMethod, startMoveIn, tenancyContext } from "@/lib/tenancy";
import { runTick } from "@/lib/tick";
import { mapCards } from "@/lib/units";
import { storage } from "@/lib/storage";
import { mintTenantToken, verifyTenantToken } from "@/lib/links";

const db = getDb();
const today = isoDateOf(new Date());
const log = (...m: unknown[]) => console.log("·", ...m);

async function main() {
  const email = `verify-${Date.now()}@example.test`;
  const settings: OwnerSettings = { ...DEFAULT_SETTINGS, legalName: "Verify Storage LLC" };

  const [owner] = await db
    .insert(owners)
    .values({
      name: "Verify Storage",
      email,
      passwordHash: await hashPassword("verify-password"),
      plan: "yard",
      subscriptionStatus: "active",
      settings,
    })
    .returning();

  const [facility] = await db
    .insert(facilities)
    .values({
      ownerId: owner.id,
      name: "Verify Yard",
      address: "9 Test Rd, Cedar Park, TX 78613",
      state: "TX",
    })
    .returning();

  const unitRows = await db
    .insert(units)
    .values([
      { facilityId: facility.id, label: "V-01", size: "10x10", monthlyRateCents: 12900, mapPosition: { row: 1, col: 1, w: 1, h: 1 } },
      { facilityId: facility.id, label: "V-02", size: "10x10", monthlyRateCents: 12900, mapPosition: { row: 1, col: 2, w: 1, h: 1 } },
      { facilityId: facility.id, label: "V-03", size: "5x10", monthlyRateCents: 7900, mapPosition: { row: 1, col: 3, w: 1, h: 1 } },
      { facilityId: facility.id, label: "V-04", size: "5x10", monthlyRateCents: 7900, mapPosition: { row: 1, col: 4, w: 1, h: 1 } },
    ])
    .returning();
  log("owner, facility and 4 units created");

  /* ---- 1 & 2: the map + move-in end to end --------------------------------- */
  const startedOn = addDays(today, -0);
  const { tenancyId } = await startMoveIn(owner.id, owner.email, unitRows[0], {
    tenantName: "Marisol Ortega",
    email: "marisol@example.test",
    phone: "512-555-0148",
    address: "704 Foxglove Trail, Leander, TX 78641",
    alternateContact: "Sister — Alma Ortega, 512-555-0192",
    rateCents: 12900,
    startedOn,
  });
  let ctx = (await tenancyContext(tenancyId))!;
  assert.equal(ctx.tenancy.signedAt, null);
  assert.equal(ctx.tenancy.gateCode, null);

  // The map must show the unit as taken the moment the paperwork starts.
  let cards = await mapCards(facility.id, today);
  assert.equal(cards.find((c) => c.unit.label === "V-01")!.status, "occupied");
  assert.equal(cards.find((c) => c.unit.label === "V-01")!.awaitingSignature, true);
  log("move-in started; V-01 reads occupied + awaiting signature on the map");

  // No move-in without a notice address.
  await assert.rejects(
    () =>
      startMoveIn(owner.id, owner.email, unitRows[1], {
        tenantName: "No Address",
        email: "",
        phone: "",
        address: "  ",
        alternateContact: "",
        rateCents: 12900,
        startedOn,
      }),
    /legal notice address is required/i,
  );
  // And no double-renting a unit.
  await assert.rejects(
    () =>
      startMoveIn(owner.id, owner.email, unitRows[0], {
        tenantName: "Second Tenant",
        email: "",
        phone: "",
        address: "1 Somewhere",
        alternateContact: "",
        rateCents: 12900,
        startedOn,
      }),
    /already has a live tenancy/i,
  );
  log("move-in refuses a missing notice address and a double-rent");

  const first = prorateFirstMonth(12900, startedOn, "daily");
  await renderLease(ctx, first);
  ctx = (await tenancyContext(tenancyId))!;
  assert.ok(ctx.tenancy.leaseR2Key, "lease rendered");
  assert.ok((await (await storage()).get(ctx.tenancy.leaseR2Key!))!.bytes.length > 1000, "lease PDF has bytes");

  // Completing the move-in before signature must be refused.
  await assert.rejects(() => completeMoveIn(ctx, "verify", "saved"), /not signed/i);

  const signed = await renderSignedLease(ctx, first, "Marisol Ortega");
  assert.equal(signed.hash.length, 64);
  ctx = (await tenancyContext(tenancyId))!;
  assert.ok(ctx.tenancy.signedAt);
  log(`lease signed, sha256 ${signed.hash.slice(0, 16)}…`);

  await savePaymentMethod(tenancyId, "pm_test_ok");
  ctx = (await tenancyContext(tenancyId))!;
  const done = await completeMoveIn(ctx, "verify", "saved");
  assert.equal(done.charged, true);
  assert.ok(done.gateCode && /^\d{5}$/.test(done.gateCode), `gate code ${done.gateCode}`);
  assert.equal(done.amountCents, first);
  assert.equal(await balance(tenancyId), 0, "prorated charge collected");
  log(`move-in complete: ${first} cents charged and collected, gate code ${done.gateCode}`);

  // Idempotent: a second completion does nothing and reports so.
  ctx = (await tenancyContext(tenancyId))!;
  const again = await completeMoveIn(ctx, "verify", "saved");
  assert.match(again.message, /already complete/i);
  assert.equal((await entriesFor(tenancyId)).length, 2, "no duplicate rows");
  log("completing a move-in twice is a no-op");

  /* ---- 5: the ledger ------------------------------------------------------- */
  const rows = await runningRowsFor(tenancyId);
  assert.deepEqual(
    rows.map((r) => r.balanceAfterCents),
    [first, 0],
  );
  // A backdated payment must renumber the running balance, not append a wrong one.
  await post({ tenancyId, kind: "rent", amountCents: 5000, description: "Backdated charge", occurredOn: addDays(today, -5) });
  const renumbered = await runningRowsFor(tenancyId);
  assert.deepEqual(renumbered.map((r) => [r.entry.occurredOn, r.balanceAfterCents]), [
    [addDays(today, -5), 5000],
    [startedOn, 5000 + first],
    [startedOn, 5000],
  ]);
  const cached = await db.select().from(ledgerEntries).where(eq(ledgerEntries.tenancyId, tenancyId));
  for (const row of renumbered) {
    const stored = cached.find((c) => c.id === row.entry.id)!;
    assert.equal(stored.balanceAfterCents, row.balanceAfterCents, "cached balance matches the derived one");
  }
  await post({ tenancyId, kind: "payment", amountCents: -5000, description: "Cleared the backdated charge", occurredOn: today });
  assert.equal(await balance(tenancyId), 0);
  log("ledger: running balance is correct even for a backdated row, cache included");

  /* ---- 3: autopay + the late ladder --------------------------------------- */
  // A tenancy that started 45 days ago and never paid.
  const lateStart = addDays(today, -45);
  const { tenancyId: lateId } = await startMoveIn(owner.id, owner.email, unitRows[1], {
    tenantName: "Dwayne Petrillo",
    email: "dwayne@example.test",
    phone: "512-555-0161",
    address: "1218 Kestrel Ridge, Cedar Park, TX 78613",
    alternateContact: "",
    rateCents: 12900,
    startedOn: lateStart,
  });
  await db
    .update(tenancies)
    .set({ signedAt: new Date(), stripePaymentMethodId: "pm_test_nsf", gateCode: "40318", gateCodeStatus: "active" })
    .where(eq(tenancies.id, lateId));

  let lateTenancy = (await db.select().from(tenancies).where(eq(tenancies.id, lateId)))[0];
  for (let pass = 0; pass < 4; pass += 1) {
    const run = await ensureRentCharges(lateTenancy, settings, today);
    lateTenancy = (await db.select().from(tenancies).where(eq(tenancies.id, lateId)))[0];
    if (run.created.length === 0) break;
  }
  const lateCharges = await db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.tenancyId, lateId), eq(ledgerEntries.kind, "rent")));
  const expectedPeriods = monthsBetween(periodOf(lateStart), periodOf(today)) + 1;
  assert.equal(
    lateCharges.length,
    expectedPeriods,
    `expected ${expectedPeriods} rent charges for a tenancy from ${lateStart}, got ${lateCharges.length}`,
  );
  log(`autopay generated ${lateCharges.length} rent charges for a 45-day-old tenancy`);

  // Autopay against a card that declines must not post a payment.
  const attempt = await collectAutopay(lateTenancy, null, null, periodOf(today), "Verify Yard V-02", today);
  assert.equal(attempt.attempted, true);
  assert.equal(attempt.outcome?.ok, false);
  assert.equal(
    (await db.select().from(ledgerEntries).where(and(eq(ledgerEntries.tenancyId, lateId), eq(ledgerEntries.kind, "payment")))).length,
    0,
    "a declined charge must never post a payment row",
  );
  log("a declined autopay posts nothing");

  // Now the ladder. 45 days late crosses every rung.
  let board = await delinquentRows(owner.id, today);
  const lateRow = board.find((r) => r.tenancy.id === lateId)!;
  assert.ok(lateRow.delinquency.daysLate >= 30, `days late ${lateRow.delinquency.daysLate}`);
  const fired = await runLadderFor(lateRow, today);
  assert.deepEqual(
    fired.map((f) => f.action),
    ["retry", "late_fee", "overlock", "lien_eligible"],
    "every crossed rung fires, in order",
  );

  // Exactly once: run the whole tick twice more and nothing else may fire.
  board = await delinquentRows(owner.id, today);
  const second = await runLadderFor(board.find((r) => r.tenancy.id === lateId)!, today);
  assert.deepEqual(second, [], "a second pass fires nothing");
  await runTick(new Date());
  await runTick(new Date());
  const rungRows = await ladderHistory(lateId);
  assert.equal(rungRows.length, 4, `expected 4 ladder rows, got ${rungRows.length}`);
  const feeRows = await db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.tenancyId, lateId), eq(ledgerEntries.kind, "late_fee")));
  assert.equal(feeRows.length, 1, "exactly one late fee, after three passes");
  log("ladder fired all four rungs exactly once across four passes");

  lateTenancy = (await db.select().from(tenancies).where(eq(tenancies.id, lateId)))[0];
  assert.equal(lateTenancy.gateCodeStatus, "overlocked");
  assert.equal(lateTenancy.status, "delinquent");
  cards = await mapCards(facility.id, today);
  assert.equal(cards.find((c) => c.unit.label === "V-02")!.status, "overdue");
  log("overlock applied; the map reads V-02 overdue");

  /* ---- 4: the lien engine ------------------------------------------------- */
  board = await delinquentRows(owner.id, today);
  const forLien = board.find((r) => r.tenancy.id === lateId)!;
  assert.equal(forLien.lienEligible, true);
  const { lienCaseId } = await openLienCase(owner.id, owner.email, lateId, "TX", forLien.delinquency.since!);
  let found = (await caseById(lienCaseId))!;
  assert.equal(found.timeline.steps.length, 4);
  assert.equal(found.rule.state, "TX");

  // The hard stop: the last step cannot be completed, and neither can a later one
  // be reached by skipping.
  await assert.rejects(
    () => completeStep(owner.id, owner.email, lienCaseId, "sale", {}),
    HardStopError,
  );
  const saleStep = found.timeline.steps[3];
  assert.equal(saleStep.locked, true);
  assert.match(saleStep.lockSentence!, /not recorded as done/);

  // Generate the notice for the current step and record it with tracking.
  const current = found.timeline.steps.find((s) => s.current)!;
  const notice = await renderLienNotice(ctx0(found, lateId) ?? (await tenancyContext(lateId))!, lienCaseId, found.timeline, current.key, forLien.delinquency.outstandingCents);
  await attachNotice(lienCaseId, current.key, notice.r2Key);
  await assert.rejects(
    () => completeStep(owner.id, owner.email, lienCaseId, current.key, { completedOn: addDays(current.dueOn, -1) }),
    HardStopError,
    "a step must not be completable a day early",
  );
  await completeStep(owner.id, owner.email, lienCaseId, current.key, {
    trackingNumber: "9407 1000 0000 4471 0092 18",
    completedOn: current.dueOn,
  });
  found = (await caseById(lienCaseId))!;
  assert.equal(found.timeline.steps[0].completedOn, current.dueOn);
  assert.equal(found.timeline.steps[1].dueOn, addDays(current.dueOn, 14), "the waiting period counts from the day it was sent");
  log(`lien case: notice generated, step recorded, next step ${found.timeline.steps[1].dueOn}, sale not before ${found.timeline.saleEligibleOn}`);

  // The packet: the notice as mailed plus the ledger.
  const lienCtx = (await tenancyContext(lateId))!;
  const packet = await renderLienPacket(lienCtx, found.lienCase, packOfRow(found.rule));
  assert.equal(packet.noticeCount, 1);
  const packetBytes = (await (await storage()).get(packet.r2Key))!.bytes;
  assert.ok(packetBytes.length > 3000, `packet is ${packetBytes.length} bytes`);
  log(`lien packet built: ${packet.noticeCount} notice + ledger, ${packetBytes.length} bytes`);

  // A state with no reviewed pack must refuse rather than guess.
  const [wyFacility] = await db
    .insert(facilities)
    .values({ ownerId: owner.id, name: "Wyoming Yard", state: "WY" })
    .returning();
  const [wyUnit] = await db
    .insert(units)
    .values({ facilityId: wyFacility.id, label: "W-01", size: "10x10", monthlyRateCents: 9900, mapPosition: { row: 1, col: 1, w: 1, h: 1 } })
    .returning();
  const { tenancyId: wyTenancy } = await startMoveIn(owner.id, owner.email, wyUnit, {
    tenantName: "Wyoming Tenant",
    email: "",
    phone: "",
    address: "1 Range Rd, Casper, WY",
    alternateContact: "",
    rateCents: 9900,
    startedOn: addDays(today, -60),
  });
  await assert.rejects(() => openLienCase(owner.id, owner.email, wyTenancy, "WY", addDays(today, -60)), /WY/);
  log("a state with no reviewed rule pack refuses to open a case");

  /* ---- 3 again: payment reverses the whole ladder -------------------------- */
  const owed = await balance(lateId);
  assert.ok(owed > 0);
  await post({ tenancyId: lateId, kind: "payment", amountCents: -owed, description: "Paid in full at the counter", occurredOn: today });
  const reversal = await reverseLadderIfPaid(lateId, today);
  assert.equal(reversal.overlockLifted, true);
  assert.equal(reversal.reversedRungs, 4);
  assert.equal(reversal.lienCaseResolved, true);
  lateTenancy = (await db.select().from(tenancies).where(eq(tenancies.id, lateId)))[0];
  assert.equal(lateTenancy.gateCodeStatus, "active");
  assert.equal(lateTenancy.status, "active");
  const [caseAfter] = await db.select().from(lienCases).where(eq(lienCases.id, lienCaseId));
  assert.equal(caseAfter.status, "resolved");
  assert.equal(caseAfter.resolvedReason, "paid");
  cards = await mapCards(facility.id, today);
  assert.equal(cards.find((c) => c.unit.label === "V-02")!.status, "occupied");
  log("payment reversed 4 rungs, lifted the overlock and resolved the lien case");

  // And the ladder does not re-fire on the reversed cycle.
  await runTick(new Date());
  assert.equal((await ladderHistory(lateId)).length, 4, "no new rungs after the reversal");
  log("no rungs re-fire after a reversal");

  /* ---- 6: gate codes ------------------------------------------------------ */
  const gate = await gateRowsFor(facility.id);
  assert.equal(gate.length, 2);
  assert.ok(gate.every((g) => /^\d{5}$/.test(g.code)));
  assert.equal(new Set(gate.map((g) => g.code)).size, 2, "codes are unique per facility");
  assert.ok(gate.every((g) => g.enabled === 1));
  log(`gate export: ${gate.length} codes, all unique, all enabled`);

  /* ---- 9: rates ----------------------------------------------------------- */
  await setStreetRate(owner.id, owner.email, facility.id, "5x10", 8900);
  const sizes = await streetRateRows(facility.id);
  const fiveByTen = sizes.find((s) => s.size === "5x10")!;
  assert.equal(fiveByTen.streetRateCents, 8900);
  assert.equal(
    (await db.select().from(tenancies).where(eq(tenancies.id, tenancyId)))[0].rateCents,
    12900,
    "a street-rate change never touches a signed tenancy",
  );

  const earliest = earliestEffectiveOn("TX", today);
  assert.equal(earliest, addDays(today, 30));
  await assert.rejects(
    () =>
      scheduleRateChange(owner.id, owner.email, {
        unitId: unitRows[0].id,
        tenancyId,
        state: "TX",
        oldCents: 12900,
        newCents: 13900,
        effectiveOn: addDays(today, 10),
        noticeId: null,
        asOf: today,
      }),
    /30 days/,
    "an increase inside the notice period is refused",
  );

  ctx = (await tenancyContext(tenancyId))!;
  const letter = await renderRateChangeLetter(ctx, 12900, 13900, earliest, 30);
  const change = await scheduleRateChange(owner.id, owner.email, {
    unitId: unitRows[0].id,
    tenancyId,
    state: "TX",
    oldCents: 12900,
    newCents: 13900,
    effectiveOn: earliest,
    noticeId: letter.noticeId,
    asOf: today,
  });
  assert.equal(change.status, "noticed");
  assert.equal(await applyDueRateChanges(today), 0, "not applied before the effective date");
  assert.equal(await applyDueRateChanges(earliest), 1, "applied on the effective date");
  assert.equal(await applyDueRateChanges(earliest), 0, "and only once");
  assert.equal((await db.select().from(tenancies).where(eq(tenancies.id, tenancyId)))[0].rateCents, 13900);
  log("rate change: refused inside notice period, letter generated, applied on the day, once");

  /* ---- 10 + 5: statement, documents -------------------------------------- */
  ctx = (await tenancyContext(tenancyId))!;
  const stmt = await renderStatement(ctx, addDays(today, -365), today);
  assert.ok((await (await storage()).get(stmt.r2Key))!.bytes.length > 1000);
  const docs = await noticesFor(tenancyId);
  assert.ok(docs.length >= 2, `documents on file: ${docs.length}`);
  log(`documents: ${docs.length} on the unit file, statement PDF written`);

  /* ---- 8: occupancy and revenue ------------------------------------------ */
  const report = await facilityReport(facility, today);
  assert.equal(report.totalUnits, 4);
  assert.equal(report.occupiedUnits, 2);
  assert.equal(report.occupancyPct, 50);
  assert.equal(report.monthlyRevenueCents, 13900 + 12900);
  assert.equal(report.vacantPotentialCents, 8900 * 2);
  log(`report: ${report.occupancyPct}% occupancy, ${report.monthlyRevenueCents} cents/mo, ${report.delinquentCents} past due`);

  /* ---- 7: move-out ------------------------------------------------------- */
  ctx = (await tenancyContext(tenancyId))!;
  const balBefore = await balance(tenancyId);
  const out = await moveOut(ctx, owner.email, today, { "Swept and empty": true, "Gate code revoked": true });
  const usedDays = Number(today.slice(8, 10));
  const monthDays = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
  const expectedCredit = 13900 - Math.round((13900 * usedDays) / monthDays);
  // A credit is only posted when this period was actually charged.
  const chargedThisPeriod = (
    await db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.tenancyId, tenancyId), eq(ledgerEntries.kind, "rent"), eq(ledgerEntries.period, periodOf(today))))
  ).length;
  assert.equal(out.creditCents, chargedThisPeriod > 0 ? expectedCredit : 0, `credit ${out.creditCents}`);
  assert.equal(out.finalBalanceCents, balBefore - out.creditCents);
  const movedOut = (await db.select().from(tenancies).where(eq(tenancies.id, tenancyId)))[0];
  assert.equal(movedOut.status, "ended");
  assert.equal(movedOut.gateCodeStatus, "revoked");
  assert.equal((await db.select().from(units).where(eq(units.id, unitRows[0].id)))[0].status, "vacant");
  assert.deepEqual(movedOut.makeReady, { "Swept and empty": true, "Gate code revoked": true });
  cards = await mapCards(facility.id, today);
  assert.equal(cards.find((c) => c.unit.label === "V-01")!.status, "vacant");
  assert.equal((await gateRowsFor(facility.id)).length, 1, "a revoked code drops out of the export");
  log(`move-out: credit ${out.creditCents}, final ${out.finalBalanceCents}, unit vacant, code revoked`);

  /* ---- tenant links ------------------------------------------------------ */
  const payToken = await mintTenantToken(lateId, "pay");
  const claim = await verifyTenantToken(payToken);
  assert.deepEqual(claim, { tenancyId: lateId, purpose: "pay" });
  assert.equal(await verifyTenantToken("garbage"), null);
  assert.equal(await verifyTenantToken(`${payToken}x`), null);
  log("tenant links verify, and a tampered one does not");

  /* ---- cleanup: remove this run's rows, in foreign-key order ------------- */
  const scope = sql`
    select t.id from tenancies t
    join units u on u.id = t.unit_id
    join facilities f on f.id = u.facility_id
    where f.owner_id = ${owner.id}
  `;
  await db.execute(sql`delete from ladder_events where tenancy_id in (${scope})`);
  await db.execute(sql`delete from rate_changes where tenancy_id in (${scope})`);
  await db.execute(sql`delete from notices where tenancy_id in (${scope})`);
  await db.execute(sql`delete from lien_cases where tenancy_id in (${scope})`);
  await db.execute(sql`delete from ledger_entries where tenancy_id in (${scope})`);
  await db.execute(sql`delete from rate_changes where unit_id in (select u.id from units u join facilities f on f.id = u.facility_id where f.owner_id = ${owner.id})`);
  await db.execute(sql`delete from tenancies where id in (${scope})`);
  await db.execute(sql`delete from units where facility_id in (select id from facilities where owner_id = ${owner.id})`);
  await db.execute(sql`delete from tenants where owner_id = ${owner.id}`);
  await db.execute(sql`delete from audit_log where owner_id = ${owner.id}`);
  await db.execute(sql`delete from facilities where owner_id = ${owner.id}`);
  await db.execute(sql`delete from owners where id = ${owner.id}`);

  console.log("\nALL CHECKS PASSED");
  await closeDb();
}

function ctx0(_found: unknown, _id: string): null {
  return null;
}

main().catch(async (err) => {
  console.error("\nFAILED:", err);
  await closeDb();
  process.exit(1);
});
