/**
 * Throwaway end-to-end exercise of the QuoteFox domain against real Postgres.
 * Not shipped; the valuable assertions get lifted into unit tests.
 */
import { config } from "dotenv";
config({ path: [".env.local"], quiet: true });

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import {
  deposits,
  estimateLineItems,
  estimates,
  jobs,
  organizations,
  proposalEvents,
  proposalNudges,
  proposals,
  users,
  walkthroughs,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { createJob } from "@/lib/jobs";
import { seedStarterTemplate, itemCount, listItems, planImport, applyImport } from "@/lib/price-book";
import { startWalkthrough, registerUpload, confirmUpload, completeWalkthrough, claimQuote } from "@/lib/walkthroughs";
import { getEstimate, updateLineItem, markReady, recomputeTotals } from "@/lib/estimates";
import { sendProposal, recordView, acceptProposal, loadProposal, resendProposal } from "@/lib/proposals";
import { createDepositCheckout, computeDepositCents, depositWarning } from "@/lib/deposits";
import { handleStripeEvent, claimEvent } from "@/lib/billing";
import { runSweep } from "@/lib/sweep";
import { verifyProposalToken } from "@/lib/tokens";
import { formatMoney } from "@/lib/money";
import { putObject } from "@/lib/storage";
import { TRIAL_QUOTE_LIMIT } from "@/lib/plans";
import { proposalState } from "@/lib/display";

const db = getDb();
const log = (...args: unknown[]) => console.log(...args);
let failures = 0;
function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) log(`  ok   ${label}`);
  else {
    failures += 1;
    log(`  FAIL ${label}`, detail === undefined ? "" : detail);
  }
}

