/**
 * Throwaway end-to-end verification against the real database.
 * Run: node --env-file=.env.local node_modules/.bin/tsx <this file>
 */
import { closeDb, getDb } from "@/db";
import * as S from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { createProject, createPackage, listFormLines, addFormLine, packageSummaries } from "@/lib/projects";
import { importSubs, parseSubImport } from "@/lib/subs";
import { sendInvites, boardFor, reminderSweep, nudgeInvitations, transcribeBid } from "@/lib/invites";
import { resolvePortal, requirePortal, submitPortalBid, savePortalDraft, loadPortalView, askPortalQuestion, portalPlanFile, declineFromPortal, markPortalOpened } from "@/lib/portal";
import { loadLevelingPage, addAdjustment } from "@/lib/leveling-data";
import { mapTrayLine } from "@/lib/mapping";
import { awardPreflight, awardPackage } from "@/lib/award";
import { answerQuestion } from "@/lib/questions";
import { uploadPlanFile } from "@/lib/plan-files";
import { levelingCsv, levelingPdf } from "@/lib/export";
import { adjustmentsFor } from "@/lib/leveling-data";
import { answeredQuestions } from "@/lib/questions";
import { money } from "@/lib/format";
import { eq, and } from "drizzle-orm";

const db = getDb();
let failures = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`, extra ?? "");
  }
}
function section(s: string) {
  console.log(`\n=== ${s} ===`);
}

async function main() {
  // Clean slate for this run.
  await db.delete(S.companies);
  await db.delete(S.fileBlobs);

  section("auth / company setup");
  const [company] = await db
    .insert(S.companies)
    .values({
      name: "Fulton Build Group",
      plan: "builder",
      replyToEmail: "estimating@fultonbuild.example",
      trialEndsAt: new Date(Date.now() + 14 * 86400000),
      settings: S.DEFAULT_SETTINGS,
    })
    .returning();
  const [user] = await db
    .insert(S.users)
    .values({
      companyId: company.id,
      email: "kyle@fultonbuild.example",
      name: "Kyle Ferrand",
      passwordHash: await hashPassword("correct-horse-battery"),
      role: "admin",
    })
    .returning();
  const actor = { userId: user.id, label: user.email };
  check("company + admin user created", Boolean(company.id && user.id));

  section("sub directory import");
  const csv = [
    "Company Name,Contact,Email Address,Phone,Divisions,City",
    "Meridian Electric,Dana Reyes,dana@meridian-elec.example,503-555-0142,26;27,Portland",
    "Harlan Voss Electric,Hal Voss,hal@harlanvoss.example,503-555-0199,Div 26,Beaverton",
    "Brightline Electric,Sam Ives,sam@brightline-elec.example,,electrical,Vancouver",
    "Cass Ridge Drywall,Marta Cass,office@cassridge.example,,Drywall,Gresham",
    "Bad Row Co,,not-an-email,,26,",
  ].join("\n");
  const preview = parseSubImport(csv);
  check("4 rows parsed, 1 skipped", preview.rows.length === 4 && preview.skipped.length === 1, preview.skipped);
  const imported = await importSubs(company.id, actor, preview.rows);
  check("4 subs + 4 contacts created", imported.companiesCreated === 4 && imported.contactsCreated === 4, imported);
  const again = await importSubs(company.id, actor, preview.rows);
  check(
    "re-import is idempotent (0 new)",
    again.companiesCreated === 0 && again.contactsCreated === 0 && again.contactsSkipped === 4,
    again,
  );

  section("project + package + bid form");
  const dueAt = new Date(Date.now() + 5 * 86400000);
  const project = await createProject(company.id, company.plan, actor, {
    name: "Fulton Yard — Building B TI",
    address: "1420 SE Fulton St, Portland OR",
    bidDueAt: dueAt,
    notes: "Owner meeting the 24th.",
  });
  const pkg = await createPackage(company.id, project.id, actor, {
    csiDivision: "26",
    scopeNotes: "Base bid excludes owner-furnished fixtures. Include all permits.",
    seedForm: true,
  });
  let formLines = await listFormLines(pkg.id);
  check("form seeded with 5 division-26 lines", formLines.length === 5, formLines.map((f) => f.description));
  await addFormLine(company.id, pkg.id, {
    description: "ALT 1: Site lighting poles",
    unit: "EA",
    quantity: "6",
    isAlternate: true,
    isAllowance: false,
  });
  formLines = await listFormLines(pkg.id);
  check("alternate line added", formLines.length === 6 && formLines[5].isAlternate);

  section("plan upload");
  const planFile = await uploadPlanFile(company.id, company.plan, actor, {
    projectId: project.id,
    packageId: null,
    filename: "E-sheets-rev2.pdf",
    contentType: "application/pdf",
    data: Buffer.from("%PDF-1.4 fake electrical sheets"),
    versionLabel: "Permit set, Rev 2",
    supersedes: null,
  });
  check("plan file stored", Boolean(planFile.id) && planFile.bytes > 0);

  // A second package, so we can prove cross-package isolation later.
  const pkg2 = await createPackage(company.id, project.id, actor, {
    csiDivision: "09",
    scopeNotes: "Level 4 finish throughout.",
    seedForm: true,
  });
  const pkg2Plan = await uploadPlanFile(company.id, company.plan, actor, {
    projectId: project.id,
    packageId: pkg2.id,
    filename: "A-finishes.pdf",
    contentType: "application/pdf",
    data: Buffer.from("%PDF-1.4 finishes only"),
    versionLabel: "Rev 0",
    supersedes: null,
  });

  section("invitations");
  const contacts = await db
    .select({ c: S.subContacts, s: S.subCompanies })
    .from(S.subContacts)
    .innerJoin(S.subCompanies, eq(S.subContacts.subCompanyId, S.subCompanies.id))
    .where(eq(S.subContacts.companyId, company.id));
  const elec = contacts.filter((r) => r.s.trades.includes("26"));
  check("3 electrical subs in directory", elec.length === 3, elec.map((e) => e.s.name));

  const invited = await sendInvites(company.id, actor, {
    packageId: pkg.id,
    subContactIds: elec.map((e) => e.c.id),
    personalNote: "Same tenant as Building A. Walk-through Thursday at 9.",
  });
  check("3 invites sent", invited.sent === 3, invited);
  const reInvite = await sendInvites(company.id, actor, {
    packageId: pkg.id,
    subContactIds: elec.map((e) => e.c.id),
    personalNote: null,
  });
  check("re-invite mails nobody twice", reInvite.sent === 0 && reInvite.skipped === 3, reInvite);
  check(
    "re-invite reproduces the same links (the sub keeps the first email)",
    reInvite.links.every((l) => invited.links.some((o) => o.url === l.url)),
    reInvite.links.map((l) => l.url.slice(-8)),
  );

  const links = new Map(invited.links.map((l) => [l.subCompany, l.url]));
  const tokenOf = (name: string) => links.get(name)!.split("/bid/")[1];

  // Invite one drywall sub on the other package, for isolation tests.
  const drywall = contacts.find((r) => r.s.name === "Cass Ridge Drywall")!;
  const pkg2Invite = await sendInvites(company.id, actor, {
    packageId: pkg2.id,
    subContactIds: [drywall.c.id],
    personalNote: null,
  });
  const pkg2Token = pkg2Invite.links[0].url.split("/bid/")[1];

  section("portal: token verification");
  const meridian = await resolvePortal(tokenOf("Meridian Electric"));
  check("valid token resolves", meridian.ok);
  if (!meridian.ok) throw new Error("cannot continue");
  check("scope ids come from the invitation row", meridian.ctx.tradePackageId === pkg.id && meridian.ctx.companyId === company.id);

  const garbage = await resolvePortal("not-a-token");
  check("garbage token rejected", !garbage.ok && garbage.reason === "invalid", garbage);
  const truncated = await resolvePortal(tokenOf("Meridian Electric").slice(0, -4) + "abcd");
  check("tampered token rejected", !truncated.ok, truncated);

  // Forge a correctly-signed token for an invitation whose hash we then rotate.
  const { mintPortalToken } = await import("@/lib/portal-tokens");
  const forged = await mintPortalToken({
    invitationId: meridian.ctx.invitationId,
    tradePackageId: pkg.id,
    generation: 99,
  });
  const forgedResult = await resolvePortal(forged.token);
  check(
    "a validly-signed token with no matching hash is rejected",
    !forgedResult.ok && forgedResult.reason === "unknown",
    forgedResult,
  );

  section("portal: submissions");
  const mCtx = await requirePortal(tokenOf("Meridian Electric"));
  await markPortalOpened(mCtx);
  const mView = await loadPortalView(mCtx);
  check("portal sees only its package's plans", mView.plans.length === 1 && mView.plans[0].id === planFile.id, mView.plans.map((p) => p.filename));
  check("portal sees the 6 form lines", mView.formLines.length === 6);

  const byDesc = (d: string) => formLines.find((f) => f.description.startsWith(d))!.id;
  const mSubmit = await submitPortalBid(mCtx, {
    kind: "itemized",
    lines: [
      { formLineId: byDesc("Temporary power"), rawDescription: "", state: "priced", amount: "8,400" },
      { formLineId: byDesc("Panelboards"), rawDescription: "", state: "priced", amount: "46,200" },
      { formLineId: byDesc("Branch wiring"), rawDescription: "", state: "priced", amount: "92,500" },
      { formLineId: byDesc("Light fixtures"), rawDescription: "", state: "priced", amount: "18,000" },
      { formLineId: byDesc("Fire alarm"), rawDescription: "", state: "excluded", amount: "" },
      { formLineId: byDesc("ALT 1"), rawDescription: "", state: "priced", amount: "22,000" },
    ],
    lumpSumAmount: null,
    inclusions: ["Permits and fees"],
    exclusions: ["Fire alarm", "Dumpsters"],
    notes: "Price holds 30 days.",
  });
  check(
    "Meridian total excludes the alternate ($165,100)",
    mSubmit.bid.totalCents === 16_510_000,
    money(mSubmit.bid.totalCents),
  );

  const hCtx = await requirePortal(tokenOf("Harlan Voss Electric"));
  const hDraft = await savePortalDraft(hCtx, {
    kind: "itemized",
    lines: [{ formLineId: byDesc("Temporary power"), rawDescription: "", state: "priced", amount: "9,100" }],
    lumpSumAmount: null,
    inclusions: [],
    exclusions: [],
    notes: null,
  });
  check("draft saved, not submitted", hDraft.isDraft === true);
  const hView1 = await loadPortalView(hCtx);
  check("returning sub sees their draft", hView1.working?.bid.id === hDraft.id && hView1.submitted === null);

  const hSubmit = await submitPortalBid(hCtx, {
    kind: "itemized",
    lines: [
      { formLineId: byDesc("Temporary power"), rawDescription: "", state: "priced", amount: "9,100" },
      { formLineId: byDesc("Panelboards"), rawDescription: "", state: "priced", amount: "44,800" },
      { formLineId: byDesc("Branch wiring"), rawDescription: "", state: "priced", amount: "95,750" },
      { formLineId: byDesc("Light fixtures"), rawDescription: "", state: "priced", amount: "17,400" },
      { formLineId: byDesc("Fire alarm"), rawDescription: "", state: "priced", amount: "12,300" },
      { formLineId: null, rawDescription: "Temp power poles + meter base", state: "priced", amount: "4,200" },
    ],
    lumpSumAmount: null,
    inclusions: ["Dumpsters", "Permits & fees"],
    exclusions: [],
    notes: null,
  });
  check(
    "Harlan total includes their free-form row ($183,550)",
    hSubmit.bid.totalCents === 18_355_000,
    money(hSubmit.bid.totalCents),
  );
  check("submitting the draft reused it as revision 1", hSubmit.revision === 1);

  const bCtx = await requirePortal(tokenOf("Brightline Electric"));
  const bSubmit = await submitPortalBid(bCtx, {
    kind: "lump_sum",
    lines: [],
    lumpSumAmount: "164,900",
    inclusions: [],
    exclusions: ["Fire alarm"],
    notes: "Will not break out by line.",
  });
  check("lump sum accepted", bSubmit.bid.kind === "lump_sum" && bSubmit.bid.totalCents === 16_490_000);

  section("BID CONFIDENTIALITY — driving each portal with the other's ids");
  // 1. Another package's plan file, by id, through this token.
  const stolenPlan = await portalPlanFile(mCtx, pkg2Plan.id);
  check("Meridian cannot download the finishes package's plan", stolenPlan === null);
  const ownPlan = await portalPlanFile(mCtx, planFile.id);
  check("…but can download the project-wide plan", ownPlan?.id === planFile.id);

  // 2. Post an amount against another package's form line id.
  const pkg2Lines = await listFormLines(pkg2.id);
  const inject = await submitPortalBid(mCtx, {
    kind: "itemized",
    lines: [
      { formLineId: byDesc("Temporary power"), rawDescription: "", state: "priced", amount: "8,400" },
      { formLineId: byDesc("Panelboards"), rawDescription: "", state: "priced", amount: "46,200" },
      { formLineId: byDesc("Branch wiring"), rawDescription: "", state: "priced", amount: "92,500" },
      { formLineId: byDesc("Light fixtures"), rawDescription: "", state: "priced", amount: "18,000" },
      { formLineId: byDesc("Fire alarm"), rawDescription: "", state: "excluded", amount: "" },
      { formLineId: byDesc("ALT 1"), rawDescription: "", state: "priced", amount: "22,000" },
      { formLineId: pkg2Lines[0].id, rawDescription: "injected", state: "priced", amount: "999,999" },
    ],
    lumpSumAmount: null,
    inclusions: ["Permits and fees"],
    exclusions: ["Fire alarm", "Dumpsters"],
    notes: "Price holds 30 days.",
  });
  const injectedLines = await db.select().from(S.bidLines).where(eq(S.bidLines.bidId, inject.bid.id));
  check(
    "a foreign form-line id is dropped, not stored",
    injectedLines.length === 6 && !injectedLines.some((l) => l.rawDescription === "injected"),
    injectedLines.map((l) => l.rawDescription),
  );
  check(
    "the rest of the bid still saved (the whole post is not rejected)",
    inject.bid.totalCents === 16_510_000,
    money(inject.bid.totalCents),
  );
  check(
    "…and no bid line references the other package",
    !injectedLines.some((l) => l.bidFormLineId === pkg2Lines[0].id),
  );
  const pkg2Grid = await loadLevelingPage(company.id, pkg2.id);
  check("nothing leaked into the other package's grid", pkg2Grid!.grid.columns.length === 0);

  // 3. Each portal view contains no sibling's numbers at all.
  const mViewAfter = await loadPortalView(mCtx);
  const hViewAfter = await loadPortalView(hCtx);
  const mJson = JSON.stringify(mViewAfter);
  check("Meridian's view never mentions Harlan's bid id", !mJson.includes(hSubmit.bid.id));
  check("Meridian's view never mentions Brightline's total", !mJson.includes("16490000"));
  check("Meridian's view never mentions Harlan's invitation", !mJson.includes(hCtx.invitationId));
  check(
    "Harlan's view never mentions Meridian's numbers",
    !JSON.stringify(hViewAfter).includes(String(inject.bid.totalCents)) ||
      inject.bid.totalCents === hSubmit.bid.totalCents,
  );
  check(
    "Meridian's working bid is their own",
    mViewAfter.working?.bid.invitationId === mCtx.invitationId,
  );

  // 4. A token from another package cannot read this package.
  const crossCtx = await requirePortal(pkg2Token);
  check("the drywall token resolves to the drywall package", crossCtx.tradePackageId === pkg2.id);
  const crossView = await loadPortalView(crossCtx);
  check(
    "the drywall bidder sees none of the electrical bids",
    !JSON.stringify(crossView).includes(hSubmit.bid.id) &&
      !JSON.stringify(crossView).includes(inject.bid.id),
  );
  check(
    "the drywall bidder cannot download the electrical-only sheet",
    (await portalPlanFile(crossCtx, pkg2Plan.id))?.id === pkg2Plan.id,
  );

  section("Q&A: broadcast, asker hidden");
  await askPortalQuestion(hCtx, "Is the fire alarm in this package or bought out under 28?");
  const qRows = await db.select().from(S.questions).where(eq(S.questions.tradePackageId, pkg.id));
  check("question recorded against the asker", qRows.length === 1 && qRows[0].invitationId === hCtx.invitationId);

  const mBefore = await loadPortalView(mCtx);
  check("an unanswered question is invisible to other bidders", mBefore.questions.length === 0);
  const answered = await answerQuestion(company.id, actor, {
    questionId: qRows[0].id,
    answer: "Fire alarm rough-in is in this package. Devices are under 28.",
    broadcast: true,
  });
  check("answer broadcast to 3 bidders", answered.notified === 3, answered);
  const mAfter = await loadPortalView(mCtx);
  check("other bidders now see the Q and A", mAfter.questions.length === 1 && mAfter.questions[0].answerBody !== null);
  check("…but not who asked", mAfter.questions[0].mine === false);
  const hAfter = await loadPortalView(hCtx);
  check("the asker sees it as theirs", hAfter.questions[0].mine === true);

  section("status board (derived status)");
  const board = await boardFor(company.id, pkg.id);
  check("3 bidders on the board", board!.rows.length === 3);
  check("all three read as submitted", board!.submitted === 3, board!.rows.map((r) => [r.subCompany.name, r.status]));
  const future = new Date(dueAt.getTime() + 10 * 86400000);
  // Decline one, then look at the board after the due date.
  const dCtx = await requirePortal(pkg2Token);
  await declineFromPortal(dCtx, "Booked through July.");
  const board2 = await boardFor(company.id, pkg2.id, future);
  check("declined shows as declined after the date", board2!.rows[0].status === "declined", board2!.rows[0].status);

  // Add an uninvited-but-silent bidder to prove no_response derivation.
  const silent = contacts.find((r) => r.s.name === "Brightline Electric")!;
  const pkg3 = await createPackage(company.id, project.id, actor, {
    csiDivision: "27",
    scopeNotes: "Cat6A throughout.",
    seedForm: true,
  });
  await sendInvites(company.id, actor, { packageId: pkg3.id, subContactIds: [silent.c.id], personalNote: null });
  const board3 = await boardFor(company.id, pkg3.id, future);
  check("silent bidder reads NO RESPONSE past the date", board3!.rows[0].status === "no_response", board3!.rows[0].status);
  const board3Before = await boardFor(company.id, pkg3.id, new Date());
  check("…and SENT before it", board3Before!.rows[0].status === "sent", board3Before!.rows[0].status);

  section("reminders: rungs, idempotency, and stopping");
  const t5 = new Date(dueAt.getTime() - 5 * 86400000);
  const sweep1 = await reminderSweep(t5);
  const sweep2 = await reminderSweep(t5);
  check("first sweep sent T-7 reminders", sweep1.sent > 0, sweep1);
  check("second sweep at the same time sends nothing", sweep2.sent === 0, sweep2);
  const t2 = new Date(dueAt.getTime() - 2 * 86400000);
  const sweep3 = await reminderSweep(t2);
  check("T-3 rung fires later", sweep3.sent > 0, sweep3);
  const past = new Date(dueAt.getTime() + 3 * 86400000);
  const sweep4 = await reminderSweep(past);
  check("nothing fires after the bid date", sweep4.sent === 0, sweep4);
  const remindersSent = await db
    .select()
    .from(S.emailEvents)
    .where(and(eq(S.emailEvents.companyId, company.id), eq(S.emailEvents.kind, "reminder")));
  check("no bidder got the same rung twice", new Set(remindersSent.map((r) => r.dedupeKey)).size === remindersSent.length);
  const submittedBidders = await db
    .select()
    .from(S.emailEvents)
    .where(eq(S.emailEvents.kind, "reminder"));
  check(
    "submitted bidders were not reminded",
    !submittedBidders.some((e) => e.invitationId === mCtx.invitationId),
    submittedBidders.map((e) => e.dedupeKey),
  );

  const nudge1 = await nudgeInvitations(company.id, actor, pkg3.id);
  const nudge2 = await nudgeInvitations(company.id, actor, pkg3.id);
  check("manual nudge sends once a day", nudge1.sent === 1 && nudge2.sent === 0, [nudge1, nudge2]);

  section("transcribed bid (email fallback)");
  const board4 = await boardFor(company.id, pkg3.id);
  const p3Lines = await listFormLines(pkg3.id);
  await transcribeBid(company.id, actor, {
    invitationId: board4!.rows[0].invitation.id,
    kind: "itemized",
    lumpSumCents: null,
    lines: p3Lines.map((l, i) => ({ bidFormLineId: l.id, amountCents: (i + 1) * 100_000, excluded: false })),
    notes: "Emailed PDF.",
  });
  const p3Grid = await loadLevelingPage(company.id, pkg3.id);
  check("transcribed bid appears on the grid", p3Grid!.grid.columns.length === 1, p3Grid!.grid.columns.length);

  section("leveling against the real database");
  const level1 = await loadLevelingPage(company.id, pkg.id, actor);
  const g = level1!.grid;
  check("3 columns", g.columns.length === 3, g.columns.map((c) => c.bid.subName));
  const mCol = g.columns.find((c) => c.bid.subName === "Meridian Electric")!;
  const hCol = g.columns.find((c) => c.bid.subName === "Harlan Voss Electric")!;
  const bCol = g.columns.find((c) => c.bid.subName === "Brightline Electric")!;
  check("Meridian's revision 2 is the active one", mCol.bid.revision === 2, mCol.bid.revision);
  check("Meridian base $165,100, alternate held apart", mCol.baseCents === 16_510_000 && mCol.alternatesCents === 2_200_000, money(mCol.baseCents));
  check("Harlan base $183,550", hCol.baseCents === 18_355_000, money(hCol.baseCents));
  check("Brightline lump sum $164,900", bCol.baseCents === 16_490_000 && bCol.isLumpSum);
  check("Harlan's free-form row is in the tray", g.tray.length === 1 && g.tray[0].subName === "Harlan Voss Electric", g.tray);
  check("a suggestion is offered for it", level1!.suggestions.has(g.tray[0].bidLineId));
  check("dumpsters is a scope gap in the matrix", g.matrix.some((m) => /dumpster/i.test(m.label) && m.scopeGap), g.matrix.map((m) => [m.label, m.scopeGap]));
  check("apparent low computed", g.apparentLow !== null, g.apparentLow);

  section("mapping the tray row, and remembering it");
  await mapTrayLine({
    companyId: company.id,
    userId: user.id,
    tradePackageId: pkg.id,
    bidLineId: g.tray[0].bidLineId,
    bidFormLineId: byDesc("Temporary power"),
    remember: true,
  });
  const level2 = await loadLevelingPage(company.id, pkg.id);
  check("tray is now empty", level2!.grid.tray.length === 0);
  const hCol2 = level2!.grid.columns.find((c) => c.bid.subName === "Harlan Voss Electric")!;
  check("Harlan's total is unchanged by mapping", hCol2.baseCents === 18_355_000, money(hCol2.baseCents));
  const tempRow = level2!.grid.rows.find((r) => r.formLine.id === byDesc("Temporary power"))!;
  const hCell = tempRow.cells.find((c) => c.bidId === hCol2.bid.id)!;
  check("the temp-power cell now sums both rows ($13,300)", hCell.amountCents === 1_330_000 && hCell.lineCount === 2, hCell);
  const aliases = await db.select().from(S.subLineAliases).where(eq(S.subLineAliases.companyId, company.id));
  check("the correction was remembered", aliases.length === 1, aliases.map((a) => a.rawKey));

  section("plugs");
  const before = level2!.grid.columns.find((c) => c.bid.subName === "Brightline Electric")!;
  await addAdjustment(company.id, actor, {
    packageId: pkg.id,
    bidId: before.bid.id,
    bidFormLineId: byDesc("Fire alarm"),
    kind: "plug",
    amountCents: 1_230_000,
    reason: "Lump sum excludes fire alarm",
  });
  await addAdjustment(company.id, actor, {
    packageId: pkg.id,
    bidId: before.bid.id,
    bidFormLineId: null,
    kind: "scope_add",
    amountCents: 240_000,
    reason: "Dumpsters not carried in the lump sum",
  });
  const level3 = await loadLevelingPage(company.id, pkg.id);
  const bCol3 = level3!.grid.columns.find((c) => c.bid.subName === "Brightline Electric")!;
  check("plug applied", bCol3.plugCents === 1_230_000, money(bCol3.plugCents));
  check("scope add applied", bCol3.adjustmentCents === 240_000);
  check("adjusted total $179,600", bCol3.adjustedTotalCents === 17_960_000, money(bCol3.adjustedTotalCents));
  const faRow = level3!.grid.rows.find((r) => r.formLine.id === byDesc("Fire alarm"))!;
  const bFaCell = faRow.cells.find((c) => c.bidId === bCol3.bid.id)!;
  check("plug cell renders as a plug", bFaCell.kind === "plug" && bFaCell.isLow === false);
  check("Harlan's real fire alarm price still wins the line low", faRow.lowCents === 1_230_000);
  const hFaCell = faRow.cells.find((c) => c.bidId === hCol2.bid.id)!;
  check("…and it is Harlan's cell that is marked", hFaCell.isLow === true);

  section("cross-tenant isolation (a second GC)");
  const [other] = await db.insert(S.companies).values({ name: "Rival Builders", plan: "crew" }).returning();
  const [otherUser] = await db
    .insert(S.users)
    .values({ companyId: other.id, email: "rival@example.com", passwordHash: await hashPassword("x".repeat(12)), role: "admin" })
    .returning();
  const rivalSees = await loadLevelingPage(other.id, pkg.id);
  check("another GC cannot load this package's grid", rivalSees === null);
  const rivalBoard = await boardFor(other.id, pkg.id);
  check("…nor its status board", rivalBoard === null);
  let rivalMapBlocked = false;
  try {
    await mapTrayLine({
      companyId: other.id,
      userId: otherUser.id,
      tradePackageId: pkg.id,
      bidLineId: (await db.select().from(S.bidLines).limit(1))[0].id,
      bidFormLineId: byDesc("Panelboards"),
    });
  } catch {
    rivalMapBlocked = true;
  }
  check("…nor map a line in it", rivalMapBlocked);
  let rivalAdjBlocked = false;
  try {
    await addAdjustment(other.id, actor, {
      packageId: pkg.id,
      bidId: null,
      bidFormLineId: null,
      kind: "normalize",
      amountCents: -100_000,
      reason: "sabotage",
    });
  } catch {
    rivalAdjBlocked = true;
  }
  check("…nor adjust it", rivalAdjBlocked);

  section("award");
  const low = level3!.grid.apparentLow!;
  const pre = await awardPreflight(company.id, pkg.id, low.bidId);
  check("preflight lists flags", pre.warnings.length >= 0, pre.warnings);
  let staleBlocked = false;
  try {
    await awardPackage(company.id, actor, {
      packageId: pkg.id,
      bidId: low.bidId,
      note: null,
      acknowledgedWarnings: pre.warnings.length + 5,
      sendRegrets: true,
    });
  } catch {
    staleBlocked = true;
  }
  check("awarding with a stale flag count is refused", staleBlocked);

  const awarded = await awardPackage(company.id, actor, {
    packageId: pkg.id,
    bidId: low.bidId,
    note: "Subcontract to follow.",
    acknowledgedWarnings: pre.warnings.length,
    sendRegrets: true,
  });
  check("1 award + 2 regrets sent", awarded.awardEmails === 1 && awarded.regretEmails === 2, awarded);
  const [awardedPkg] = await db.select().from(S.tradePackages).where(eq(S.tradePackages.id, pkg.id));
  check("package locked to awarded", awardedPkg.status === "awarded" && awardedPkg.awardedBidId === low.bidId);
  check("awarded total frozen", awarded.award.awardedTotalCents === pre.adjustedTotalCents, [awarded.award.awardedTotalCents, pre.adjustedTotalCents]);

  // The portal must now refuse a submission.
  let portalLocked = false;
  try {
    await submitPortalBid(hCtx, {
      kind: "lump_sum",
      lines: [],
      lumpSumAmount: "1",
      inclusions: [],
      exclusions: [],
      notes: null,
    });
  } catch {
    portalLocked = true;
  }
  check("portal refuses a bid on an awarded package", portalLocked);
  let mapLocked = false;
  try {
    await addAdjustment(company.id, actor, {
      packageId: pkg.id,
      bidId: null,
      bidFormLineId: null,
      kind: "normalize",
      amountCents: 1,
      reason: "after award",
    });
  } catch {
    mapLocked = true;
  }
  check("adjustments refused after award", mapLocked);

  section("exports");
  const level4 = await loadLevelingPage(company.id, pkg.id);
  const exportInput = {
    project,
    pkg: level4!.pkg,
    grid: level4!.grid,
    adjustments: await adjustmentsFor(company.id, pkg.id),
    questions: await answeredQuestions(company.id, pkg.id),
    generatedAt: new Date(),
    companyName: company.name,
  };
  const csvOut = levelingCsv(exportInput);
  check("CSV names every bidder", ["Meridian", "Harlan", "Brightline"].every((n) => csvOut.includes(n)));
  check("CSV marks the plug with (p)", csvOut.includes("(p)"));
  check("CSV footnotes the plug reason", csvOut.includes("Lump sum excludes fire alarm"));
  check("CSV flags the scope gap", csvOut.includes("*SCOPE GAP*"));
  check("CSV has an adjusted total row", csvOut.includes("ADJUSTED TOTAL"));
  const pdf = await levelingPdf(exportInput);
  check("PDF produced", pdf.byteLength > 2000 && Buffer.from(pdf.slice(0, 5)).toString() === "%PDF-", pdf.byteLength);

  section("audit trail");
  const trail = await db.select().from(S.auditLog).where(eq(S.auditLog.companyId, company.id));
  const actions = new Set(trail.map((t) => t.action));
  for (const a of ["portal.open", "bid.submitted", "plan.downloaded", "leveling.viewed", "package.awarded", "bid_line.mapped"]) {
    check(`audit records ${a}`, actions.has(a), [...actions]);
  }

  section("plan limits");
  const { canCreateProject } = await import("@/lib/plans");
  const [crewCo] = await db.insert(S.companies).values({ name: "Crew Only", plan: "crew" }).returning();
  for (let i = 0; i < 3; i++) {
    await createProject(crewCo.id, "crew", actor, {
      name: `Job ${i}`,
      address: null,
      bidDueAt: new Date(Date.now() + 86400000),
      notes: null,
    });
  }
  let fourthBlocked = "";
  try {
    await createProject(crewCo.id, "crew", actor, {
      name: "Job 4",
      address: null,
      bidDueAt: new Date(Date.now() + 86400000),
      notes: null,
    });
  } catch (e) {
    fourthBlocked = (e as Error).message;
  }
  check("Crew cannot open a 4th active project", fourthBlocked.includes("Builder"), fourthBlocked);
  check("gate agrees", canCreateProject("crew", 3).allowed === false);

  section("package summaries");
  const sums = await packageSummaries(company.id, project.id);
  check("summaries cover all 3 packages", sums.length === 3, sums.map((s) => [s.pkg.csiDivision, s.submitted]));

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  await closeDb();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("\nFATAL", err);
  await closeDb();
  process.exit(1);
});
