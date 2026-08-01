/**
 * Throwaway end-to-end verification against the real database.
 * Run: PATH=node_modules/.bin:$PATH tsx scripts/verify.ts
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { and, eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import {
  clients,
  firms,
  invoices,
  messages,
  payments,
  promises,
  sequenceRuns,
  users,
} from "@/db/schema";
import { createFirmAndOwner } from "@/lib/auth";
import { syncConnection, upsertConnection, upsertBook, bookFromImportRows, recomputeClientStats } from "@/lib/accounting";
import { parseCsv, planImport } from "@/lib/csv";
import { runSweep } from "@/lib/sweep";
import { addDays, today } from "@/lib/dates";
import { applyPaymentCascade, openInvoices, recordPayment } from "@/lib/invoices";
import { logPromise, listPromises } from "@/lib/promises";
import { approveAll, pendingApprovals, sendNextStepNow } from "@/lib/sequences";
import { loadDashboard, loadForecast, loadClientRows, loadInvoiceDetail } from "@/lib/dashboard";
import { createPortalToken, loadPortalContext, resolvePortalToken } from "@/lib/portal";
import { formatMoney } from "@/lib/money";

let failures = 0;
function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`, detail === undefined ? "" : JSON.stringify(detail));
  }
}
function section(name: string) {
  console.log(`\n=== ${name} ===`);
}

const db = getDb();
const stamp = Date.now();
const EMAIL = `owner+${stamp}@northbank.studio`;

async function main() {
  section("1. signup creates a firm in approval mode with the default ladder");
  const created = await createFirmAndOwner(EMAIL, "correct-horse-battery", "Northbank Studio", "Ana Reyes");
  const [firm] = await db.select().from(firms).where(eq(firms.id, created.firmId));
  check("firm created", Boolean(firm));
  check("send mode defaults to approval", firm.sendMode === "approval", firm.sendMode);
  check("follow-up is not paused", firm.followUpPaused === false);
  check("late-fee mention off by default", firm.settings?.lateFeeMention === false);
  const [owner] = await db.select().from(users).where(eq(users.id, created.userId));
  check("owner attached to firm", owner.firmId === firm.id);

  section("2. connect the demo accounting provider and sync the book");
  const connection = await upsertConnection({
    firmId: firm.id,
    provider: "qbo",
    realmId: "demo-realm",
    displayName: "Northbank Studio (demo)",
    accessToken: "demo",
  });
  const sync = await syncConnection(firm, connection);
  check("sync reported no error", !sync.error, sync.error);
  check("clients imported", sync.clientsUpserted === 4, sync.clientsUpserted);
  check("invoices imported", sync.invoicesUpserted === 10, sync.invoicesUpserted);
  check("3 fully-paid invoices detected", sync.settled === 3, sync.settled);
  const open = await openInvoices(firm.id);
  check("7 invoices still open", open.length === 7, open.length);
  const runs = await db.select().from(sequenceRuns).where(eq(sequenceRuns.firmId, firm.id));
  check("a run exists for every open invoice", runs.length === 7, runs.length);
  check(
    "client behaviour computed",
    (await db.select().from(clients).where(eq(clients.firmId, firm.id))).some(
      (c) => c.avgDaysToPay !== null,
    ),
  );

  section("3. re-syncing is idempotent");
  const resync = await syncConnection(firm, connection);
  check("no duplicate invoices", (await db.select().from(invoices).where(eq(invoices.firmId, firm.id))).length === 10);
  check("no duplicate payments", (await db.select().from(payments).where(eq(payments.firmId, firm.id))).length === 4);
  check("resync reported the same counts", resync.invoicesUpserted === 10, resync.invoicesUpserted);

  section("4. age ONE invoice through the whole ladder, one sweep per day");
  // A fresh single-invoice firm so the ladder can be observed in isolation.
  const solo = await createFirmAndOwner(`solo+${stamp}@northbank.studio`, "correct-horse-battery", "Solo Studio");
  const [soloFirm] = await db.select().from(firms).where(eq(firms.id, solo.firmId));
  const DUE = addDays(today(), 0);
  await upsertBook({
    firm: soloFirm,
    provider: "csv",
    book: {
      clients: [
        { externalId: "c1", name: "Meridian Co", contactName: "Dana Whitfield", emails: ["ap@meridian.co"] },
      ],
      invoices: [
        {
          externalId: "i1",
          clientExternalId: "c1",
          number: "INV-3001",
          issuedAt: addDays(DUE, -30),
          dueAt: DUE,
          amountCents: 1_240_000,
          balanceCents: 1_240_000,
          currency: "USD",
          pdfUrl: null,
        },
      ],
      payments: [],
    },
  });
  const [soloInvoice] = await db.select().from(invoices).where(eq(invoices.firmId, soloFirm.id));

  const sentByDay: Record<number, number[]> = {};
  for (let day = -30; day <= 60; day++) {
    const asOf = addDays(DUE, day);
    await runSweep({ firmId: soloFirm.id, asOf, skipSync: true });
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.invoiceId, soloInvoice.id));
    const steps = rows.map((r) => r.stepIndex).sort();
    const previous = Object.values(sentByDay).flat();
    const fresh = steps.filter((s) => !previous.includes(s));
    if (fresh.length) sentByDay[day] = fresh;
  }
  const laddered = await db.select().from(messages).where(eq(messages.invoiceId, soloInvoice.id));
  check("exactly 4 messages over 91 daily sweeps", laddered.length === 4, laddered.length);
  check(
    "each rung fired on its pinned day (-3, +3, +10, +21)",
    JSON.stringify(Object.keys(sentByDay).map(Number).sort((a, b) => a - b)) === JSON.stringify([-3, 3, 10, 21]),
    sentByDay,
  );
  check(
    "every rung is queued for approval, none sent",
    laddered.every((m) => m.status === "awaiting_approval"),
    laddered.map((m) => m.status),
  );
  check(
    "escalation levels climb 1→4",
    JSON.stringify(laddered.sort((a, b) => a.stepIndex - b.stepIndex).map((m) => m.escalationLevel)) ===
      JSON.stringify([1, 2, 3, 4]),
  );
  check(
    "the final message reads like a final notice",
    /final/i.test(laddered[3].subject) || /last note/i.test(laddered[3].bodySnapshot),
    laddered[3].subject,
  );
  check(
    "no message contains an unrendered merge field",
    laddered.every((m) => !m.bodySnapshot.includes("{{") && !m.subject.includes("{{")),
  );
  check(
    "each message carries a working portal link",
    laddered.every((m) => Boolean(m.portalToken) && m.bodySnapshot.includes("/portal/")),
  );
  const soloRun = (await db.select().from(sequenceRuns).where(eq(sequenceRuns.invoiceId, soloInvoice.id)))[0];
  check("run finished at the last rung", soloRun.highestStepSent === 3, soloRun.highestStepSent);
  check("run has no next send date", soloRun.nextSendOn === null, soloRun.nextSendOn);

  section("5. approving the tray actually sends (DRY_RUN so delivery is logged)");
  const pending = await pendingApprovals(soloFirm.id);
  check("4 sends waiting for approval", pending.length === 4, pending.length);
  const approved = await approveAll(soloFirm.id, solo.userId);
  check("all 4 approved", approved.approved === 4, approved);
  const afterApproval = await db.select().from(messages).where(eq(messages.invoiceId, soloInvoice.id));
  check(
    "each message records the attempt and the DRY_RUN reason",
    afterApproval.every((m) => m.status === "failed" && /DRY_RUN/.test(m.error ?? "")),
    afterApproval.map((m) => [m.status, m.error]),
  );
  check("approvals recorded who tapped", afterApproval.every((m) => m.approvedByUserId === solo.userId));
  check("tray is now empty", (await pendingApprovals(soloFirm.id)).length === 0);

  section("6. a finished ladder never sends again");
  await runSweep({ firmId: soloFirm.id, asOf: addDays(DUE, 400), skipSync: true });
  check(
    "still exactly 4 messages a year later",
    (await db.select().from(messages).where(eq(messages.invoiceId, soloInvoice.id))).length === 4,
  );
  const manual = await sendNextStepNow(soloFirm.id, soloInvoice.id, solo.userId);
  check("manual send refuses once the ladder is done", !manual.ok, manual);

  section("7. promise-to-pay pauses, breaks, and escalates with promise-aware copy");
  const promiseFirm = await createFirmAndOwner(`promise+${stamp}@northbank.studio`, "correct-horse-battery", "Promise Studio");
  const [pFirm] = await db.select().from(firms).where(eq(firms.id, promiseFirm.firmId));
  await db.update(firms).set({ sendMode: "autopilot" }).where(eq(firms.id, pFirm.id));
  const [pFirmAuto] = await db.select().from(firms).where(eq(firms.id, pFirm.id));
  await upsertBook({
    firm: pFirmAuto,
    provider: "csv",
    book: {
      clients: [{ externalId: "c1", name: "Harbourline Group", contactName: "Priya Raman", emails: ["accounts@harbourline.io"] }],
      invoices: [
        {
          externalId: "i1", clientExternalId: "c1", number: "INV-4001",
          issuedAt: addDays(DUE, -30), dueAt: DUE,
          amountCents: 485_000, balanceCents: 485_000, currency: "USD", pdfUrl: null,
        },
      ],
      payments: [],
    },
  });
  const [pInvoice] = await db.select().from(invoices).where(eq(invoices.firmId, pFirmAuto.id));

  // Sweep to day +3 so rungs 0 and 1 have gone out.
  for (let day = -5; day <= 3; day++) {
    await runSweep({ firmId: pFirmAuto.id, asOf: addDays(DUE, day), skipSync: true });
  }
  let pMessages = await db.select().from(messages).where(eq(messages.invoiceId, pInvoice.id));
  check("two rungs sent under autopilot", pMessages.length === 2, pMessages.length);
  check("autopilot did not queue for approval", pMessages.every((m) => m.status !== "awaiting_approval"));

  // The client promises to pay on day +8 — before rung 3 (day +10) is due, so the
  // promise genuinely has to be what silences the ladder.
  const promisedFor = addDays(DUE, 8);
  const logged = await logPromise({
    firmId: pFirmAuto.id,
    invoiceId: pInvoice.id,
    promisedFor,
    source: "portal",
    actor: "client",
  });
  check("promise logged", logged.ok, logged);
  let pRun = (await db.select().from(sequenceRuns).where(eq(sequenceRuns.invoiceId, pInvoice.id)))[0];
  check("run paused on the promise", pRun.state === "paused_promise", pRun.state);

  // Days +4 to +8 pass with the promise open: nothing must go out.
  for (let day = 4; day <= 8; day++) {
    await runSweep({ firmId: pFirmAuto.id, asOf: addDays(DUE, day), skipSync: true });
  }
  pMessages = await db.select().from(messages).where(eq(messages.invoiceId, pInvoice.id));
  check("an open promise silences the ladder", pMessages.length === 2, pMessages.length);

  // Day +9: the promised date has passed unpaid, and rung 3's own date (+10)
  // has NOT yet arrived — so anything that goes out now is the broken promise.
  const brokenSweep = await runSweep({
    firmId: pFirmAuto.id,
    asOf: addDays(DUE, 9),
    skipSync: true,
  });
  const [brokenPromise] = await db.select().from(promises).where(eq(promises.invoiceId, pInvoice.id));
  check("promise marked broken", brokenPromise.status === "broken", brokenPromise.status);
  check("the sweep reported it", brokenSweep.firms[0].promisesBroken === 1, brokenSweep.firms[0]);
  pMessages = await db.select().from(messages).where(eq(messages.invoiceId, pInvoice.id));
  check("the ladder escalated one rung", pMessages.length === 3, pMessages.length);
  const escalated = pMessages.sort((a, b) => b.stepIndex - a.stepIndex)[0];
  check("the escalation is promise-aware", escalated.promiseAware === true, escalated.promiseAware);
  check(
    "and its copy names the date they gave",
    escalated.bodySnapshot.includes(promisedFor.slice(8, 10)) || /agreed|expected|passed/i.test(escalated.bodySnapshot),
    escalated.subject,
  );

  section("8. a broken promise does not become a daily nag");
  for (let i = 10; i <= 40; i++) {
    await runSweep({ firmId: pFirmAuto.id, asOf: addDays(DUE, i), skipSync: true });
  }
  pMessages = await db.select().from(messages).where(eq(messages.invoiceId, pInvoice.id));
  check("still exactly 4 messages a month later (rung 4 on its own day, no daily nag)", pMessages.length === 4, pMessages.length);

  section("9. a kept promise: payment cascades oldest-first and stops the ladder");
  const payFirm = await createFirmAndOwner(`pay+${stamp}@northbank.studio`, "correct-horse-battery", "Cascade Studio");
  const [cFirm] = await db.select().from(firms).where(eq(firms.id, payFirm.firmId));
  await upsertBook({
    firm: cFirm,
    provider: "csv",
    book: {
      clients: [{ externalId: "c1", name: "Fable & Vine", contactName: "Owen Serra", emails: ["owen@fableandvine.com"] }],
      invoices: [
        { externalId: "a", clientExternalId: "c1", number: "INV-5001", issuedAt: addDays(DUE, -90), dueAt: addDays(DUE, -60), amountCents: 300_000, balanceCents: 300_000, currency: "USD", pdfUrl: null },
        { externalId: "b", clientExternalId: "c1", number: "INV-5002", issuedAt: addDays(DUE, -60), dueAt: addDays(DUE, -30), amountCents: 500_000, balanceCents: 500_000, currency: "USD", pdfUrl: null },
        { externalId: "c", clientExternalId: "c1", number: "INV-5003", issuedAt: addDays(DUE, -30), dueAt: DUE, amountCents: 200_000, balanceCents: 200_000, currency: "USD", pdfUrl: null },
      ],
      payments: [],
    },
  });
  const cInvoices = await db.select().from(invoices).where(eq(invoices.firmId, cFirm.id));
  const [cClient] = await db.select().from(clients).where(eq(clients.firmId, cFirm.id));
  const newest = cInvoices.find((i) => i.number === "INV-5003")!;

  // The client clicks Pay on the newest invoice but sends enough for all three
  // plus $500 over. Oldest-first, then credit.
  const cascadeResult = await applyPaymentCascade({
    firmId: cFirm.id,
    clientId: cClient.id,
    amountCents: 1_050_000,
    method: "card",
    stripePaymentIntentId: "pi_verify_cascade",
    preferInvoiceId: newest.id,
  });
  check("applied $10,000 of the $10,500", cascadeResult.appliedCents === 1_000_000, cascadeResult.appliedCents);
  check("$500 parked as credit", cascadeResult.creditCents === 50_000, cascadeResult.creditCents);
  check("all three invoices settled", cascadeResult.settledInvoiceIds.length === 3, cascadeResult.settledInvoiceIds.length);
  const cAfter = await db.select().from(invoices).where(eq(invoices.firmId, cFirm.id));
  check("no invoice left with a balance", cAfter.every((i) => i.balanceCents === 0));
  check("all marked paid with a paid date", cAfter.every((i) => i.status === "paid" && i.paidAt));
  const cRuns = await db.select().from(sequenceRuns).where(eq(sequenceRuns.firmId, cFirm.id));
  check("every run completed", cRuns.every((r) => r.state === "completed"), cRuns.map((r) => r.state));

  section("10. a replayed payment webhook cannot credit the money twice");
  const replay = await applyPaymentCascade({
    firmId: cFirm.id,
    clientId: cClient.id,
    amountCents: 1_050_000,
    method: "card",
    stripePaymentIntentId: "pi_verify_cascade",
    preferInvoiceId: newest.id,
  });
  const paymentRows = await db.select().from(payments).where(eq(payments.firmId, cFirm.id));
  check("no extra payment rows", paymentRows.length === 3, paymentRows.length);
  check("replay applied nothing new", replay.appliedCents === 0, replay.appliedCents);
  const dupe = await recordPayment({
    firmId: cFirm.id,
    invoiceId: cAfter[0].id,
    amountCents: 100_000,
    method: "card",
    stripePaymentIntentId: "pi_verify_cascade",
  });
  check("recordPayment reports the duplicate", dupe.duplicate, dupe);
  check("balance unchanged by the duplicate", dupe.balanceCents === 0, dupe.balanceCents);

  section("11. a paid invoice is never chased, even with a stale status column");
  // Force the exact hazard: the money is in, but a reconciliation never ran, so
  // the cached status still says "open". The ladder must read the balance.
  await db.update(invoices).set({ status: "open", paidAt: null }).where(eq(invoices.firmId, cFirm.id));
  const paidChase = await runSweep({ firmId: cFirm.id, asOf: addDays(DUE, 45), skipSync: true });
  check(
    "no messages for a settled book",
    (await db.select().from(messages).where(eq(messages.firmId, cFirm.id))).length === 0,
    paidChase.firms[0].holds,
  );
  check("the stale status cache self-healed on the sweep", paidChase.firms[0].statusesReconciled === 3, paidChase.firms[0].statusesReconciled);
  // And the ladder itself refuses, independently of the cache: force the status
  // back to "open" and ask the manual send path, which does not reconcile first.
  await db.update(invoices).set({ status: "open" }).where(eq(invoices.id, cAfter[0].id));
  const chaseSettled = await sendNextStepNow(cFirm.id, cAfter[0].id, payFirm.userId);
  check(
    "manual send refuses a zero-balance invoice whose status says open",
    !chaseSettled.ok && /settled/i.test(chaseSettled.reason),
    chaseSettled,
  );

  section("12. VIP clients and the kill switch");
  await db.update(firms).set({ followUpPaused: true }).where(eq(firms.id, pFirmAuto.id));
  const guarded = await runSweep({ asOf: addDays(DUE, 500), skipSync: true });
  const pausedFirm = guarded.firms.find((f) => f.firmId === pFirmAuto.id);
  check("kill switch holds everything for that firm", (pausedFirm?.holds.firm_paused ?? 0) >= 1, pausedFirm?.holds);
  await db.update(firms).set({ followUpPaused: false }).where(eq(firms.id, pFirmAuto.id));

  const vipFirm = await createFirmAndOwner(`vip+${stamp}@northbank.studio`, "correct-horse-battery", "VIP Studio");
  const [vFirm] = await db.select().from(firms).where(eq(firms.id, vipFirm.firmId));
  await upsertBook({
    firm: vFirm, provider: "csv",
    book: {
      clients: [{ externalId: "c1", name: "Northgate Partners", contactName: "Ruth Alcott", emails: ["finance@northgatepartners.com"] }],
      invoices: [{ externalId: "i1", clientExternalId: "c1", number: "INV-6001", issuedAt: addDays(DUE, -60), dueAt: addDays(DUE, -30), amountCents: 320_000, balanceCents: 320_000, currency: "USD", pdfUrl: null }],
      payments: [],
    },
  });
  await db.update(clients).set({ vip: true }).where(eq(clients.firmId, vFirm.id));
  const vipSweep = await runSweep({ firmId: vFirm.id, asOf: addDays(DUE, 10), skipSync: true });
  check("a VIP client is never chased automatically", (vipSweep.firms[0].holds.vip ?? 0) === 1, vipSweep.firms[0].holds);
  check("and nothing was queued for them", (await db.select().from(messages).where(eq(messages.firmId, vFirm.id))).length === 0);

  section("13. CSV import");
  const csv = [
    "Customer,Contact,Email,Invoice Number,Invoice Date,Due Date,Total,Balance",
    "Ridgeway Bank,Cal Ndiaye,ap@ridgeway.bank,INV-7001,2026-01-05,2026-02-04,18400.00,18400.00",
    "Ridgeway Bank,Cal Ndiaye,ap@ridgeway.bank,INV-7002,2026-02-05,2026-03-07,6250.00,2000.00",
    "Bad Row,,,,,,notanumber,",
  ].join("\n");
  const plan = planImport(parseCsv(csv), 30);
  check("two good rows, one problem", plan.rows.length === 2 && plan.problems.length === 1, {
    rows: plan.rows.length,
    problems: plan.problems,
  });
  const importSummary = await upsertBook({
    firm: cFirm,
    provider: "csv",
    book: bookFromImportRows(plan.rows),
  });
  check("import created the client and invoices", importSummary.clientsUpserted === 1 && importSummary.invoicesUpserted === 2, importSummary);
  const imported = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.firmId, cFirm.id), inArray(invoices.number, ["INV-7001", "INV-7002"])));
  check("the part-paid row kept its balance", imported.find((i) => i.number === "INV-7002")?.balanceCents === 200_000);
  check("status derived as partial", imported.find((i) => i.number === "INV-7002")?.status === "partial");

  section("14. dashboard, forecast and client behaviour read back");
  const dashboard = await loadDashboard(firm);
  check("outstanding matches the open invoices", dashboard.aging.outstandingCents === open.reduce((s, r) => s + r.invoice.balanceCents, 0), dashboard.aging.outstandingCents);
  check("aging buckets add up", Object.values(dashboard.aging.buckets).reduce((s, b) => s + b.amountCents, 0) === dashboard.aging.outstandingCents);
  check("DSO computed", dashboard.dso !== null, dashboard.dso);
  check("attention feed sorted by urgency", dashboard.attention.every((row, i, arr) => i === 0 || arr[i - 1].urgency >= row.urgency));
  check("slowest payer identified", dashboard.slowestPayer !== null, dashboard.slowestPayer);
  check("no row claims 'due' on an overdue invoice", dashboard.attention.every((r) => r.daysLate === 0 || /overdue|part paid|disputed/.test(r.stateLine)), dashboard.attention.map((r) => r.stateLine));

  const forecast = await loadForecast(firm);
  check("forecast has 8 weekly columns", forecast.weeks.length === 8);
  check("forecast total is positive", forecast.totalCents > 0, forecast.totalCents);
  check("weighted total is below the raw total", forecast.weightedCents <= forecast.totalCents);
  console.log(`       forecast: ${formatMoney(forecast.totalCents)} raw, ${formatMoney(forecast.weightedCents)} weighted`);

  const clientRows = await loadClientRows(firm);
  check("client rows carry behaviour", clientRows.some((r) => r.behaviour.avgDaysToPay !== null));
  check("outstanding per client is non-negative", clientRows.every((r) => r.outstandingCents >= 0));

  const detail = await loadInvoiceDetail(soloFirm, soloInvoice.id);
  check("invoice detail loads with its timeline", (detail?.timeline.length ?? 0) === 4, detail?.timeline.length);
  check("invoice detail ladder says the ladder is done", detail?.ladder.hold === "ladder_complete", detail?.ladder);

  section("15. the client portal token and page");
  const token = await createPortalToken({ firmId: firm.id, clientId: open[0].client.id, invoiceId: open[0].invoice.id });
  const resolved = await resolvePortalToken(token);
  check("token round-trips", resolved.ok, resolved);
  if (resolved.ok) {
    const portal = await loadPortalContext(resolved.scope);
    check("portal loads the firm's letterhead", portal?.firm.id === firm.id);
    check("portal shows all the client's open invoices", (portal?.openInvoices.length ?? 0) >= 1, portal?.openInvoices.length);
    check("portal focuses the chased invoice", portal?.focusInvoiceId === open[0].invoice.id);
    check("portal total equals the sum of open balances", portal?.totalBalanceCents === portal?.openInvoices.reduce((s, i) => s + i.invoice.balanceCents, 0));
    check("portal knows payment is not wired up without Stripe Connect", portal?.canTakePayment === false);
  }
  const forged = await resolvePortalToken(`${token.slice(0, -3)}aaa`);
  check("a tampered token is rejected", !forged.ok && forged.reason === "invalid", forged);
  const nonsense = await resolvePortalToken("not-a-token");
  check("garbage is rejected", !nonsense.ok);

  section("16. promises list and stats recompute");
  const promiseList = await listPromises(pFirmAuto.id);
  check("promises list joins invoice and client", promiseList.length === 1 && promiseList[0].client.name === "Harbourline Group");
  check("recomputeClientStats runs clean", (await recomputeClientStats(firm.id)) === 4);

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
}

main()
  .catch((err) => {
    console.error("\nverification threw:", err);
    failures++;
  })
  .finally(async () => {
    await closeDb();
    process.exit(failures === 0 ? 0 : 1);
  });
