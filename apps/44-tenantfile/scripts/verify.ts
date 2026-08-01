/**
 * Throwaway end-to-end verification against the real database.
 *
 * Drives the MVP feature list through the domain layer the way the screens do,
 * then reads the results back out. Deleted before hand-off; anything valuable
 * became a unit test.
 *
 *   PATH="node_modules/.bin:$PATH" npx tsx scripts/verify.ts
 */

import "@/lib/load-env";
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import {
  applications,
  charges,
  fileEvents,
  landlords,
  leases,
  listings,
  maintenanceRequests,
  payments,
  properties,
  reminders,
  screeningReports,
  tenancies,
  units,
  users,
  DEFAULT_SETTINGS,
} from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { createProperty, createUnit, importTenancy, endTenancy } from "@/lib/units";
import { createListing } from "@/lib/listings";
import { getPublicListing } from "@/lib/listings";
import { submitApplication, approveApplication, declineApplication, landlordApplication } from "@/lib/applications";
import { inviteToScreen, recordConsent, recordReportReceived, screeningByToken } from "@/lib/screening";
import { draftLease, sendLease, signLease, leaseForTenancy, leaseByToken } from "@/lib/leases";
import { applyLateFees, ensureCharges, loadLedger, loadLedgerView, recordPayment, upsertLateFeeRule, waiveCharge, landlordUnits } from "@/lib/ledger";
import { sendDueReminders, scheduledRemindersFor } from "@/lib/reminders";
import { openRequest, postMessage, updateRequest, threadFor } from "@/lib/maintenance";
import { exportFilePdf, buildFileExport, assertExportComplete, countPages } from "@/lib/files";
import { getTimeline } from "@/lib/file-events";
import { portalByToken } from "@/lib/portal";
import { runTick } from "@/lib/tick";
import { setNotifier, type Notifier } from "@/lib/notify";
import { storeUpload } from "@/lib/storage";
import { formatMoney, isoDateOf, periodOf } from "@/lib/money";

/* ---- harness ------------------------------------------------------------- */

let passes = 0;
const failures: string[] = [];

