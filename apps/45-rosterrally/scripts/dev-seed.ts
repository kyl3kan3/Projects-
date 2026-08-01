/**
 * Development seed + end-to-end exercise against the real database.
 * Throwaway: deleted before the tree is handed over.
 */

import { loadEnvLocal } from "../src/lib/load-env";
loadEnvLocal();

import { and, asc, eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "../src/db";
import {
  clubs,
  divisions,
  gameReminders as gameRemindersTable,
  games as gamesTable,
  households,
  paymentSchedules,
  players,
  registrations,
  seasons,
  teams,
  users,
  venues,
} from "../src/db/schema";
import { hashPassword } from "../src/lib/password";
import { DEFAULT_SEASON_SETTINGS, registerChildren, getPublicSeason, divisionAvailability, getSeasonDashboard, listRegistrations, promoteFromWaitlist, refundRegistration, settlePayment, getHouseholdMoney, exportRegistrationsCsv } from "../src/lib/registration";
import { assignPlayer, assignTeamStaff, getPool, getRoster, lockRoster, listTeams } from "../src/lib/rosters";
import { createGame, createVenue, getGateState, publishSchedule, checkSeason, getSchedule, previewCsvImport, commitCsvImport, updateGame } from "../src/lib/schedule";
import { sendAnnouncement, getReceipts, recordOpen, recordClick, resendToUnreached } from "../src/lib/comms";
import { createStandardSlots, listSlots, claimSlot } from "../src/lib/volunteers";
import { mintHouseholdToken, resolveHouseholdLink, mintTeamFeedToken, resolveTeamFeedToken } from "../src/lib/links";
import { getFamilyPage } from "../src/lib/family";
import { buildTeamFeed } from "../src/lib/ical";
import { verifyTestCheckout } from "../src/lib/payments";
import { addDays, todayIso } from "../src/lib/time";
import { formatMoney } from "../src/lib/money";
import { sendDueGameReminders, chargeDueInstallments, chaseUnpaid, promoteWaitlists } from "../src/lib/sweeps";

const SYSTEM = { kind: "system" as const, name: "seed" };

function log(...args: unknown[]) {
  console.log(...args);
}

async function reset() {
  const db = getDb();
  await db.execute(sql`truncate clubs cascade`);
  await db.execute(sql`truncate webhook_events, job_runs cascade`);
}

async function main() {
  const db = getDb();
  const wipe = process.argv.includes("--reset");
  if (wipe) await reset();

  const today = todayIso();

  // --- club + staff ---------------------------------------------------------
  const [club] = await db
    .insert(clubs)
    .values({
      name: "Millbrook Youth Soccer",
      sport: "soccer",
      timezone: "America/New_York",
      plan: "per_registration",
      settings: { smsMonthlyBudget: 2000, replyToEmail: "registrar@millbrooksoccer.org" },
    })
    .returning();

  const hash = await hashPassword("fall2026season");
  const [registrar] = await db
    .insert(users)
    .values({ clubId: club.id, email: "dana@millbrooksoccer.org", name: "Dana Whitfield", role: "admin", passwordHash: hash })
    .returning();
  const [coach] = await db
    .insert(users)
    .values({ clubId: club.id, email: "marcus@millbrooksoccer.org", name: "Marcus Reyes", role: "coach", passwordHash: hash })
    .returning();
  const [coach2] = await db
    .insert(users)
    .values({ clubId: club.id, email: "priya@millbrooksoccer.org", name: "Priya Raman", role: "coach", passwordHash: hash })
    .returning();
  log(`club ${club.name} · registrar ${registrar.email} · pw fall2026season`);

  // --- season + divisions --------------------------------------------------
  const [season] = await db
    .insert(seasons)
    .values({
      clubId: club.id,
      name: "Fall 2026",
      slug: "millbrook-fall-2026",
      status: "open",
      registrationOpensOn: addDays(today, -10),
      registrationClosesOn: addDays(today, 30),
      startsOn: addDays(today, 14),
      endsOn: addDays(today, 90),
      settings: {
        ...DEFAULT_SEASON_SETTINGS,
        siblingDiscountBps: 1500,
        scholarshipCodes: [
          { code: "TOWNFUND", label: "Town scholarship fund", percentBps: 10000, flatCents: 0, maxUses: 0, uses: 0 },
        ],
        depositCents: 5000,
        installmentCount: 3,
      },
    })
    .returning();

  const [u10b] = await db
    .insert(divisions)
    .values({ seasonId: season.id, name: "U10 Boys", capacity: 3, feeCents: 18500, sortOrder: 1, earlyBird: { endsOn: addDays(today, 5), percentBps: 0, flatCents: 2000 }, birthYearFrom: 2016, birthYearTo: 2017 })
    .returning();
  const [u12g] = await db
    .insert(divisions)
    .values({ seasonId: season.id, name: "U12 Girls", capacity: 12, feeCents: 21000, sortOrder: 2 })
    .returning();
  const [u8] = await db
    .insert(divisions)
    .values({ seasonId: season.id, name: "U8 Mixed", capacity: 16, feeCents: 14000, sortOrder: 0 })
    .returning();

  // --- registrations, through the real public flow -------------------------
  const view = await getPublicSeason(season.slug);
  if (!view?.open) throw new Error("season should be open");

  const alvarez = await registerChildren(season.slug, {
    contactName: "Elena Alvarez",
    email: "elena.alvarez@example.com",
    phone: "+15550142",
    smsConsent: true,
    scholarshipCode: "",
    waiverAccepted: true,
    payPlan: "full",
    children: [
      { firstName: "Mateo", lastName: "Alvarez", birthdate: "2016-04-11", divisionId: u10b.id, medicalNotes: "Inhaler in kit bag", emergencyName: "Rosa Alvarez", emergencyPhone: "+15550188", emergencyRelationship: "Grandmother", answers: {} },
      { firstName: "Lucia", lastName: "Alvarez", birthdate: "2014-09-02", divisionId: u12g.id, medicalNotes: "", emergencyName: "Rosa Alvarez", emergencyPhone: "+15550188", emergencyRelationship: "Grandmother", answers: {} },
    ],
  });
  log(`Alvarez: ${alvarez.registrationIds.length} regs, total ${formatMoney(alvarez.quote.totalCents)}, checkout ${alvarez.checkoutUrl ? "yes" : "none"}`);

  const okonkwo = await registerChildren(season.slug, {
    contactName: "Ada Okonkwo",
    email: "ada.okonkwo@example.com",
    phone: "+15550163",
    smsConsent: false,
    scholarshipCode: "",
    waiverAccepted: true,
    payPlan: "installments",
    children: [
      { firstName: "Chidi", lastName: "Okonkwo", birthdate: "2016-11-20", divisionId: u10b.id, medicalNotes: "", emergencyName: "", emergencyPhone: "", emergencyRelationship: "", answers: {} },
    ],
  });
  log(`Okonkwo: installments plan, checkout ${okonkwo.checkoutUrl ? "yes" : "none"}`);

  const brennan = await registerChildren(season.slug, {
    contactName: "Sean Brennan",
    email: "sean.brennan@example.com",
    phone: "",
    smsConsent: false,
    scholarshipCode: "TOWNFUND",
    waiverAccepted: true,
    payPlan: "full",
    children: [
      { firstName: "Fiona", lastName: "Brennan", birthdate: "2016-02-08", divisionId: u10b.id, medicalNotes: "Peanut allergy — epipen with coach", emergencyName: "Maeve Brennan", emergencyPhone: "+15550171", emergencyRelationship: "Aunt", answers: {} },
    ],
  });
  log(`Brennan (scholarship): total ${formatMoney(brennan.quote.totalCents)}, checkout ${brennan.checkoutUrl ? "yes" : "NONE (fully funded)"}`);

  // 4th U10 registration: capacity is 3, so this one must waitlist.
  const nguyen = await registerChildren(season.slug, {
    contactName: "Thu Nguyen",
    email: "thu.nguyen@example.com",
    phone: "+15550199",
    smsConsent: true,
    scholarshipCode: "",
    waiverAccepted: true,
    payPlan: "full",
    children: [
      { firstName: "Kai", lastName: "Nguyen", birthdate: "2017-01-30", divisionId: u10b.id, medicalNotes: "", emergencyName: "", emergencyPhone: "", emergencyRelationship: "", answers: {} },
    ],
  });
  log(`Nguyen: waitlisted=${JSON.stringify(nguyen.waitlisted)}, charged now ${formatMoney(nguyen.quote.totalCents)}`);

  const others = [
    ["Maria Santos", "maria.santos@example.com", "Sofia", "Santos", "2014-06-14", u12g.id],
    ["Jon Halvorsen", "jon.halvorsen@example.com", "Ingrid", "Halvorsen", "2014-03-22", u12g.id],
    ["Grace Adeyemi", "grace.adeyemi@example.com", "Tolu", "Adeyemi", "2018-08-09", u8.id],
  ] as const;
  for (const [contact, email, first, last, dob, divisionId] of others) {
    await registerChildren(season.slug, {
      contactName: contact, email, phone: "+15550100", smsConsent: true, scholarshipCode: "",
      waiverAccepted: true, payPlan: "full",
      children: [{ firstName: first, lastName: last, birthdate: dob, divisionId, medicalNotes: "", emergencyName: "", emergencyPhone: "", emergencyRelationship: "", answers: {} }],
    });
  }

  // --- settle the test-gateway checkouts ----------------------------------
  for (const [label, result] of [["alvarez", alvarez], ["okonkwo", okonkwo], ["nguyen", nguyen]] as const) {
    if (!result.checkoutUrl) { log(`${label}: nothing to pay`); continue; }
    const token = result.checkoutUrl.split("/checkout/")[1];
    const claims = await verifyTestCheckout(token);
    if (!claims) throw new Error(`${label}: bad checkout token`);
    const settled = await settlePayment({
      clubId: claims.clubId, householdId: claims.householdId, amountCents: claims.amountCents,
      platformFeeCents: claims.platformFeeCents, method: "card",
      providerReference: `test_${token.slice(-24)}`, note: "seed",
    });
    log(`${label}: settled ${formatMoney(claims.amountCents)} applied ${formatMoney(settled.appliedCents)} credit ${formatMoney(settled.creditCents)}`);
    // Replay: must be a no-op.
    const replay = await settlePayment({
      clubId: claims.clubId, householdId: claims.householdId, amountCents: claims.amountCents,
      platformFeeCents: claims.platformFeeCents, method: "card",
      providerReference: `test_${token.slice(-24)}`, note: "seed replay",
    });
    log(`${label}: replay duplicate=${replay.duplicate}`);
  }
  // The Santos/Halvorsen/Adeyemi families stay unpaid on purpose.

  // --- overpayment: does the family still look delinquent? -----------------
  const [santos] = await db.select().from(households).where(eq(households.email, "maria.santos@example.com"));
  await settlePayment({
    clubId: club.id, householdId: santos.id, amountCents: 25000, platformFeeCents: 0,
    method: "check", providerReference: `seed_over_${santos.id}`, note: "Cheque 1042 — overpaid",
  });
  const santosMoney = await getHouseholdMoney(santos.id);
  log(`Santos overpaid: balance ${formatMoney(santosMoney.balanceCents)} credit ${formatMoney(santosMoney.creditCents)} netDue ${formatMoney(santosMoney.netDueCents)}`);

  // --- teams + rosters ----------------------------------------------------
  const [thunder] = await db.insert(teams).values({ clubId: club.id, divisionId: u10b.id, name: "Thunder", capacity: 3 }).returning();
  const [rapids] = await db.insert(teams).values({ clubId: club.id, divisionId: u10b.id, name: "Rapids", capacity: 8 }).returning();
  const [comets] = await db.insert(teams).values({ clubId: club.id, divisionId: u12g.id, name: "Comets", capacity: 12 }).returning();
  await assignTeamStaff(thunder.id, coach.id, "coach");
  await assignTeamStaff(comets.id, coach.id, "coach"); // deliberate coach overlap
  await assignTeamStaff(rapids.id, coach2.id, "coach");

  const pool = await getPool(u10b.id);
  log(`U10 pool: ${pool.map((p) => `${p.firstName}(${p.state})`).join(", ")}`);
  for (const p of pool) {
    const violations = await assignPlayer(thunder.id, p.playerId, SYSTEM);
    log(`  assign ${p.firstName} -> Thunder: ${violations.length ? violations.map((v) => v.kind).join(",") : "ok"}`);
  }
  // Second attempt on another team must be refused.
  const dup = await assignPlayer(rapids.id, pool[0].playerId, SYSTEM);
  log(`  re-assign ${pool[0].firstName} -> Rapids: ${dup.map((v) => v.kind).join(",") || "ALLOWED (BUG)"}`);

  const u12pool = await getPool(u12g.id);
  for (const p of u12pool) await assignPlayer(comets.id, p.playerId, SYSTEM);

  const coachView = await getRoster(thunder.id, "coach");
  const registrarView = await getRoster(thunder.id, "admin");
  log(`coach sees medical: ${JSON.stringify(coachView?.entries.map((e) => e.medicalNotes))}`);
  log(`coach sees contacts: ${JSON.stringify(coachView?.entries.map((e) => e.contactEmail))}`);
  log(`registrar sees medical: ${JSON.stringify(registrarView?.entries.map((e) => e.medicalNotes))}`);

  await lockRoster(comets.id, true, SYSTEM);
  const locked = await assignPlayer(comets.id, u12pool[0].playerId, SYSTEM);
  log(`locked roster rejects edit: ${locked.map((v) => v.kind).join(",") || "ALLOWED (BUG)"}`);
  await lockRoster(comets.id, false, SYSTEM);

  // --- venues + schedule + conflicts --------------------------------------
  const miller = await createVenue(club.id, "Miller Park", ["Field 1", "Field 2"], "41 Miller Rd, Millbrook");
  const riverside = await createVenue(club.id, "Riverside Complex", ["Field A"], "8 River Way");

  const sat = addDays(season.startsOn, ((6 - new Date(`${season.startsOn}T00:00:00Z`).getUTCDay()) + 7) % 7);
  const g1 = await createGame(club.id, { seasonId: season.id, divisionId: u10b.id, homeTeamId: thunder.id, awayTeamId: rapids.id, venueId: miller.id, field: "Field 2", kind: "game", localDate: sat, localTime: "09:00", durationMinutes: 90 }, SYSTEM);
  // back-to-back on the same field: must NOT conflict
  const g2 = await createGame(club.id, { seasonId: season.id, divisionId: u12g.id, homeTeamId: comets.id, awayTeamId: null, venueId: miller.id, field: "Field 2", kind: "practice", localDate: sat, localTime: "10:30", durationMinutes: 90 }, SYSTEM);
  let gate = await getGateState(season.id);
  log(`after back-to-back: hard=${gate.hard.length} soft=${gate.needsOverride.length} (expect 0/0 field, coach overlap may fire)`);

  // one minute of overlap on the same field: MUST conflict
  const g3 = await createGame(club.id, { seasonId: season.id, divisionId: u8.id, homeTeamId: rapids.id, awayTeamId: null, venueId: miller.id, field: "Field 2", kind: "practice", localDate: sat, localTime: "10:29", durationMinutes: 30 }, SYSTEM);
  gate = await getGateState(season.id);
  log(`after 1-min overlap: hard=${gate.hard.length} — ${gate.hard.map((h) => h.explanation).join(" | ")}`);
  log(`soft=${gate.needsOverride.length} — ${gate.needsOverride.map((h) => h.explanation).join(" | ")}`);

  const blocked = await publishSchedule(season.id, SYSTEM, club.id);
  log(`publish while hard conflict: published=${blocked.published} blocked=${blocked.blocked ? "yes" : "NO (BUG)"}`);

  // Move the clashing game: the pennant should clear.
  await updateGame(g3.id, { localTime: "12:30" }, SYSTEM);
  gate = await getGateState(season.id);
  log(`after moving it: hard=${gate.hard.length} soft=${gate.needsOverride.length}`);

  // Accept the soft ones, then publish.
  for (const soft of gate.needsOverride) {
    const { overrideConflict } = await import("../src/lib/schedule");
    await overrideConflict(soft.id, { kind: "user", id: registrar.id, name: registrar.name }, club.id);
  }
  gate = await getGateState(season.id);
  const published = await publishSchedule(season.id, SYSTEM, club.id);
  log(`publish after accepting soft: published=${published.published} teams=${published.teamIds.length}`);

  // CSV import
  const csv = `division,home,away,venue,field,date,time,minutes\nU10 Boys,Thunder,Rapids,Riverside Complex,Field A,${addDays(sat, 7)},09:00,90\nU10 Boys,Nope,Rapids,Riverside Complex,Field A,${addDays(sat, 7)},09:00,90\nU12 Girls,Comets,,Miller Park,Field 9,${addDays(sat, 7)},11:00,60`;
  const preview = await previewCsvImport(club.id, season.id, csv);
  log(`csv preview: ok=${preview.ok.length} errors=${preview.errors.map((e) => `${e.line}:${e.message}`).join(" | ")}`);
  const created = await commitCsvImport(club.id, season.id, preview.ok, SYSTEM);
  log(`csv committed: ${created}`);

  // --- volunteers ---------------------------------------------------------
  await createStandardSlots(club.id, season.id, g1.id, g1.startsAt);
  const slots = await listSlots(season.id);
  log(`slots: ${slots.length}, first "${slots[0]?.label}" capacity ${slots[0]?.slot.capacity}`);

  const [alvarezHh] = await db.select().from(households).where(eq(households.email, "elena.alvarez@example.com"));
  const [nguyenHh] = await db.select().from(households).where(eq(households.email, "thu.nguyen@example.com"));
  // --- comms + receipts ---------------------------------------------------
  const summary = await sendAnnouncement({
    clubId: club.id, seasonId: season.id, audience: { kind: "club" },
    subject: "Miller Park is closed for aeration this weekend",
    body: "Every U10 game moves to Riverside Complex at the same times.\n\nFields are numbered from the car park end. Bring both jerseys.",
    channels: ["email", "sms"], actor: { kind: "user", id: registrar.id, name: registrar.name },
    smsBudget: 2000,
  });
  log(`announcement: ${JSON.stringify(summary)}`);

  const grid = await getReceipts(summary.announcementId);
  log(`receipts: ${grid?.rows.length} households, counts ${JSON.stringify(grid?.counts)}`);
  const smsSkipped = grid?.rows.flatMap((r) => r.channels).filter((c) => c.channel === "sms" && c.status === "skipped");
  log(`sms skipped for no consent: ${smsSkipped?.length}`);

  // Simulate two opens and one SMS link view.
  const db2 = getDb();
  const deliveryRows = await db2.execute(sql`select id, channel, household_id from deliveries where announcement_id = ${summary.announcementId} order by channel, id`);
  const rows = deliveryRows as unknown as { id: string; channel: string; household_id: string }[];
  const emails = rows.filter((r) => r.channel === "email");
  const smses = rows.filter((r) => r.channel === "sms");
  await recordOpen(emails[0].id);
  await recordOpen(emails[1].id);
  if (smses[0]) await recordClick(smses[0].id);
  const grid2 = await getReceipts(summary.announcementId);
  log(`after opens: ${JSON.stringify(grid2?.counts)}`);

  const resent = await resendToUnreached(summary.announcementId, { kind: "user", id: registrar.id, name: registrar.name }, 2000);
  log(`resend to unreached: ${JSON.stringify(resent)} (expect emails == unreached count ${grid2?.counts.unreached})`);

  // --- family page isolation ---------------------------------------------
  const token = await mintHouseholdToken(alvarezHh.id);
  const resolved = await resolveHouseholdLink(token);
  log(`link resolves: ${resolved.ok ? resolved.household.contactName : "no"}`);
  const family = await getFamilyPage(alvarezHh.id);
  log(`family page: ${family?.children.length} children, ${family?.games.length} games, ${family?.messages.length} messages, netDue ${formatMoney(family?.money.netDueCents ?? 0)}`);
  log(`family teammates: ${JSON.stringify(family?.teams.map((t) => t.roster.map((r) => r.displayName)))}`);

  // Attack 1: another household's token must not resolve to this family.
  const nguyenToken = await mintHouseholdToken(nguyenHh.id);
  const crossed = await resolveHouseholdLink(nguyenToken);
  log(`nguyen token -> ${crossed.ok ? crossed.household.contactName : "invalid"} (must be Thu Nguyen)`);

  // Attack 2: tamper with a token.
  const tampered = token.slice(0, -3) + "aaa";
  log(`tampered token: ${JSON.stringify(await resolveHouseholdLink(tampered))}`);

  // Attack 3: revoke, then reuse.
  const { revokeHouseholdToken } = await import("../src/lib/links");
  await revokeHouseholdToken(nguyenHh.id);
  log(`revoked token reuse: ${JSON.stringify(await resolveHouseholdLink(nguyenToken))}`);
  await mintHouseholdToken(nguyenHh.id);

  // Attack 4: does the Alvarez page text contain any other family's contact details?
  const serialized = JSON.stringify(family);
  const leaks: string[] = [];
  for (const email of ["thu.nguyen@example.com", "ada.okonkwo@example.com", "sean.brennan@example.com", "maria.santos@example.com"]) {
    if (serialized.includes(email)) leaks.push(email);
  }
  for (const phone of ["+15550199", "+15550163", "+15550171"]) {
    if (serialized.includes(phone)) leaks.push(phone);
  }
  for (const note of ["Peanut allergy"]) {
    if (serialized.includes(note)) leaks.push(note);
  }
  log(`family page leaks: ${leaks.length === 0 ? "none" : leaks.join(", ")}`);

  // --- ical --------------------------------------------------------------
  const feedToken = await mintTeamFeedToken(thunder.id);
  log(`feed token resolves to team: ${(await resolveTeamFeedToken(feedToken)) === thunder.id}`);
  const feed = await buildTeamFeed(thunder.id);
  log(`ical: ${feed?.ics.split("BEGIN:VEVENT").length ? feed.ics.split("BEGIN:VEVENT").length - 1 : 0} events, has UID+SEQUENCE: ${/UID:game-.*@rosterrally/.test(feed?.ics ?? "")}/${/SEQUENCE:\d+/.test(feed?.ics ?? "")}`);
  const leakCheck = ["Mateo", "elena.alvarez", "Inhaler"].filter((s) => feed?.ics.includes(s));
  log(`ical leaks child/parent data: ${leakCheck.length === 0 ? "none" : leakCheck.join(",")}`);

  // --- waitlist promotion + refund ---------------------------------------
  const before = await divisionAvailability(season.id);
  log(`U10 before refund: active ${before.find((d) => d.id === u10b.id)?.activeCount} waitlist ${before.find((d) => d.id === u10b.id)?.waitlistCount}`);

  const u10regs = await db.select().from(registrations).where(and(eq(registrations.divisionId, u10b.id), eq(registrations.status, "active")));
  const victim = u10regs[0];
  const refund = await refundRegistration(victim.id, victim.amountCents, { kind: "user", id: registrar.id, name: registrar.name }, { cancel: true, reason: "Moved out of town" });
  log(`refund+cancel: ${JSON.stringify(refund)}`);
  const after = await divisionAvailability(season.id);
  log(`U10 after refund: active ${after.find((d) => d.id === u10b.id)?.activeCount} waitlist ${after.find((d) => d.id === u10b.id)?.waitlistCount}`);
  const promotedRows = await listRegistrations(season.id, { divisionId: u10b.id });
  log(`U10 states: ${promotedRows.map((r) => `${r.playerFirstName}:${r.state}`).join(", ")}`);

  // The promoted family should now owe the fee agreed at registration.
  const nguyenMoney = await getHouseholdMoney(nguyenHh.id);
  log(`Nguyen after promotion: netDue ${formatMoney(nguyenMoney.netDueCents)} credit ${formatMoney(nguyenMoney.creditCents)}`);

  // --- soft conflicts at the database level -------------------------------
  // Marcus coaches Thunder AND Comets, and the Alvarez family has a child on
  // each, so one overlapping pair must produce both soft kinds.
  const clashDay = addDays(sat, 14);
  await createGame(club.id, { seasonId: season.id, divisionId: u10b.id, homeTeamId: thunder.id, awayTeamId: null, venueId: miller.id, field: "Field 1", kind: "practice", localDate: clashDay, localTime: "09:00", durationMinutes: 60 }, SYSTEM);
  await createGame(club.id, { seasonId: season.id, divisionId: u12g.id, homeTeamId: comets.id, awayTeamId: null, venueId: riverside.id, field: "Field A", kind: "practice", localDate: clashDay, localTime: "09:30", durationMinutes: 60 }, SYSTEM);
  let softGate = await getGateState(season.id);
  log(`soft conflicts found: ${softGate.needsOverride.map((c) => `${c.kind}`).join(", ")}`);
  log(`  explanations: ${softGate.needsOverride.map((c) => c.explanation).join(" | ")}`);
  const blockedBySoft = await publishSchedule(season.id, SYSTEM, club.id);
  log(`publish with unaccepted soft: published=${blockedBySoft.published} blocked=${blockedBySoft.blocked ? "yes" : "NO (BUG)"}`);
  const { overrideConflict: override2 } = await import("../src/lib/schedule");
  for (const c of softGate.needsOverride) {
    await override2(c.id, { kind: "user", id: registrar.id, name: registrar.name }, club.id);
  }
  softGate = await getGateState(season.id);
  const afterOverride = await publishSchedule(season.id, SYSTEM, club.id);
  log(`publish after accepting: published=${afterOverride.published} (soft still listed: ${softGate.overridden.length} accepted)`);
  // A hard conflict must never be overridable.
  const hardGame = await createGame(club.id, { seasonId: season.id, divisionId: u10b.id, homeTeamId: rapids.id, awayTeamId: null, venueId: miller.id, field: "Field 1", kind: "practice", localDate: clashDay, localTime: "09:15", durationMinutes: 30 }, SYSTEM);
  const hardGate = await getGateState(season.id);
  try {
    await override2(hardGate.hard[0].id, { kind: "user", id: registrar.id, name: registrar.name }, club.id);
    log("override a hard conflict: ALLOWED (BUG)");
  } catch (err) {
    log(`override a hard conflict refused: ${(err as Error).message.slice(0, 60)}`);
  }
  const { deleteGame } = await import("../src/lib/schedule");
  await deleteGame(hardGame.id, SYSTEM);
  log(`after deleting the clash: hard=${(await getGateState(season.id)).hard.length}`);

  // --- volunteer claims (after the fix) -----------------------------------
  const slots2 = await listSlots(season.id);
  const snack2 = slots2.find((s) => s.slot.role === "Snack bar")!;
  const lines2 = slots2.find((s) => s.slot.role === "Field lines")!;
  log(`claim snack (cap ${snack2.slot.capacity}) Alvarez: ${JSON.stringify(await claimSlot(snack2.slot.id, alvarezHh.id))}`);
  log(`claim snack again Alvarez: ${(await claimSlot(snack2.slot.id, alvarezHh.id)).ok ? "ALLOWED (BUG)" : "refused"}`);
  log(`claim snack Nguyen: ${(await claimSlot(snack2.slot.id, nguyenHh.id)).ok ? "ok" : "refused"}`);
  const [okonkwoHh] = await db.select().from(households).where(eq(households.email, "ada.okonkwo@example.com"));
  log(`claim snack 3rd family (cap 2, should refuse): ${JSON.stringify(await claimSlot(snack2.slot.id, okonkwoHh.id))}`);
  log(`claim lines (cap 1) Alvarez: ${(await claimSlot(lines2.slot.id, alvarezHh.id)).ok ? "ok" : "refused"}`);
  log(`claim lines Nguyen (full): ${JSON.stringify(await claimSlot(lines2.slot.id, nguyenHh.id))}`);
  // Simultaneous claims on the last seat.
  const race = await Promise.all([
    claimSlot(slots2.find((s) => s.slot.role === "Scorekeeper")!.slot.id, alvarezHh.id),
    claimSlot(slots2.find((s) => s.slot.role === "Scorekeeper")!.slot.id, nguyenHh.id),
  ]);
  log(`race for a 1-seat slot: ${race.filter((r) => r.ok).length} winner(s), ${race.filter((r) => !r.ok).length} refused`);

  // --- sweeps ------------------------------------------------------------
  log(`sweep promoteWaitlists: ${await promoteWaitlists()}`);

  // Backdate an installment so the charge path actually runs.
  const [plan] = await db.select().from(paymentSchedules).limit(1);
  if (plan) {
    await db
      .update(paymentSchedules)
      .set({
        installments: plan.installments.map((i, idx) =>
          idx === 0 ? { ...i, dueOn: addDays(today, -1) } : i,
        ),
      })
      .where(eq(paymentSchedules.id, plan.id));
  }
  log(`sweep installments: ${JSON.stringify(await chargeDueInstallments())}`);
  log(`sweep installments again (must be 0 attempted): ${JSON.stringify(await chargeDueInstallments())}`);

  // Backdate an unpaid registration so the chase ladder has something to do.
  const [unpaidReg] = await db
    .select()
    .from(registrations)
    .where(and(eq(registrations.seasonId, season.id), eq(registrations.status, "active")))
    .orderBy(asc(registrations.createdAt))
    .limit(1);
  await db.execute(sql`update registrations set created_at = now() - interval '25 days' where household_id = (select id from households where email = 'grace.adeyemi@example.com')`);
  void unpaidReg;
  log(`sweep chaseUnpaid: ${await chaseUnpaid()}`);
  log(`sweep chaseUnpaid again (must be 0): ${await chaseUnpaid()}`);

  // Make a published reminder due, so the reminder path actually sends.
  await db.execute(sql`update game_reminders set send_after = now() - interval '1 hour' where sent_at is null and canceled_at is null`);
  log(`sweep gameReminders: ${await sendDueGameReminders()}`);
  log(`sweep gameReminders again (must be 0): ${await sendDueGameReminders()}`);

  // A published game that moves must void its old, unsent notices.
  const freshGameDate = addDays(today, 40);
  const fresh = await createGame(club.id, { seasonId: season.id, divisionId: u10b.id, homeTeamId: thunder.id, awayTeamId: rapids.id, venueId: riverside.id, field: "Field A", kind: "game", localDate: freshGameDate, localTime: "10:00", durationMinutes: 90 }, SYSTEM);
  const pubFresh = await publishSchedule(season.id, SYSTEM, club.id);
  const beforeMove = await db.select().from(gameRemindersTable).where(eq(gameRemindersTable.gameId, fresh.id));
  await updateGame(fresh.id, { localTime: "14:00" }, SYSTEM);
  const afterMove = await db.select().from(gameRemindersTable).where(eq(gameRemindersTable.gameId, fresh.id));
  log(`published ${pubFresh.published}; moved it: reminders before=${beforeMove.length} after=${afterMove.length} canceled=${afterMove.filter((r) => r.canceledAt).length} live=${afterMove.filter((r) => !r.canceledAt && !r.sentAt).length}`);
  void gamesTable;

  // Attack: a division id from another season/club must be refused.
  const [otherClub] = await db.insert(clubs).values({ name: "Riverside Rangers", sport: "soccer", timezone: "America/Chicago", plan: "per_registration", settings: { smsMonthlyBudget: 100, replyToEmail: "" } }).returning();
  const [otherSeason] = await db.insert(seasons).values({ clubId: otherClub.id, name: "Fall 2026", slug: "rangers-fall-2026", status: "open", registrationOpensOn: addDays(today, -5), registrationClosesOn: addDays(today, 30), startsOn: addDays(today, 20), endsOn: addDays(today, 90), settings: DEFAULT_SEASON_SETTINGS }).returning();
  const [otherDivision] = await db.insert(divisions).values({ seasonId: otherSeason.id, name: "U10 Boys", capacity: 20, feeCents: 12000, sortOrder: 0 }).returning();
  try {
    await registerChildren(season.slug, {
      contactName: "Attacker", email: "attacker@example.com", phone: "", smsConsent: false,
      scholarshipCode: "", waiverAccepted: true, payPlan: "full",
      children: [{ firstName: "Cross", lastName: "Club", birthdate: "2016-01-01", divisionId: otherDivision.id, medicalNotes: "", emergencyName: "", emergencyPhone: "", emergencyRelationship: "", answers: {} }],
    });
    log("cross-club division accepted: BUG");
  } catch (err) {
    log(`cross-club division refused: ${(err as Error).message}`);
  }
  // Attack: registering without acknowledging the waiver.
  try {
    await registerChildren(season.slug, {
      contactName: "No Waiver", email: "nowaiver@example.com", phone: "", smsConsent: false,
      scholarshipCode: "", waiverAccepted: false as unknown as true, payPlan: "full",
      children: [{ firstName: "Un", lastName: "Signed", birthdate: "2018-01-01", divisionId: u8.id, medicalNotes: "", emergencyName: "", emergencyPhone: "", emergencyRelationship: "", answers: {} }],
    });
    log("registration without the waiver accepted: BUG");
  } catch (err) {
    log(`registration without the waiver refused: ${(err as Error).message.slice(0, 80)}`);
  }

  // --- dashboard + csv ----------------------------------------------------
  const dashboard = await getSeasonDashboard(season.id);
  log(`dashboard: registered ${dashboard?.registeredCount}/${dashboard?.capacityTotal} waitlist ${dashboard?.waitlistTotal} collected ${formatMoney(dashboard?.money.collectedCents ?? 0)} outstanding ${formatMoney(dashboard?.money.outstandingCents ?? 0)} ourFee ${formatMoney(dashboard?.money.platformFeeCents ?? 0)}`);
  const csvOut = await exportRegistrationsCsv(season.id);
  log(`csv rows: ${csvOut.split("\n").length - 1}, mentions medical: ${/[Ii]nhaler|allergy/.test(csvOut)}`);

  const scheduleView = await getSchedule(season.id);
  log(`schedule days: ${scheduleView.days.length}, conflicts open: ${scheduleView.conflicts.length}`);
  log(`teams: ${(await listTeams(season.id)).map((t) => `${t.team.name}:${t.rosteredCount}`).join(", ")}`);
  log(`coach-scoped teams for Marcus: ${(await listTeams(season.id, { userId: coach.id, scoped: true })).map((t) => t.team.name).join(", ")}`);

  log(`\nSIGN IN: dana@millbrooksoccer.org / fall2026season`);
  log(`REGISTER PAGE: /register/${season.slug}`);
  log(`FAMILY PAGE: /p/${token}`);
  log(`checkSeason findings: ${(await checkSeason(season.id)).length}`);
  void g2;
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
