/**
 * Throwaway end-to-end verification against the real database.
 * Deleted before hand-off; anything worth keeping becomes a unit test.
 */
import { getDb, closeDb } from "@/db";
import * as s from "@/db/schema";
import { sql, eq, and } from "drizzle-orm";
import { hashPassword } from "@/lib/password";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { DEFAULT_LATE_FEE } from "@/lib/dues";
import {
  applyLateFee,
  applyLateFeesSweep,
  applyStripePayment,
  associationBalances,
  generateInvoices,
  householdInvoices,
  loadInvoice,
  markStripePaymentFailed,
  previewRun,
  recordManualPayment,
  refreshOverdueStatuses,
  runScheduledInvoicing,
  specialAssessment,
  waiveLateFee,
} from "@/lib/invoicing";
import { chargeRun, enroll, enrollmentStats } from "@/lib/autopay";
import { agingSummary, checksToChase, createPaymentPlan, reminderSweep } from "@/lib/reminders";
import { importRoster, parseRoster, roster, rosterExportCsv, transferOwnership, activeHouseholdCount } from "@/lib/roster";
import { mintPortalToken, verifyPortalToken, revokePortalToken, mintStepUpToken, verifyStepUpToken } from "@/lib/portal";
import { appendEvent, createIssue, listIssues, sendNotice, setIssueStatus, threadForBoard, threadForMember } from "@/lib/issues";
import { createAnnouncement, deliveryReport, resolveSegment, sendAnnouncement } from "@/lib/announcements";
import { uploadDocument, listDocuments, documentUrl } from "@/lib/documents";
import { dashboardData, periodProgress } from "@/lib/dashboard";
import { formatMoney } from "@/lib/money";
import { storageName, stripJpegMetadata } from "@/lib/storage";
import { today } from "@/lib/dates";