async function main() {
  const suffix = randomBytes(3).toString("hex");
  log("== 1. org + owner ==");
  const [org] = await db
    .insert(organizations)
    .values({
      name: `Deleon Mechanical ${suffix}`,
      trade: "hvac",
      plan: "solo",
      subscriptionStatus: "trialing",
      trialEndsAt: new Date(Date.now() + 14 * 86_400_000),
      licenseNumber: "TACLA00281C",
      phone: "(512) 555-0143",
      address: "1804 Airport Blvd, Austin, TX 78702",
      defaultMarkupPct: 35,
      taxRateBp: 825,
      defaultDepositType: "percent",
      defaultDepositValue: 10,
      onboardedAt: new Date(),
    })
    .returning();
  const [owner] = await db
    .insert(users)
    .values({
      organizationId: org.id,
      email: `owner-${suffix}@deleonmech.test`,
      name: "Ray Deleon",
      role: "owner",
      passwordHash: await hashPassword("driveway-quotes-2026"),
    })
    .returning();
  check("org created", Boolean(org.id));

  log("== 2. starter price book ==");
  const seeded = await seedStarterTemplate(org.id, "hvac");
  const again = await seedStarterTemplate(org.id, "hvac");
  check("seeded starter items", seeded === 18, seeded);
  check("re-seed is idempotent", again === 0, again);
  check("item count", (await itemCount(org.id)) === 18);

  log("== 3. CSV import ==");
  const csv = [
    "Category,Name,Kind,Unit,Unit Cost,Markup %,Notes",
    'Equipment,"Condenser, 3-ton 15.2 SEER2 R-410A",Material,each,"2,050.00",35,price went up',
    "Materials,Crane mat set,Material,each,$180.00,20,",
    "Labor,Weekend overtime labor,Labor,hour,142.50,40,",
    "Materials,,Material,each,10,,missing name",
    "Materials,Bad price item,Material,each,not-a-number,,",
  ].join("\n");
  const plan = planImport(csv);
  check("plan reads 3 usable rows", plan.rows.length === 3, plan.rows.map((r) => r.values.name));
  check("plan skips 2 bad rows", plan.skipped.length === 2, plan.skipped);
  const outcome = await applyImport(org, owner.id, plan);
  check("import added 2 new", outcome.imported === 2, outcome);
  check("import updated the existing condenser", outcome.updated === 1, outcome);
  const condenser = (await listItems(org.id)).find((i) => i.name.startsWith("Condenser, 3-ton"));
  check("condenser cost updated to 205000", condenser?.unitCostCents === 205_000, condenser?.unitCostCents);

  log("== 4. job + walkthrough capture ==");
  const jobResult = await createJob(org, owner.id, {
    customerName: "Marisol Vance",
    customerEmail: `marisol-${suffix}@example.test`,
    customerPhone: "(512) 555-0177",
    address: "4412 Ramsey Ave, Austin, TX 78756",
    title: "Ramsey Ave — condenser changeout",
  });
  if (!jobResult.ok) throw new Error(jobResult.error);
  const job = jobResult.job;
  check("state parsed from address", job.stateCode === "TX", job.stateCode);

  const walkthrough = await startWalkthrough(org, owner.id, job.id);
  const audioReg = await registerUpload({
    org,
    walkthroughId: walkthrough.id,
    kind: "audio",
    sequence: 0,
    contentType: "audio/webm",
  });
  if (!audioReg.ok) throw new Error(audioReg.error);
  // Simulate the phone PUTing the bytes.
  await putObject(audioReg.upload.key, Buffer.from("fake-audio-bytes-".repeat(64)), "audio/webm");
  const audioConfirm = await confirmUpload(org.id, audioReg.upload.mediaId);
  check("audio upload confirmed against storage", audioConfirm.ok, audioConfirm);

  const photoReg = await registerUpload({
    org,
    walkthroughId: walkthrough.id,
    kind: "photo",
    sequence: 0,
    contentType: "image/jpeg",
  });
  if (!photoReg.ok) throw new Error(photoReg.error);
  await putObject(photoReg.upload.key, Buffer.from("fake-photo"), "image/jpeg");
  await confirmUpload(org.id, photoReg.upload.mediaId, "Rusted condenser pad sitting in standing water");

  // A photo that never actually lands: must be marked failed, not block the draft.
  const ghost = await registerUpload({
    org,
    walkthroughId: walkthrough.id,
    kind: "photo",
    sequence: 1,
    contentType: "image/jpeg",
  });
  if (!ghost.ok) throw new Error(ghost.error);
  const ghostConfirm = await confirmUpload(org.id, ghost.upload.mediaId);
  check("missing object is not confirmed", !ghostConfirm.ok);

  log("== 5. pipeline ==");
  const completed = await completeWalkthrough(org, owner.id, walkthrough.id, {
    durationSeconds: 247,
    notes: "Static pressure is high on the return side, add a filter-back return grille.",
  });
  if (!completed.ok) throw new Error(`${completed.code}: ${completed.message}`);
  const first = await getEstimate(org.id, completed.estimateId);
  check("estimate drafted", Boolean(first));
  check("rows drafted", (first?.lines.length ?? 0) >= 8, first?.lines.length);
  const flagged = first!.lines.filter((l) => l.needsPricing);
  check("crane flagged as needs pricing", flagged.length === 1, flagged.map((l) => l.name));
  check("no flagged row carries money", flagged.every((l) => l.unitPriceCents === 0 && l.lineTotalCents === 0));
  check(
    "every priced row references a real price book item",
    first!.lines.filter((l) => !l.needsPricing).every((l) => Boolean(l.priceBookItemId)),
  );
  check("every row cites narration", first!.lines.every((l) => (l.transcriptExcerpt ?? "").length > 0));
  const [wt] = await db.select().from(walkthroughs).where(eq(walkthroughs.id, walkthrough.id));
  check("walkthrough drafted", wt.status === "drafted", wt.status);
  check("transcript source labelled demo", wt.transcriptSource === "demo_fixture", wt.transcriptSource);
  check("notes are part of the transcript", (wt.transcript ?? "").includes("filter-back"), wt.transcript?.slice(0, 80));
  const returnGrille = first!.lines.find((l) => l.name.includes("Return grille"));
  check("notes produced a matched row (return grille)", Boolean(returnGrille), first!.lines.map((l) => l.name));
  log(`     total so far ${formatMoney(first!.estimate.totalCents)} over ${first!.lines.length} rows`);

  log("== 6. idempotent re-complete ==");
  const again2 = await completeWalkthrough(org, owner.id, walkthrough.id);
  check("second complete returns the same estimate", again2.ok && again2.estimateId === completed.estimateId, again2);
  const [orgAfter] = await db.select().from(organizations).where(eq(organizations.id, org.id));
  check("only one quote metered", orgAfter.quoteCountCurrentPeriod === 1, orgAfter.quoteCountCurrentPeriod);

  log("== 7. send blocked while a row needs pricing ==");
  const blocked = await sendProposal(orgAfter, owner.id, completed.estimateId);
  check("send refused", !blocked.ok, blocked);
  const ready1 = await markReady(orgAfter, owner.id, completed.estimateId);
  check("mark ready refused too", !ready1.ok, ready1);

  log("== 8. price the flagged row ==");
  const craneRow = flagged[0];
  const priced = await updateLineItem(orgAfter, owner.id, completed.estimateId, craneRow.id, {
    name: "Crane lift for rooftop unit",
    unitPriceCents: 145_000,
    quantityMilli: 1000,
  });
  check("flagged row priced", priced.ok, priced);
  const afterPricing = await getEstimate(org.id, completed.estimateId);
  const craneAfter = afterPricing!.lines.find((l) => l.id === craneRow.id);
  check("flag cleared", craneAfter?.needsPricing === false);
  check("crane line total", craneAfter?.lineTotalCents === 145_000, craneAfter?.lineTotalCents);
  const expectedSubtotal = afterPricing!.lines.reduce((s, l) => s + l.lineTotalCents, 0);
  check("subtotal matches rows", afterPricing!.estimate.subtotalCents === expectedSubtotal, {
    stored: afterPricing!.estimate.subtotalCents,
    expected: expectedSubtotal,
  });
  check(
    "tax excludes labour",
    afterPricing!.estimate.taxCents < Math.round((expectedSubtotal * 825) / 10_000),
    { tax: afterPricing!.estimate.taxCents },
  );

  log("== 9. deposit arithmetic ==");
  check("10% deposit", computeDepositCents(1_000_000, "percent", 10) === 100_000);
  check("fixed deposit is clamped to the total", computeDepositCents(50_000, "fixed", 100_000) === 50_000);
  check("no deposit", computeDepositCents(1_000_000, "none", 10) === 0);
  const caWarning = depositWarning(100_001, 1_000_010, "CA");
  check("CA cap warns above $1,000", Boolean(caWarning), caWarning);
  check("TX has no cap", depositWarning(500_000, 1_000_000, "TX") === null);

  log("== 10. send the proposal ==");
  const sent = await sendProposal(afterPricing!.estimate.status === "sent" ? orgAfter : orgAfter, owner.id, completed.estimateId);
  if (!sent.ok) throw new Error(sent.error);
  check("proposal sent", Boolean(sent.proposalId));
  check("email reported undelivered under DRY_RUN", sent.emailed === false, sent.emailError);
  const token = sent.url.split("/p/")[1];
  const verified = await verifyProposalToken(token);
  check("token verifies", verified.ok, verified);
  const bundle = await loadProposal(sent.proposalId);
  check("pdf snapshot archived", Boolean(bundle?.proposal.pdfKey), bundle?.proposal.pdfKey);
  check("deposit frozen on the proposal", bundle!.proposal.depositCents === computeDepositCents(bundle!.proposal.totalCents, "percent", 10), bundle!.proposal.depositCents);
  const [jobAfterSend] = await db.select().from(jobs).where(eq(jobs.id, job.id));
  check("job marked quoted", jobAfterSend.status === "quoted", jobAfterSend.status);
  const [estAfterSend] = await db.select().from(estimates).where(eq(estimates.id, completed.estimateId));
  check("estimate marked sent", estAfterSend.status === "sent");

  log("== 11. sent estimates are frozen ==");
  const frozen = await updateLineItem(orgAfter, owner.id, completed.estimateId, craneRow.id, { unitPriceCents: 1 });
  check("edit after send refused", !frozen.ok, frozen);

  log("== 12. homeowner view ==");
  await recordView(sent.proposalId, { userAgent: "Mozilla/5.0 (iPhone)", ip: "203.0.113.9" });
  await recordView(sent.proposalId, { userAgent: "Mozilla/5.0 (iPhone)", ip: "203.0.113.9" });
  const afterView = await loadProposal(sent.proposalId);
  check("status viewed", afterView!.proposal.status === "viewed");
  check("first view recorded once", afterView!.events.filter((e) => e.type === "viewed").length === 2);
  check("firstViewedAt set", Boolean(afterView!.proposal.firstViewedAt));

  log("== 13. acceptance ==");
  const shortName = await acceptProposal(sent.proposalId, "M", "203.0.113.9");
  check("short name refused", !shortName.ok, shortName);
  const accepted = await acceptProposal(sent.proposalId, "Marisol Vance", "203.0.113.9");
  check("accepted", accepted.ok && !accepted.alreadyAccepted, accepted);
  const twice = await acceptProposal(sent.proposalId, "Marisol Vance", "203.0.113.9");
  check("double-tap accept is idempotent", twice.ok && twice.alreadyAccepted, twice);
  const afterAccept = await loadProposal(sent.proposalId);
  check("acceptance record stored", afterAccept!.proposal.acceptedByName === "Marisol Vance");
  check("acceptance ip stored", afterAccept!.proposal.acceptanceIp === "203.0.113.9");
  check("nudges cancelled on accept", (await db.select().from(proposalNudges).where(eq(proposalNudges.proposalId, sent.proposalId))).length === 2);

  log("== 14. deposit checkout without Stripe ==");
  const checkout = await createDepositCheckout(sent.proposalId);
  check("checkout refuses honestly", !checkout.ok && checkout.code === "stripe_unconfigured", checkout);

  log("== 15. deposit paid via webhook handler ==");
  const [depositRow] = await db
    .insert(deposits)
    .values({
      organizationId: org.id,
      proposalId: sent.proposalId,
      amountCents: afterAccept!.proposal.depositCents,
      currency: "usd",
      status: "pending",
      stripeAccountId: "acct_test_deleon",
      stripeCheckoutSessionId: `cs_test_${suffix}`,
    })
    .returning();
  await db
    .update(organizations)
    .set({ stripeConnectAccountId: "acct_test_deleon", stripeConnectReady: true })
    .where(eq(organizations.id, org.id));

  const event = {
    id: `evt_test_${suffix}`,
    type: "checkout.session.completed",
    account: "acct_test_deleon",
    data: {
      object: {
        id: `cs_test_${suffix}`,
        mode: "payment",
        payment_intent: `pi_test_${suffix}`,
        amount_total: depositRow.amountCents,
        metadata: {
          quotefoxDepositId: depositRow.id,
          quotefoxProposalId: sent.proposalId,
          quotefoxOrgId: org.id,
        },
      },
    },
  } as unknown as Parameters<typeof handleStripeEvent>[0];

  check("first delivery is claimed", await claimEvent(event));
  await handleStripeEvent(event);
  const paid = await loadProposal(sent.proposalId);
  check("proposal deposit_paid", paid!.proposal.status === "deposit_paid", paid!.proposal.status);
  check("deposit row paid", paid!.deposit?.status === "paid");
  const [jobWon] = await db.select().from(jobs).where(eq(jobs.id, job.id));
  check("job won", jobWon.status === "won", jobWon.status);

  log("== 16. webhook replay x5 ==");
  for (let i = 0; i < 5; i++) {
    const fresh = await claimEvent(event);
    if (fresh) failures += 1;
    await handleStripeEvent(event);
  }
  const paidEvents = (await db
    .select()
    .from(proposalEvents)
    .where(and(eq(proposalEvents.proposalId, sent.proposalId), eq(proposalEvents.type, "deposit_paid")))).length;
  check("only one deposit_paid event after 5 replays", paidEvents === 1, paidEvents);
  const depositRows = await db.select().from(deposits).where(eq(deposits.proposalId, sent.proposalId));
  check("only one deposit row", depositRows.length === 1, depositRows.length);
  check("still paid once", depositRows[0].status === "paid");

  log("== 17. nudges: fixed rungs, no repeats ==");
  // A second job whose proposal goes unread.
  const job2 = await createJob(org, owner.id, {
    customerName: "Bo Hendricks",
    customerEmail: `bo-${suffix}@example.test`,
    address: "902 Pecan Grove, Round Rock, TX 78664",
    title: "Pecan Grove — furnace changeout",
  });
  if (!job2.ok) throw new Error(job2.error);
  const wt2 = await startWalkthrough(org, owner.id, job2.job.id);
  const done2 = await completeWalkthrough(org, owner.id, wt2.id, { durationSeconds: 180, notes: "Furnace is a 96% two-stage, 80k BTU. Six hours for the lead tech." });
  if (!done2.ok) throw new Error(`${done2.code}: ${done2.message}`);
  const est2 = await getEstimate(org.id, done2.estimateId);
  for (const line of est2!.lines.filter((l) => l.needsPricing)) {
    await updateLineItem(org, owner.id, done2.estimateId, line.id, { unitPriceCents: 90_000 });
  }
  const [orgForSend] = await db.select().from(organizations).where(eq(organizations.id, org.id));
  const sent2 = await sendProposal(orgForSend, owner.id, done2.estimateId);
  if (!sent2.ok) throw new Error(sent2.error);

  // Backdate the send by three days: the day-2 rung is due, the day-5 is not.
  await db
    .update(proposals)
    .set({ sentAt: new Date(Date.now() - 3 * 86_400_000) })
    .where(eq(proposals.id, sent2.proposalId));

  // Solo plan: nudges are gated, so the rung is skipped and recorded.
  await db.update(organizations).set({ subscriptionStatus: "active", plan: "solo" }).where(eq(organizations.id, org.id));
  const soloSweep = await runSweep({ organizationId: org.id });
  check("solo sweep sends nothing", soloSweep.nudgesSent === 0, soloSweep);
  const soloRungs = await db.select().from(proposalNudges).where(eq(proposalNudges.proposalId, sent2.proposalId));
  check("day-2 rung recorded as skipped on Solo", soloRungs.length === 1 && Boolean(soloRungs[0].skippedReason?.includes("plan")), soloRungs);

  // Crew plan, another proposal, day 6: the *tightest* due rung fires, day 2 is
  // written as skipped so it can never fire late.
  const job3 = await createJob(org, owner.id, {
    customerName: "Odette Rios",
    customerEmail: `odette-${suffix}@example.test`,
    address: "17 Cypress Bend, Austin, TX 78745",
    title: "Cypress Bend — mini-split add",
  });
  if (!job3.ok) throw new Error(job3.error);
  await db.update(organizations).set({ plan: "crew" }).where(eq(organizations.id, org.id));
  const [orgCrew] = await db.select().from(organizations).where(eq(organizations.id, org.id));
  const wt3 = await startWalkthrough(orgCrew, owner.id, job3.job.id);
  const done3 = await completeWalkthrough(orgCrew, owner.id, wt3.id, { durationSeconds: 150, notes: "Add a 12k BTU mini-split head in the garage plus a new disconnect box." });
  if (!done3.ok) throw new Error(`${done3.code}: ${done3.message}`);
  const est3 = await getEstimate(org.id, done3.estimateId);
  for (const line of est3!.lines.filter((l) => l.needsPricing)) {
    await updateLineItem(orgCrew, owner.id, done3.estimateId, line.id, { unitPriceCents: 50_000 });
  }
  const sent3 = await sendProposal(orgCrew, owner.id, done3.estimateId);
  if (!sent3.ok) throw new Error(sent3.error);
  await db
    .update(proposals)
    .set({ sentAt: new Date(Date.now() - 6 * 86_400_000) })
    .where(eq(proposals.id, sent3.proposalId));

  const crewSweep = await runSweep({ organizationId: org.id });
  check("one nudge sent", crewSweep.nudgesSent === 1, crewSweep);
  const rungs3 = await db.select().from(proposalNudges).where(eq(proposalNudges.proposalId, sent3.proposalId));
  check("both rungs decided", rungs3.length === 2, rungs3);
  check("day 5 sent, day 2 skipped", Boolean(rungs3.find((r) => r.rung === 5)?.sentAt) && rungs3.find((r) => r.rung === 2)?.sentAt === null, rungs3);

  const secondSweep = await runSweep({ organizationId: org.id });
  check("re-running the sweep sends nothing", secondSweep.nudgesSent === 0, secondSweep);
  const thirdSweep = await runSweep({ organizationId: org.id, asOf: new Date(Date.now() + 20 * 86_400_000) });
  check("20 days later still sends nothing", thirdSweep.nudgesSent === 0, thirdSweep);

  log("== 18. expiry is derived, and swept ==");
  await db
    .update(proposals)
    .set({ expiresAt: new Date(Date.now() - 86_400_000), status: "sent" })
    .where(eq(proposals.id, sent2.proposalId));
  const [expiredish] = await db.select().from(proposals).where(eq(proposals.id, sent2.proposalId));
  check("derived state is expired before any sweep", proposalState(expiredish) === "expired");
  const expirySweep = await runSweep({ organizationId: org.id });
  check("sweep marks it expired", expirySweep.expired === 1, expirySweep);
  const tokenCheck = await verifyProposalToken(sent2.url.split("/p/")[1]);
  check("expired link refuses", !tokenCheck.ok && tokenCheck.reason === "expired", tokenCheck);

  log("== 19. resend rotates the link ==");
  await db
    .update(proposals)
    .set({ status: "sent", expiresAt: new Date(Date.now() + 30 * 86_400_000) })
    .where(eq(proposals.id, sent2.proposalId));
  const oldToken = sent2.url.split("/p/")[1];
  const resent = await resendProposal(orgCrew, owner.id, sent2.proposalId);
  check("resent", resent.ok, resent);
  const oldCheck = await verifyProposalToken(oldToken);
  check("old link revoked", !oldCheck.ok && oldCheck.reason === "revoked", oldCheck);
  const newCheck = await verifyProposalToken((resent as { url: string }).url.split("/p/")[1]);
  check("new link works", newCheck.ok);

  log("== 20. plan gate at the quote limit ==");
  await db
    .update(organizations)
    .set({ subscriptionStatus: "trialing", quoteCountCurrentPeriod: TRIAL_QUOTE_LIMIT })
    .where(eq(organizations.id, org.id));
  const [orgAtLimit] = await db.select().from(organizations).where(eq(organizations.id, org.id));
  const claim = await claimQuote(orgAtLimit);
  check("quota refused at the trial limit", !claim.ok && claim.code === "PLAN_LIMIT", claim);
  const jobBlocked = await createJob(orgAtLimit, owner.id, {
    customerName: "Trial Limit",
    customerEmail: `limit-${suffix}@example.test`,
    address: "1 Test Way, Austin, TX 78701",
    title: "Over the trial cap",
  });
  if (!jobBlocked.ok) throw new Error(jobBlocked.error);
  const wtBlocked = await startWalkthrough(orgAtLimit, owner.id, jobBlocked.job.id);
  check("capture still starts at the limit", Boolean(wtBlocked.id));
  const blockedDraft = await completeWalkthrough(orgAtLimit, owner.id, wtBlocked.id, { durationSeconds: 90, notes: "Quick look at the attic unit." });
  check("drafting is what gets blocked", !blockedDraft.ok && blockedDraft.code === "PLAN_LIMIT", blockedDraft);
  const [wtBlockedRow] = await db.select().from(walkthroughs).where(eq(walkthroughs.id, wtBlocked.id));
  check("walkthrough kept, marked failed with reason", wtBlockedRow.status === "failed" && wtBlockedRow.failureReason === "plan_limit", wtBlockedRow.failureReason);

  log("== 21. totals recompute is stable ==");
  const before = (await getEstimate(org.id, done3.estimateId))!.estimate;
  const after = await recomputeTotals(done3.estimateId);
  check("recompute is idempotent", before.totalCents === after.totalCents, { before: before.totalCents, after: after.totalCents });

  log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  await closeDb();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