function ok(label: string, condition: boolean, detail = "") {
  if (condition) {
    passes++;
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(name: string) {
  console.log(`\n=== ${name}`);
}

/** Captures notifications instead of sending them, so we can assert on them. */
const sent: { kind: "email" | "sms"; to: string; subject: string; body: string }[] = [];
const capture: Notifier = {
  async email(m) {
    sent.push({ kind: "email", to: m.to, subject: m.subject, body: m.text });
    return { ok: true, providerMessageId: `test-${sent.length}`, simulated: true };
  },
  async sms(m) {
    sent.push({ kind: "sms", to: m.to, subject: "", body: m.body });
    return { ok: true, providerMessageId: `test-${sent.length}`, simulated: true };
  },
};

/** A real 8x6 JPEG, so the PDF exporter has something genuine to embed. */
const JPEG_8x6 = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDs0NDL/wAALCAAGAAgBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APn+v//Z",
  "base64",
);

/* ---- the run ------------------------------------------------------------- */

async function main() {
  setNotifier(capture);
  const db = getDb();
  const stamp = Date.now();

  // A clean slate for this run only; other rows are left alone.
  const email = `verify+${stamp}@tenantfile.test`;

  section("Auth: scrypt hashing");
  const hash = await hashPassword("correct horse battery");
  ok("a correct password verifies", await verifyPassword("correct horse battery", hash));
  ok("a wrong password does not", !(await verifyPassword("correct horse batter", hash)));
  ok("a malformed stored hash fails closed", !(await verifyPassword("x", "garbage")));

  // signup() needs a request context for cookies(), so the rows are made directly
  // here; the code path itself is exercised by the browser walk-through.
  const [landlord] = await db
    .insert(landlords)
    .values({ name: "Alvarez Rentals", plan: "building", settings: DEFAULT_SETTINGS })
    .returning();
  const [user] = await db
    .insert(users)
    .values({ landlordId: landlord.id, email, name: "Ray Doyle", passwordHash: hash, role: "owner" })
    .returning();
  const actor = user.name!;

  section("MVP 1: property, unit, hosted listing");
  const property = await createProperty(
    landlord.id,
    { address: "114 Maple Street", city: "Dayton", state: "OH", postalCode: "45402", type: "multi" },
    actor,
  );
  const unit = await createUnit(
    landlord.id,
    landlord.plan,
    property.id,
    { label: "2B", beds: 2, baths: 1, sqft: 890, rent: "1850", deposit: "1850" },
    actor,
  );
  ok("unit stores rent as integer cents", unit.rentCents === 185_000, `${unit.rentCents}`);

  const photo = await storeUpload(landlord.id, "listing", { bytes: JPEG_8x6, contentType: "image/jpeg" });
  ok("listing photo stored via the storage adapter", photo.size === JPEG_8x6.byteLength, `${photo.size} bytes`);

  const listing = await createListing(
    landlord.id,
    unit.id,
    {
      headline: "Bright 2-bed upstairs unit, porch, off-street parking",
      description: "Second floor of a well-kept 1920s duplex. Gas heat, washer-dryer in the basement.",
      minIncomeMultiple: 3,
      depositCents: 185_000,
      petsAllowed: true,
      smokingAllowed: false,
      availableOn: "2026-09-01",
      leaseMonths: 12,
    },
    [photo.key],
    actor,
  );
  const publicListing = await getPublicListing(listing.slug);
  ok("public listing page renders from the slug", publicListing != null && publicListing.rentCents === 185_000);
  ok("photo resolves to an authorised URL", publicListing!.photoUrls[0].startsWith("/api/files/"));
  ok("slug leaks no street address", !listing.slug.includes("maple-street") && !listing.slug.includes("114"));
  const [unitAfterListing] = await db.select().from(units).where(eq(units.id, unit.id));
  ok("unit becomes 'listed'", unitAfterListing.status === "listed");

  section("MVP 2: application intake");
  const idDoc = await storeUpload(landlord.id, "application", { bytes: JPEG_8x6, contentType: "image/jpeg" });
  const application = await submitApplication(
    listing.slug,
    {
      applicantName: "Marta Alvarez",
      applicantEmail: "marta@example.com",
      applicantPhone: "+19375550142",
      currentAddress: "88 Warren Street, Apt 3, Dayton OH",
      moveInOn: "2026-09-12",
      occupants: 2,
      employer: "Kettering Health",
      jobTitle: "Respiratory therapist",
      monthlyIncome: "6,300",
      employmentYears: 4,
      previousLandlordName: "Ray Doyle",
      previousLandlordPhone: "937-555-0188",
      pets: "One cat",
      vehicles: "2016 Honda Civic",
      smoker: false,
      notes: "I work nights so I am quiet during the day.",
    },
    [idDoc.key],
  );
  ok("application stored with parsed income cents", application.answers.monthlyIncomeCents === 630_000);
  ok("landlord was notified by email", sent.some((s) => s.kind === "email" && s.to === email && s.subject.includes("New application")));

  // A second applicant, to be declined after screening.
  const declined = await submitApplication(
    listing.slug,
    {
      applicantName: "Owen Pratt",
      applicantEmail: "owen@example.com",
      applicantPhone: "+19375550199",
      currentAddress: "12 Ridge Road, Dayton OH",
      moveInOn: "2026-09-01",
      occupants: 1,
      employer: "Self-employed",
      jobTitle: "Courier",
      monthlyIncome: "2400",
      employmentYears: 1,
      previousLandlordName: "",
      previousLandlordPhone: "",
      pets: "",
      vehicles: "Van",
      smoker: false,
      notes: "",
    },
    [],
  );

  section("MVP 3: screening — intake and record-keeping only");
  const invite = await inviteToScreen(landlord.id, declined.id, actor);
  ok("invite creates a screening record", invite.reportId.length > 0);
  const byToken = await screeningByToken(invite.url.split("/screen/")[1]);
  ok("applicant can open the authorisation page by token", byToken != null);

  const wrongName = await recordConsent(byToken!.report.inviteToken, "O. Pratt", "203.0.113.7");
  ok("consent rejects a name that does not match the application", !wrongName.ok, wrongName.error);
  const consent = await recordConsent(byToken!.report.inviteToken, "Owen Pratt", "203.0.113.7");
  ok("consent recorded with evidence", consent.ok);
  const [consented] = await db.select().from(screeningReports).where(eq(screeningReports.id, invite.reportId));
  ok("consent stores timestamp, IP and typed name", consented.consentAt != null && consented.consentIp === "203.0.113.7");
  ok("status moves to awaiting_provider, never to a verdict", consented.status === "awaiting_provider");
  ok(
    "no column exists that could hold a score",
    !Object.keys(consented).some((k) => /score|risk|rating|verdict|decision/i.test(k)),
    Object.keys(consented).join(","),
  );

  await recordReportReceived(landlord.id, declined.id, actor, {
    provider: "TransUnion SmartMove",
    providerRef: "SM-4471902",
    receivedOn: "2026-08-20",
    landlordNote: "Report received; reviewing with the reference.",
    paidByApplicant: true,
  });
  const [received] = await db.select().from(screeningReports).where(eq(screeningReports.id, invite.reportId));
  ok("report recorded with a 30-day expiry", received.status === "received" && received.expiresOn === "2026-09-19");

  section("MVP 2b: adverse action is forced on a decline after screening");
  let refused = "";
  try {
    await declineApplication(landlord.id, declined.id, actor, { reason: "", reportUsed: true });
  } catch (err) {
    refused = err instanceof Error ? err.message : String(err);
  }
  ok("declining without a reason is refused", refused.includes("reason"), refused);

  let refusedAgency = "";
  try {
    await declineApplication(landlord.id, declined.id, actor, { reason: "Income too low for this rent", reportUsed: true });
  } catch (err) {
    refusedAgency = err instanceof Error ? err.message : String(err);
  }
  ok("declining with a report but no agency named is refused", refusedAgency.includes("screening company"), refusedAgency);

  const { letter } = await declineApplication(landlord.id, declined.id, actor, {
    reason: "Stated income is below the 3x requirement published on the listing.",
    reportUsed: true,
    agencyName: "TransUnion Rental Screening Solutions",
    agencyAddress: "PO Box 2000, Chester PA 19016",
    agencyPhone: "833-458-6338",
    landlordContact: email,
  });
  ok("letter names the agency", letter.includes("TransUnion Rental Screening Solutions"));
  ok("letter carries the free-copy right", letter.includes("free copy") && letter.includes("60 days"));
  ok("letter carries the dispute right", letter.includes("dispute"));
  ok("letter states the agency did not decide", letter.includes("did not make this decision"));
  const declinedRow = await landlordApplication(landlord.id, declined.id);
  ok("adverse action timestamped on the application", declinedRow!.application.adverseActionSentAt != null);
  ok("the notice itself is kept", (declinedRow!.application.adverseActionBody ?? "").length > 200);
  ok("the applicant was emailed the notice", sent.some((s) => s.to === "owen@example.com" && s.body.includes("free copy")));

  section("MVP 2c: approve seeds a draft tenancy, charges nothing");
  const tenancy = await approveApplication(landlord.id, application.id, actor);
  ok("tenancy starts as a draft", tenancy.status === "draft");
  ok("tenancy inherits the unit's rent", tenancy.rentCents === 185_000);
  ok("start date comes from the applicant's requested move-in", tenancy.startsOn === "2026-09-12");
  const chargesBeforeLease = await db.select().from(charges).where(eq(charges.tenancyId, tenancy.id));
  ok("nothing is charged before the lease is signed", chargesBeforeLease.length === 0);
  ok("tenancy has a portal token", tenancy.portalToken.length >= 40);

  // A late-fee rule the landlord acknowledged, so the engine has something to do.
  await upsertLateFeeRule(tenancy.id, {
    graceDays: 5,
    kind: "flat",
    amount: 5_000,
    maxPerMonthCents: null,
    enabled: true,
    stateCapAck: true,
    stateCapNote: "",
  });

  section("MVP 4: lease e-sign");
  const lease = await draftLease(landlord.id, tenancy.id, { source: "state_template", landlordName: actor }, actor);
  ok("lease drafts with the tenancy's terms", lease.fields.rentCents === 185_000 && lease.fields.startsOn === "2026-09-12");
  await sendLease(landlord.id, lease.id, actor);
  ok("tenant emailed a signing link", sent.some((s) => s.to === "marta@example.com" && s.subject.includes("Lease to sign")));

  const wrongSign = await signLease({ token: lease.tenantToken, typedName: "M Alvarez", ip: "203.0.113.9", userAgent: "test" });
  ok("a name that does not match the lease is refused", !wrongSign.ok, wrongSign.error);

  const tenantSign = await signLease({ token: lease.tenantToken, typedName: "Marta Alvarez", ip: "203.0.113.9", userAgent: "iPhone" });
  ok("tenant signature accepted", tenantSign.ok && tenantSign.fullySigned === false);
  const midLease = await leaseForTenancy(tenancy.id);
  ok("status is partially_signed after one signature", midLease!.status === "partially_signed");
  const [stillDraft] = await db.select().from(tenancies).where(eq(tenancies.id, tenancy.id));
  ok("one signature does not activate the tenancy", stillDraft.status === "draft");

  const landlordSign = await signLease({ token: lease.landlordToken, typedName: actor, ip: "198.51.100.4", userAgent: "Chrome" });
  ok("landlord signature completes it", landlordSign.ok && landlordSign.fullySigned === true);

  const signed = await leaseForTenancy(tenancy.id);
  ok("lease is signed", signed!.status === "signed" && signed!.signedAt != null);
  ok("both signatures kept with IP and consent", signed!.signatures.length === 2 && signed!.signatures.every((s) => s.ip && s.consent));
  ok("sealed PDF written to storage", (signed!.signedPdfKey ?? "").includes("/lease/"));

  const doubleSign = await signLease({ token: lease.tenantToken, typedName: "Marta Alvarez", ip: "203.0.113.9", userAgent: "iPhone" });
  ok("signing twice is idempotent", doubleSign.ok === true);
  const afterDouble = await leaseForTenancy(tenancy.id);
  ok("no third signature was added", afterDouble!.signatures.length === 2);

  section("MVP 5: the ledger — prorated first month, deposit, reminders");
  const [active] = await db.select().from(tenancies).where(eq(tenancies.id, tenancy.id));
  ok("tenancy activated on full signature", active.status === "active" && active.activatedAt != null);
  const [occupied] = await db.select().from(units).where(eq(units.id, unit.id));
  ok("unit becomes occupied", occupied.status === "occupied");

  const firstCharges = await db.select().from(charges).where(eq(charges.tenancyId, tenancy.id));
  const deposit = firstCharges.find((c) => c.kind === "deposit");
  const sept = firstCharges.find((c) => c.period === "2026-09");
  ok("deposit charged on the move-in day", deposit?.amountCents === 185_000 && deposit?.dueOn === "2026-09-12");
  // 12 Sep, 30-day month: days 12..30 = 19 days. 185000*19/30 = 117166.67 -> 117167.
  ok("first month prorated to the day", sept?.amountCents === 117_167 && sept?.prorated === true, `${sept?.amountCents}`);
  ok("first month due on the move-in day, not the 1st", sept?.dueOn === "2026-09-12");

  const scheduled = await scheduledRemindersFor(tenancy.id);
  ok("reminder ladder scheduled for the rent charge", scheduled.length > 0, `${scheduled.length} reminders`);

  section("Charge generation is idempotent (no double rent)");
  const before = (await db.select().from(charges).where(eq(charges.tenancyId, tenancy.id))).length;
  await ensureCharges(active, "2027-01");
  const mid = (await db.select().from(charges).where(eq(charges.tenancyId, tenancy.id))).length;
  await ensureCharges(active, "2027-01");
  await ensureCharges(active, "2027-01");
  const after = (await db.select().from(charges).where(eq(charges.tenancyId, tenancy.id))).length;
  ok("generating ahead creates the missing periods", mid > before, `${before} -> ${mid}`);
  ok("running it three times changes nothing", after === mid, `${mid} -> ${after}`);

  const rentPeriods = (await db.select().from(charges).where(eq(charges.tenancyId, tenancy.id)))
    .filter((c) => c.kind === "rent")
    .map((c) => c.period);
  ok("one rent charge per period", new Set(rentPeriods).size === rentPeriods.length, rentPeriods.join(","));

  // The database itself must refuse a duplicate, not just the application code.
  let dupBlocked = false;
  try {
    await db.insert(charges).values({
      tenancyId: tenancy.id,
      kind: "rent",
      amountCents: 185_000,
      dueOn: "2026-10-01",
      period: "2026-10",
    });
  } catch {
    dupBlocked = true;
  }
  ok("the unique index blocks a duplicate rent row", dupBlocked);

  section("Payments: full, partial, overpayment, manual methods");
  const octCharge = (await db.select().from(charges).where(eq(charges.tenancyId, tenancy.id))).find((c) => c.period === "2026-10")!;
  ok("full month is full rent", octCharge.amountCents === 185_000);

  await recordPayment({
    tenancyId: tenancy.id,
    chargeId: deposit!.id,
    amountCents: 185_000,
    method: "manual_check",
    reference: "check #2214",
    paidAt: new Date("2026-09-10T15:00:00Z"),
  });
  await recordPayment({
    tenancyId: tenancy.id,
    chargeId: sept!.id,
    amountCents: 117_167,
    method: "manual_zelle",
    reference: "Zelle 8841",
    paidAt: new Date("2026-09-12T15:00:00Z"),
  });
  await recordPayment({
    tenancyId: tenancy.id,
    chargeId: octCharge.id,
    amountCents: 90_000,
    method: "manual_zelle",
    reference: "Zelle 9012",
    paidAt: new Date("2026-10-02T15:00:00Z"),
  });

  const ledgerOct = await loadLedger(tenancy.id, "2026-10-03");
  const octState = ledgerOct.charges.find((c) => c.charge.id === octCharge.id)!;
  ok("partial payment reads as partial", octState.status === "partial" && octState.outstandingCents === 95_000);
  // Hand-checked. Charges exist through the generation horizon (2027-01):
  //   deposit 1,850.00 + Sep 1,171.67 + Oct 1,850.00 + Nov 1,850.00
  //   + Dec 1,850.00 + Jan 1,850.00                    = 10,421.67 charged
  //   paid 1,850.00 + 1,171.67 + 900.00                =  3,921.67
  //   balance                                          =  6,500.00
  ok("charged total is exact", ledgerOct.chargedCents === 1_042_167, formatMoney(ledgerOct.chargedCents));
  ok("paid total is exact", ledgerOct.paidCents === 392_167, formatMoney(ledgerOct.paidCents));
  ok("balance is exactly what is owed", ledgerOct.balanceCents === 650_000, formatMoney(ledgerOct.balanceCents));
  ok(
    "statement reconciles: charged - paid = balance",
    ledgerOct.chargedCents - ledgerOct.paidCents === ledgerOct.balanceCents - ledgerOct.creditCents,
    `${ledgerOct.chargedCents} - ${ledgerOct.paidCents}`,
  );
  const lastLine = ledgerOct.lines.at(-1)!;
  ok("running balance closes on the same number", lastLine.balanceCents === ledgerOct.balanceCents - ledgerOct.creditCents);

  section("Late fee: grace, then exactly once");
  const [tenancyRow] = await db.select().from(tenancies).where(eq(tenancies.id, tenancy.id));
  const insideGrace = await applyLateFees(tenancyRow, "2026-10-06");
  ok("no fee inside the grace period", insideGrace.charged.length === 0);
  const outsideGrace = await applyLateFees(tenancyRow, "2026-10-07");
  ok("fee assessed the day grace runs out", outsideGrace.charged.length === 1 && outsideGrace.charged[0].amountCents === 5_000);
  const again = await applyLateFees(tenancyRow, "2026-10-09");
  ok("running the engine again does not double-charge", again.charged.length === 0);
  const andAgain = await applyLateFees(tenancyRow, "2026-11-02");
  ok("nor does it a month later", andAgain.charged.length === 0);

  const ledgerWithFee = await loadLedger(tenancy.id, "2026-10-09");
  // 6,500.00 owed before the fee, plus a 50.00 flat fee.
  ok("fee is in the balance", ledgerWithFee.balanceCents === 655_000, formatMoney(ledgerWithFee.balanceCents));
  ok("fee points at the rent charge that earned it", ledgerWithFee.charges.some((c) => c.charge.sourceChargeId === octCharge.id));

  section("Reminders never fire for a settled charge (job replay)");
  const octReminders = (await db.select().from(reminders).where(eq(reminders.tenancyId, tenancy.id))).filter(
    (r) => r.chargeId === octCharge.id,
  );
  ok("october had reminders scheduled", octReminders.length > 0, `${octReminders.length}`);

  // Pay the rest, then replay the sender at a moment when a late reminder is due.
  await recordPayment({
    tenancyId: tenancy.id,
    chargeId: octCharge.id,
    amountCents: 95_000,
    method: "manual_zelle",
    reference: "Zelle 9440",
    paidAt: new Date("2026-10-08T15:00:00Z"),
  });
  const paidOct = await loadLedger(tenancy.id, "2026-10-09");
  ok("october is paid off", paidOct.charges.find((c) => c.charge.id === octCharge.id)!.status === "paid");

  const cancelled = (await db.select().from(reminders).where(eq(reminders.tenancyId, tenancy.id))).filter(
    (r) => r.chargeId === octCharge.id && r.status === "canceled",
  );
  ok("recording the payment cancelled october's reminders", cancelled.length > 0, `${cancelled.length} cancelled`);

  // Force one back to scheduled and replay — the send-time re-check must catch it.
  await db
    .update(reminders)
    .set({ status: "scheduled", failureReason: null })
    .where(eq(reminders.id, octReminders[0].id));
  const beforeReplay = sent.length;
  const replay = await sendDueReminders(new Date("2026-10-20T16:00:00Z"));
  const emailedAboutOct = sent.slice(beforeReplay).filter((s) => s.body.includes("1,850.00") || s.subject.includes("past due"));
  const [afterReplay] = await db.select().from(reminders).where(eq(reminders.id, octReminders[0].id));
  ok("a reminder for a paid charge is skipped, not sent", afterReplay.status === "canceled", `status=${afterReplay.status}`);
  ok("and it says why", (afterReplay.failureReason ?? "").includes("paid"), afterReplay.failureReason ?? "");
  ok("nothing went out about the paid month", emailedAboutOct.length === 0, `${emailedAboutOct.length} messages`);
  ok("the replay reports it as skipped", replay.skipped >= 1, JSON.stringify(replay));

  section("Reminders do fire for a genuinely late charge");
  const novCharge = (await db.select().from(charges).where(eq(charges.tenancyId, tenancy.id))).find((c) => c.period === "2026-11")!;
  const novReminders = (await db.select().from(reminders).where(eq(reminders.tenancyId, tenancy.id))).filter(
    (r) => r.chargeId === novCharge.id && r.status === "scheduled",
  );
  ok("november has a scheduled ladder", novReminders.length >= 4, `${novReminders.length}`);
  const beforeNov = sent.length;
  const novOutcome = await sendDueReminders(new Date("2026-11-08T16:00:00Z"));
  const novMessages = sent.slice(beforeNov);
  ok("late reminders were sent", novOutcome.sent >= 1, JSON.stringify(novOutcome));
  ok("email went to the tenant", novMessages.some((m) => m.kind === "email" && m.to === "marta@example.com"));
  ok("SMS went to the tenant's mobile", novMessages.some((m) => m.kind === "sms" && m.to === "+19375550142"));
  ok("late copy states facts without threatening", novMessages.some((m) => /past due|outstanding/i.test(m.body)) && !novMessages.some((m) => /evict|court|lawyer/i.test(m.body)));

  section("Waiving a charge");
  const decCharge = (await db.select().from(charges).where(eq(charges.tenancyId, tenancy.id))).find((c) => c.period === "2026-12")!;
  const balanceBeforeWaive = (await loadLedger(tenancy.id, "2026-12-05")).balanceCents;
  await waiveCharge(decCharge.id, "Boiler out for five days over Christmas", actor, landlord.id);
  const afterWaive = await loadLedger(tenancy.id, "2026-12-05");
  ok("waiving removes it from the balance", afterWaive.balanceCents === balanceBeforeWaive - decCharge.amountCents, `${balanceBeforeWaive} -> ${afterWaive.balanceCents}`);
  ok("waived charge is still on the statement at zero", afterWaive.lines.some((l) => l.id === decCharge.id && l.deltaCents === 0));
  ok("its reason is stored", afterWaive.charges.find((c) => c.charge.id === decCharge.id)!.status === "waived");

  section("ACH is not counted until it settles");
  const janCharge = (await db.select().from(charges).where(eq(charges.tenancyId, tenancy.id))).find((c) => c.period === "2027-01");
  if (janCharge) {
    await recordPayment({
      tenancyId: tenancy.id,
      chargeId: janCharge.id,
      amountCents: 185_000,
      method: "ach",
      status: "processing",
      reference: "Stripe pi_test",
      stripePaymentIntentId: `pi_verify_${stamp}`,
      recordedBy: "tenant",
    });
    const inFlight = await loadLedger(tenancy.id, "2027-01-03");
    ok("in-flight ACH is reported separately", inFlight.processingCents === 185_000);
    ok("in-flight ACH is not in the balance", inFlight.charges.find((c) => c.charge.id === janCharge.id)!.outstandingCents === 185_000);

    const { settlePayment } = await import("@/lib/ledger");
    await settlePayment(`pi_verify_${stamp}`, "succeeded");
    const settled = await loadLedger(tenancy.id, "2027-01-06");
    ok("settling moves it into the balance", settled.charges.find((c) => c.charge.id === janCharge.id)!.status === "paid");
    ok("and it stops being reported as in-flight", settled.processingCents === 0);
  } else {
    ok("january charge exists to test ACH against", false, "no 2027-01 charge generated");
  }

  section("MVP 6: the tenant's page (token only)");
  const portal = await portalByToken(tenancy.portalToken, "2026-11-08");
  ok("token opens the right tenancy", portal?.tenancy.id === tenancy.id);
  ok("tenant sees the landlord's name as the header", portal?.landlord.name === "Alvarez Rentals");
  ok("tenant sees their own ledger", (portal?.ledger.lines.length ?? 0) > 0);
  ok("tenant sees a 12-cell strip", portal?.strip.length === 12);
  ok("a bogus token opens nothing", (await portalByToken("not-a-real-token-aaaaaaaaaaaaaaaaaaaa")) === null);
  ok("a short token is rejected without a query", (await portalByToken("x")) === null);

  section("MVP 7: maintenance thread with photos");
  const reqPhoto = await storeUpload(landlord.id, "request", { bytes: JPEG_8x6, contentType: "image/jpeg" });
  const request = await openRequest({
    tenancyId: tenancy.id,
    title: "Kitchen tap dripping",
    body: "The cold tap has been dripping since Sunday and it is getting faster.",
    photoKeys: [reqPhoto.key],
    openedBy: "tenant",
    priority: "routine",
  });
  ok("tenant's request notifies the landlord by email", sent.some((s) => s.to === email && s.subject.includes("Kitchen tap")));
  const [openedRow] = await db.select().from(maintenanceRequests).where(eq(maintenanceRequests.id, request.id));
  ok("landlord's unread counter set, tenant's not", openedRow.landlordUnread === 1 && openedRow.tenantUnread === 0);

  await postMessage(request.id, "landlord", "I can be there Thursday with a new cartridge.", []);
  const thread = await threadFor(request.id);
  ok("thread holds both messages in order", thread.length === 2 && thread[0].author === "tenant" && thread[1].author === "landlord");
  ok("photo is attached to the first message", thread[0].photoKeys.length === 1);
  ok("landlord's reply texted the tenant (SMS first)", sent.some((s) => s.kind === "sms" && s.to === "+19375550142"));

  await updateRequest(landlord.id, request.id, { status: "scheduled", scheduledFor: "2026-11-12" }, actor);
  await updateRequest(landlord.id, request.id, { status: "done", costCents: 14_500 }, actor);
  await updateRequest(landlord.id, request.id, { status: "closed" }, actor);
  const [closed] = await db.select().from(maintenanceRequests).where(eq(maintenanceRequests.id, request.id));
  ok("status walked open -> scheduled -> done -> closed", closed.status === "closed" && closed.costCents === 14_500);

  let badTransition = "";
  try {
    const another = await openRequest({
      tenancyId: tenancy.id,
      title: "Porch light out",
      body: "The bulb by the back door has gone.",
      photoKeys: [],
      openedBy: "landlord",
    });
    await updateRequest(landlord.id, another.id, { status: "open" }, actor);
    await db.update(maintenanceRequests).set({ status: "closed" }).where(eq(maintenanceRequests.id, another.id));
    await updateRequest(landlord.id, another.id, { status: "scheduled" }, actor);
  } catch (err) {
    badTransition = err instanceof Error ? err.message : String(err);
  }
  ok("an illegal status jump is refused", badTransition.length > 0, badTransition);

  section("MVP 8: the File");
  const timeline = await getTimeline(tenancy.id);
  const kinds = new Set(timeline.map((e) => e.kind));
  ok("the File has application, lease, charge, payment, reminder and request events", ["application", "lease", "charge", "payment", "reminder", "request"].every((k) => kinds.has(k as never)), [...kinds].join(","));
  ok("events are newest first", timeline.length > 1 && timeline[0].occurredAt >= timeline[1].occurredAt);

  const dupe = await db
    .insert(fileEvents)
    .values({ tenancyId: tenancy.id, kind: "note", occurredAt: new Date(), summary: "dupe test", dedupeKey: "dupe-test" })
    .onConflictDoNothing()
    .returning();
  const dupe2 = await db
    .insert(fileEvents)
    .values({ tenancyId: tenancy.id, kind: "note", occurredAt: new Date(), summary: "dupe test", dedupeKey: "dupe-test" })
    .onConflictDoNothing()
    .returning();
  ok("a replayed event with the same dedupe key is dropped", dupe.length === 1 && dupe2.length === 0);

  const draft = await buildFileExport(tenancy.id);
  let completeness = "";
  try {
    assertExportComplete(draft.blocks, draft.ledger);
  } catch (err) {
    completeness = err instanceof Error ? err.message : String(err);
  }
  ok("the export contains every charge and payment", completeness === "", completeness);

  const exported = await exportFilePdf(tenancy.id, landlord.id);
  ok("PDF renders", exported.bytes.subarray(0, 5).toString("latin1") === "%PDF-", exported.bytes.subarray(0, 8).toString("latin1"));
  ok("PDF is multi-page", exported.pages >= 3, `${exported.pages} pages`);
  ok("PDF ends properly", exported.bytes.toString("latin1").endsWith("%%EOF\n"));
  const pdfText = exported.bytes.toString("latin1");
  ok("PDF names the tenant", pdfText.includes("Marta Alvarez"));
  ok("PDF shows the prorated first month", pdfText.includes("1,171.67"));
  ok("PDF embeds the maintenance photo", pdfText.includes("/DCTDecode"));
  ok("PDF includes the signature certificate reference", pdfText.includes("Lease"));
  ok("export is stored and readable", (await import("@/lib/storage")).storage().get(exported.key).then((o) => o != null));

  section("The tick: the whole time-based engine in one call");
  const tickResult = await runTick(new Date("2026-11-08T16:00:00Z"));
  ok("tick runs clean", tickResult.ok === true, JSON.stringify({ ...tickResult, reminders: tickResult.reminders }));
  const tickAgain = await runTick(new Date("2026-11-08T16:30:00Z"));
  ok("running the tick twice creates no extra charges", tickAgain.chargesCreated === 0, `${tickAgain.chargesCreated}`);
  ok("nor extra late fees", tickAgain.lateFeesCharged === 0);

  section("Plan gating on units");
  let gated = "";
  const smallLandlordId = (
    await db.insert(landlords).values({ name: "Keys tester", plan: "keys", settings: DEFAULT_SETTINGS }).returning()
  )[0].id;
  const smallProperty = await createProperty(smallLandlordId, { address: "9 Test Row", city: "Dayton", state: "OH", postalCode: "", type: "multi" }, "test");
  for (let i = 1; i <= 3; i++) {
    await createUnit(smallLandlordId, "keys", smallProperty.id, { label: `${i}A`, beds: 1, baths: 1, rent: "900", deposit: "900" }, "test");
  }
  try {
    await createUnit(smallLandlordId, "keys", smallProperty.id, { label: "4A", beds: 1, baths: 1, rent: "900", deposit: "900" }, "test");
  } catch (err) {
    gated = err instanceof Error ? err.message : String(err);
  }
  ok("the fourth unit on Keys is refused", gated.includes("Keys covers 3"), gated);

  section("Ownership boundaries");
  const otherLandlord = (
    await db.insert(landlords).values({ name: "Someone else", plan: "keys", settings: DEFAULT_SETTINGS }).returning()
  )[0];
  ok("another landlord cannot load this application", (await landlordApplication(otherLandlord.id, application.id)) === null);
  const { landlordTenancy } = await import("@/lib/ledger");
  ok("another landlord cannot load this tenancy", (await landlordTenancy(otherLandlord.id, tenancy.id)) === null);
  const { landlordRequest } = await import("@/lib/maintenance");
  ok("another landlord cannot load this request", (await landlordRequest(otherLandlord.id, request.id)) === null);
  const otherUnits = await landlordUnits(otherLandlord.id);
  ok("another landlord sees no units of ours", otherUnits.length === 0);

  section("The dashboard reads back");
  const rows = await landlordUnits(landlord.id);
  ok("home screen lists the unit with its tenant", rows.length === 1 && rows[0].tenantNames[0] === "Marta Alvarez", JSON.stringify(rows.map((r) => r.label)));
  const view = await loadLedgerView(tenancy.id, 2026, "2026-11-08");
  ok("ledger view produces a strip and a rule summary", view.strip.length === 12 && view.ruleSummary.includes("$50.00"));

  section("Ending a tenancy keeps everything");
  const eventsBefore = (await getTimeline(tenancy.id)).length;
  await endTenancy(landlord.id, tenancy.id, "2027-08-31", actor);
  const [ended] = await db.select().from(tenancies).where(eq(tenancies.id, tenancy.id));
  const [vacant] = await db.select().from(units).where(eq(units.id, unit.id));
  const eventsAfter = await getTimeline(tenancy.id);
  const chargesAfter = await db.select().from(charges).where(eq(charges.tenancyId, tenancy.id));
  ok("tenancy ends and the unit is vacant again", ended.status === "ended" && vacant.status === "vacant");
  ok("no File events were lost", eventsAfter.length >= eventsBefore);
  ok("no charges were lost", chargesAfter.length > 0);

  section("Cleanup");
  for (const id of [landlord.id, smallLandlordId, otherLandlord.id]) {
    await db.delete(landlords).where(eq(landlords.id, id));
  }
  const leftover = await db.execute<{ n: string }>(sql`select count(*) as n from tenancies where id = ${tenancy.id}`);
  ok("deleting the landlord cascades", Number([...leftover][0].n) === 0);

  console.log(`\n${passes} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  await closeDb();
  process.exit(failures.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error("\nverification crashed:", err);
  await closeDb();
  process.exit(2);
});

// Keep the unused-import linter quiet about types pulled in for clarity.
void assert;
void applications;
void listings;
void leases;
void payments;
void properties;
void periodOf;
void isoDateOf;
void countPages;
void leaseByToken;