const db = getDb();
let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function eq_(label: string, actual: unknown, expected: unknown) {
  check(label, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}

async function reset() {
  await db.execute(sql`truncate associations cascade`);
  await db.execute(sql`truncate webhook_events, job_runs`);
}

async function main() {
  await reset();
  console.log(`storage adapter: ${storageName()}`);

  // ---- association + board ----
  const [assoc] = await db.insert(s.associations).values({
    name: "Maple Ridge Homeowners Association",
    kind: "hoa",
    plan: "neighborhood",
    settings: DEFAULT_SETTINGS,
  }).returning();
  const [pres] = await db.insert(s.users).values({
    associationId: assoc.id, email: "dana@mapleridge.org", name: "Dana Whitfield",
    passwordHash: await hashPassword("password1234"), role: "president",
  }).returning();
  const actor = { kind: "user" as const, id: pres.id, name: pres.name };

  console.log("\n== roster import ==");
  const csv = [
    "Unit,Owner,Email,Phone,Mailing Address,Closing Date,Co-owner,Co-owner Email",
    "204 Maple St,Rosa Alvarez,rosa@example.com,(614) 555-0142,204 Maple St,2019-06-14,Miguel Alvarez,miguel@example.com",
    "208 Maple St,Ken Oyelaran,ken@example.com,614-555-0187,,3/2/2021,,",
    "212 Maple St,Priya Raman,priya@example.com,,,2026-05-12,,",
    "216 Maple St,Harold Beck,not-an-email,6145550199,,2015-01-05,,",
    ",Nobody,x@example.com,,,,,",
    "208 Maple St,Duplicate Ken,dupe@example.com,,,,,",
  ].join("\n");
  const parsed = parseRoster(csv);
  eq_("parsed rows", parsed.rows.length, 4);
  check("problems reported", parsed.problems.length === 3, JSON.stringify(parsed.problems.map(p => p.reason)));
  const imported = await importRoster(assoc.id, csv, actor);
  eq_("households created", imported.createdHouseholds, 4);
  eq_("members created", imported.createdMembers, 5);
  const rerun = await importRoster(assoc.id, csv, actor);
  eq_("re-import creates nothing", [rerun.createdHouseholds, rerun.createdMembers], [0, 0]);
  eq_("active households", await activeHouseholdCount(assoc.id), 4);

  const entries = await roster(assoc.id);
  const byUnit = new Map(entries.map(e => [e.household.unitLabel, e]));
  const h204 = byUnit.get("204 Maple St")!.household;
  const h208 = byUnit.get("208 Maple St")!.household;
  const h212 = byUnit.get("212 Maple St")!.household;
  const h216 = byUnit.get("216 Maple St")!.household;
  eq_("212 joined mid-quarter", h212.joinedOn, "2026-05-12");
  check("Harold's bad email dropped", byUnit.get("216 Maple St")!.members[0].email === null);
  check("no SMS consent imported", entries.every(e => e.members.every(m => !m.smsOptIn)));

  console.log("\n== portal tokens ==");
  const rosa = byUnit.get("204 Maple St")!.members.find(m => m.email === "rosa@example.com")!;
  const t1 = await mintPortalToken(rosa.id);
  const v1 = await verifyPortalToken(t1);
  check("fresh token verifies", v1.ok);
  const t2 = await mintPortalToken(rosa.id);
  const v1b = await verifyPortalToken(t1);
  check("re-minting revokes the old link", !v1b.ok && v1b.reason === "revoked", JSON.stringify(v1b));
  check("new link works", (await verifyPortalToken(t2)).ok);
  await revokePortalToken(rosa.id);
  const v2 = await verifyPortalToken(t2);
  check("revoke kills the link", !v2.ok && v2.reason === "revoked");
  check("garbage token rejected", !(await verifyPortalToken("nonsense")).ok);
  const step = await mintStepUpToken(rosa.id);
  check("step-up verifies for its own member", await verifyStepUpToken(step, rosa.id));
  check("step-up rejected for another member", !(await verifyStepUpToken(step, h208.id)));
  const t3 = await mintPortalToken(rosa.id);
  check("portal token is not a step-up token", !(await verifyStepUpToken(t3, rosa.id)));
  check("step-up token is not a portal token", !(await verifyPortalToken(step)).ok);

  console.log("\n== dues schedule + preview ==");
  const [sched] = await db.insert(s.assessmentSchedules).values({
    associationId: assoc.id, name: "2026 Quarterly Dues", cadence: "quarterly",
    amountCents: 18000, dueDay: 1, startsOn: "2026-01-01", prorate: true,
    lateFeePolicy: DEFAULT_LATE_FEE,
  }).returning();

  // Q2 2026 = index 1
  const preview = await previewRun(sched.id, 1);
  eq_("preview count", preview.toCreate, 4);
  // 3 full at 18000 + 212 prorated (joined May 12: 50/91 days) = 54000 + 9890
  eq_("preview total", preview.toCreateCents, 63890);
  eq_("preview prorated", preview.proratedCount, 1);
  console.log(`  sentence: ${preview.sentence}`);

  const run1 = await generateInvoices(sched.id, 1, actor);
  eq_("generated", [run1.created, run1.totalCents], [4, 63890]);
  const run2 = await generateInvoices(sched.id, 1, actor);
  eq_("double-fire creates nothing", [run2.created, run2.skipped], [0, 4]);

  const inv212 = (await householdInvoices(h212.id))[0];
  eq_("prorated invoice amount", inv212.totalCents, 9890);
  check("proration note present", (inv212.invoice.prorationNote ?? "").includes("50 of 91"), inv212.invoice.prorationNote ?? "");

  console.log("\n== payments: check, partial, overpayment ==");
  const inv204 = (await householdInvoices(h204.id))[0];
  const partial = await recordManualPayment(
    { invoiceId: inv204.invoice.id, amountCents: 5000, method: "check", receivedOn: "2026-04-03", reference: "check 1841" }, actor);
  eq_("partial applied", [partial.appliedCents, partial.creditCents], [5000, 0]);
  let l204 = await loadInvoice(inv204.invoice.id);
  eq_("partial balance", l204!.balanceCents, 13000);
  eq_("partial status (derived as of today, past due)", l204!.invoice.status, "overdue");

  const over = await recordManualPayment(
    { invoiceId: inv204.invoice.id, amountCents: 15000, method: "check", receivedOn: "2026-04-20", reference: "check 1902" }, actor);
  eq_("overpayment split", [over.appliedCents, over.creditCents], [13000, 2000]);
  l204 = await loadInvoice(inv204.invoice.id);
  eq_("paid after settle", l204!.invoice.status, "paid");
  eq_("balance zero", l204!.balanceCents, 0);
  check("paidAt stamped", l204!.invoice.paidAt !== null);
  const bal = await associationBalances(assoc.id);
  eq_("credit on file", bal.get(h204.id)!.creditCents, 2000);

  console.log("\n== ACH honesty: processing -> succeeded, and processing -> failed ==");
  const inv208 = (await householdInvoices(h208.id))[0];
  const r1 = await applyStripePayment({ paymentIntentId: "pi_ach_1", invoiceId: inv208.invoice.id, amountCents: 18000, method: "ach", status: "pending", receivedOn: "2026-04-02" });
  check("pending applied", r1.changed);
  let l208 = await loadInvoice(inv208.invoice.id);
  eq_("shows processing", l208!.invoice.status, "processing");
  eq_("balance unchanged while in flight", l208!.balanceCents, 18000);
  eq_("nothing left to ask for", l208!.dueNowCents, 0);
  const dup = await applyStripePayment({ paymentIntentId: "pi_ach_1", invoiceId: inv208.invoice.id, amountCents: 18000, method: "ach", status: "pending" });
  check("retried pending webhook is a no-op", !dup.changed);
  const rowsFor208 = await db.select().from(s.payments).where(eq(s.payments.invoiceId, inv208.invoice.id));
  eq_("still one payment row", rowsFor208.length, 1);

  const r2 = await applyStripePayment({ paymentIntentId: "pi_ach_1", invoiceId: inv208.invoice.id, amountCents: 18000, method: "ach", status: "settled" });
  check("settle transition applied", r2.changed);
  l208 = await loadInvoice(inv208.invoice.id);
  eq_("now paid", l208!.invoice.status, "paid");
  const r3 = await applyStripePayment({ paymentIntentId: "pi_ach_1", invoiceId: inv208.invoice.id, amountCents: 18000, method: "ach", status: "settled" });
  check("retried succeeded webhook is a no-op", !r3.changed);
  eq_("still one payment row after settle", (await db.select().from(s.payments).where(eq(s.payments.invoiceId, inv208.invoice.id))).length, 1);

  const fail = await markStripePaymentFailed("pi_ach_1", "insufficient funds");
  check("failure recorded", fail.changed);
  l208 = await loadInvoice(inv208.invoice.id);
  eq_("reverts to unpaid, not paid", l208!.invoice.status, "overdue");
  eq_("balance restored", l208!.balanceCents, 18000);
  check("second failure is a no-op", !(await markStripePaymentFailed("pi_ach_1", "again")).changed);

  console.log("\n== late fee apply + waive ==");
  const inv216 = (await householdInvoices(h216.id))[0];
  const fee = await applyLateFee(inv216.invoice.id, actor, "2026-04-20");
  eq_("late fee charged", fee, 1500);
  let l216 = await loadInvoice(inv216.invoice.id);
  eq_("total with fee", l216!.totalCents, 19500);
  eq_("status overdue", l216!.invoice.status, "overdue");
  eq_("re-apply is a no-op", await applyLateFee(inv216.invoice.id, actor, "2026-04-21"), 0);
  const waived = await waiveLateFee(inv216.invoice.id, "Board voted to waive; hospital stay", actor);
  eq_("waived amount", waived, 1500);
  l216 = await loadInvoice(inv216.invoice.id);
  eq_("total back to dues", l216!.totalCents, 18000);
  eq_("fee lines kept on record", l216!.lines.length, 3);
  const auditRows = await db.select().from(s.auditLog).where(eq(s.auditLog.associationId, assoc.id));
  check("apply + waive both audited",
    auditRows.some(a => a.action === "applied_late_fee") && auditRows.some(a => a.action === "waived_late_fee"));

  console.log("\n== autopay: enrollment, double-fire, retry ladder ==");
  await enroll({ householdId: h212.id, stripeCustomerId: "cus_212", stripePaymentMethodId: "pm_212", method: "ach", memberId: null }, actor);
  await enroll({ householdId: h216.id, stripeCustomerId: "cus_216", stripePaymentMethodId: "pm_216", method: "card", memberId: null }, actor);
  const stats = await enrollmentStats(assoc.id);
  eq_("enrollment stats", [stats.households, stats.enrolled, stats.percent], [4, 2, 50]);

  const c1 = await chargeRun("2026-04-15", assoc.id);
  console.log(`  charge run 1: ${JSON.stringify(c1)}`);
  eq_("charged two", c1.charged, 2);
  const c2 = await chargeRun("2026-04-15", assoc.id);
  eq_("double-fired charge run charges nothing", [c2.charged, c2.processing], [0, 0]);
  const attempts = await db.select().from(s.autopayAttempts);
  eq_("one attempt per invoice", attempts.length, 2);
  const l212 = await loadInvoice(inv212.invoice.id);
  eq_("212 paid by autopay", l212!.invoice.status, "paid");
  eq_("212 charged prorated amount", l212!.settledCents, 9890);
  const pays212 = await db.select().from(s.payments).where(eq(s.payments.invoiceId, inv212.invoice.id));
  eq_("no double credit", pays212.length, 1);
  check("simulated intent id marked", (pays212[0].stripePaymentIntentId ?? "").startsWith("pi_dryrun_"), pays212[0].stripePaymentIntentId ?? "");

  console.log("\n== reminder ladder ==");
  const sweepEarly = await reminderSweep("2026-04-02");
  eq_("nothing due on day 1", sweepEarly.sent, 0);
  const sweep1 = await reminderSweep("2026-04-06");
  console.log(`  sweep at +5d: ${JSON.stringify(sweep1)}`);
  check("208 got a reminder", sweep1.sent >= 1);
  const inv208row = (await db.select().from(s.invoices).where(eq(s.invoices.id, inv208.invoice.id)))[0];
  eq_("rung 0 recorded", inv208row.reminderRungSent, 0);
  const sweep2 = await reminderSweep("2026-04-06");
  eq_("same-day double sweep sends nothing", sweep2.sent, 0);
  const sweep3 = await reminderSweep("2026-05-11");
  check("escalated later", sweep3.sent >= 1);
  const inv208row2 = (await db.select().from(s.invoices).where(eq(s.invoices.id, inv208.invoice.id)))[0];
  eq_("jumped to the board rung, not rung 1", inv208row2.reminderRungSent, 2);
  const delivered = await db.select().from(s.deliveries).where(and(eq(s.deliveries.associationId, assoc.id), eq(s.deliveries.invoiceId, inv208.invoice.id)));
  check("deliveries recorded", delivered.length >= 2, `${delivered.length} rows`);

  console.log("\n== aging + delinquency ==");
  await refreshOverdueStatuses("2026-05-20");
  const aging = await agingSummary(assoc.id, "2026-05-20");
  console.log(`  buckets: ${JSON.stringify(aging.buckets)}`);
  eq_("households outstanding", aging.householdsOutstanding, 1);
  eq_("outstanding total", aging.totalOutstandingCents, 18000);
  eq_("checks to chase", await checksToChase(assoc.id), 1);
  const bucket208 = aging.rows.find(r => r.household.id === h208.id)!;
  eq_("208 in the 1-30 bucket at +49d?", bucket208.bucket, "60");
  eq_("208 days late", bucket208.daysLate, 49);

  console.log("\n== special assessment ==");
  const special = await specialAssessment(assoc.id, { name: "Roof Special Assessment", amountCents: 45000, dueOn: "2026-06-01" }, actor);
  eq_("special created for every household", special.created, 4);
  eq_("special total", special.totalCents, 180000);

  console.log("\n== payment plan ==");
  const plan = await createPaymentPlan(h208.id, 3, "2026-07-01", actor);
  eq_("instalments sum to balance", plan.instalments.reduce((a, b) => a + b.amountCents, 0), 63000);
  console.log(`  instalments: ${plan.instalments.map(i => `${i.dueOn} ${formatMoney(i.amountCents)}`).join(", ")}`);
  const after = await associationBalances(assoc.id);
  eq_("balance unchanged by the plan", after.get(h208.id)!.balanceCents, 63000);

  console.log("\n== issues: numbering, visibility, notices ==");
  const iss1 = await createIssue({ associationId: assoc.id, householdId: h216.id, kind: "violation", title: "Fence height exceeds 6 ft on the Maple St side", body: "Measured 7 ft 4 in during the Apr 12 walkthrough.", visibility: "member_visible" }, actor);
  const iss2 = await createIssue({ associationId: assoc.id, householdId: null, kind: "maintenance", title: "Pool gate latch not catching", body: "Reported by two households." }, actor);
  eq_("issue numbers sequential", [iss1.number, iss2.number], [`${today().slice(0,4)}-001`, `${today().slice(0,4)}-002`]);
  await appendEvent(iss1.id, { body: "Counsel says give 30 days before any fine is considered. Do not send a fine notice.", visibility: "board_only" }, actor);
  await appendEvent(iss1.id, { body: "Photos attached from the walkthrough.", visibility: "member_visible", photoKeys: ["assoc/x/issues/y/fence.jpg"] }, actor);
  const boardThread = await threadForBoard(assoc.id, iss1.id);
  const memberThread = await threadForMember(h216.id, iss1.id);
  eq_("board sees all events", boardThread!.events.length, 3);
  eq_("member sees only visible events", memberThread!.events.length, 2);
  check("no board-only text in the member thread",
    !memberThread!.events.some(e => e.visibility === "board_only" || e.body.includes("Counsel says")));
  check("member cannot read another household's issue", (await threadForMember(h204.id, iss1.id)) === null);
  const notice = await sendNotice(iss1.id, "Please bring the fence into compliance or contact the board to discuss options.", actor);
  eq_("no email on file -> nothing delivered, recorded as failed", [notice.sent, notice.failed], [0, 1]);
  const iss3 = await createIssue({ associationId: assoc.id, householdId: h208.id, kind: "architectural", title: "Deck extension request", body: "Requesting 10x12 deck." }, actor);
  eq_("notice reaches a household with an email", (await sendNotice(iss3.id, "Approved subject to the setback in Article VII.", actor)).sent, 1);
  const thread2 = await threadForMember(h216.id, iss1.id);
  check("notice_sent event visible with delivery status",
    thread2!.events.some(e => e.kind === "notice_sent" && e.body.includes("Delivery:")));
  await setIssueStatus(iss1.id, "resolved", "Fence lowered to 5 ft 10 in; verified May 2.", actor);
  const listed = await listIssues(assoc.id, "open");
  eq_("open filter excludes resolved", listed.filter(l => l.issue.id === iss1.id).length, 0);
  try {
    await setIssueStatus(iss2.id, "closed", "  ", actor);
    check("closing without a note is refused", false);
  } catch { check("closing without a note is refused", true); }

  console.log("\n== announcements ==");
  const seg = await resolveSegment(assoc.id, { kind: "all" });
  eq_("all-segment recipients", seg.recipients.length, 5); // 4 households, 204 has two owners
  eq_("sms reach honest (nobody opted in)", seg.smsReach, 0);
  await db.update(s.members).set({ smsOptIn: true, phone: "+16145550187" }).where(eq(s.members.email, "ken@example.com"));
  eq_("sms reach after opt-in", (await resolveSegment(assoc.id, { kind: "all" })).smsReach, 1);
  const delinq = await resolveSegment(assoc.id, { kind: "delinquent", bucket: "any" });
  // 208 still owes Q2; every household owes the $450 special assessment created above.
  eq_("delinquent segment", [...new Set(delinq.recipients.map(r => r.household.unitLabel))].sort(),
      ["204 Maple St", "208 Maple St", "212 Maple St", "216 Maple St"]);
  const notDelinq = await resolveSegment(assoc.id, { kind: "units", householdIds: [h208.id] });
  eq_("unit segment", [...new Set(notDelinq.recipients.map(r => r.household.unitLabel))], ["208 Maple St"]);
  const ann = await createAnnouncement({ associationId: assoc.id, subject: "Annual meeting: June 18, 7pm at the clubhouse", bodyMd: "Hello {{name}}, the annual meeting is June 18. Quorum needs 21 households.", segment: { kind: "all" }, channels: ["email", "sms"] }, actor);
  const sent = await sendAnnouncement(ann.id, actor);
  console.log(`  send summary: ${JSON.stringify(sent)}`);
  eq_("emails to everyone with an address (Harold has none)", [sent.emailsSent, sent.emailsFailed], [4, 1]);
  eq_("sms only to the opted-in member", sent.smsSent, 1);
  const resend = await sendAnnouncement(ann.id, actor);
  eq_("re-send does not re-message", [resend.emailsSent, resend.smsSent], [0, 0]);
  const report = await deliveryReport(ann.id);
  console.log(`  report counts: ${JSON.stringify(report!.counts)} problems=${report!.problems.length}`);
  check("Harold's missing address shows as a problem", report!.problems.some(p => p.unitLabel === "216 Maple St"));

  console.log("\n== documents ==");
  const doc1 = await uploadDocument({ associationId: assoc.id, title: "Bylaws", category: "bylaws", versionLabel: "v2 (2019 amendment)", memberVisible: true, filename: "bylaws.pdf", contentType: "application/pdf", bytes: Buffer.from("%PDF-1.4 bylaws v2") }, actor);
  const doc2 = await uploadDocument({ associationId: assoc.id, title: "Bylaws", category: "bylaws", versionLabel: "v3 (2026 amendment)", memberVisible: true, filename: "bylaws.pdf", contentType: "application/pdf", bytes: Buffer.from("%PDF-1.4 bylaws v3"), supersedesId: doc1.id }, actor);
  eq_("current documents", (await listDocuments(assoc.id)).map(d => d.versionLabel), ["v3 (2026 amendment)"]);
  eq_("history kept", (await listDocuments(assoc.id, { includeSuperseded: true })).length, 2);
  const url = await documentUrl(doc2);
  check("signed url minted", url.includes("/api/files/") && url.includes("sig="), url.slice(0, 80));
  await uploadDocument({ associationId: assoc.id, title: "2026 board minutes (draft)", category: "minutes", versionLabel: "v1", memberVisible: false, filename: "min.txt", contentType: "text/plain", bytes: Buffer.from("draft") }, actor);
  eq_("member-visible filter", (await listDocuments(assoc.id, { memberVisibleOnly: true })).length, 1);

  console.log("\n== exif stripping ==");
  const jpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xe1, 0x00, 0x10]), Buffer.from("Exif\0\0GPS_HERE"),
    Buffer.from([0xff, 0xdb, 0x00, 0x05]), Buffer.from([1, 2, 3]),
    Buffer.from([0xff, 0xda]), Buffer.from([9, 9, 9]),
  ]);
  const stripped = stripJpegMetadata(jpeg);
  check("exif segment removed", !stripped.includes(Buffer.from("GPS_HERE")));
  check("image data preserved", stripped.includes(Buffer.from([0xff, 0xda, 9, 9, 9])));
  check("non-jpeg passes through", stripJpegMetadata(Buffer.from("PNG")).equals(Buffer.from("PNG")));

  console.log("\n== ownership transfer ==");
  const incoming = await transferOwnership(h204.id, { leftOn: "2026-06-30", newPrimaryName: "Tomas Lindqvist", newPrimaryEmail: "tomas@example.com", joinedOn: "2026-07-01" }, actor);
  const closed = (await db.select().from(s.households).where(eq(s.households.id, h204.id)))[0];
  eq_("old household closed", closed.leftOn, "2026-06-30");
  eq_("successor linked", closed.succeededById, incoming.id);
  eq_("active count unchanged", await activeHouseholdCount(assoc.id), 4);
  const q3 = await previewRun(sched.id, 2);
  const q3units = q3.lines.map(l => l.unitLabel);
  eq_("Q3 bills the new owner once for 204", q3units.filter(u => u === "204 Maple St").length, 1);
  const csvOut = await rosterExportCsv(assoc.id);
  check("export includes closed households", csvOut.includes("closed"), csvOut.split("\n").length + " lines");
  check("export does not leak portal tokens", !/eyJ/.test(csvOut));

  console.log("\n== dashboard ==");
  const prog = await periodProgress(assoc.id, "2026-05-20");
  console.log(`  ${prog.label}: collected ${formatMoney(prog.collectedCents)} of ${formatMoney(prog.expectedCents)} (${prog.percent}%)`);
  const dash = await dashboardData(assoc.id, "neighborhood", "2026-05-20");
  console.log(`  open issues ${dash.openIssues} · chase ${dash.checksToChase} · autopay ${dash.autopay.percent}% · units ${dash.usage.used}/${dash.usage.included}`);
  check("activity feed populated", dash.activity.length > 0);

  console.log("\n== late fee sweep + scheduled invoicing ==");
  const swept = await applyLateFeesSweep("2026-08-01");
  console.log(`  late fees applied by sweep: ${swept}`);
  const sweptAgain = await applyLateFeesSweep("2026-08-02");
  eq_("sweep is idempotent", sweptAgain, 0);
  const scheduled = await runScheduledInvoicing("2026-07-05");
  console.log(`  scheduled invoicing on Jul 5: created ${scheduled.created}`);
  eq_("Q3 generated once", scheduled.created, 4);
  eq_("second cron pass creates nothing", (await runScheduledInvoicing("2026-07-05")).created, 0);

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  await closeDb();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
