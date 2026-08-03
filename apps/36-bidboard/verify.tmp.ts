/**
 * Throwaway end-to-end verification against the real database, walking the README's
 * MVP feature list item by item.
 *   node --env-file=.env.local node_modules/.bin/tsx verify.tmp.ts
 */
import { and, eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import * as S from "@/db/schema";
import { canWrite, canAdminister, hashPassword, verifyPassword, ROLE_LABEL } from "@/lib/auth";
import {
  addFormLine,
  countActiveProjects,
  createPackage,
  createProject,
  deleteFormLine,
  listFormLines,
  listPackages,
  packageSummaries,
  updateProject,
  rollUpProjectStatus,
} from "@/lib/projects";
import { importSubs, listDirectory, parseSubImport, tradeCoverage, createSubCompany } from "@/lib/subs";
import {
  boardFor,
  freshLinkFor,
  nudgeInvitations,
  reminderSweep,
  revokeInvitation,
  sendInvites,
  transcribeBid,
} from "@/lib/invites";
import {
  askPortalQuestion,
  attachToPortalBid,
  declineFromPortal,
  loadPortalView,
  markPortalOpened,
  portalAttachment,
  portalPlanFile,
  requirePortal,
  resolvePortal,
  savePortalDraft,
  submitPortalBid,
  willBidFromPortal,
} from "@/lib/portal";
import { mintPortalToken, verifyPortalToken } from "@/lib/portal-tokens";
import { addAdjustment, adjustmentsFor, loadLevelingPage, removeAdjustment } from "@/lib/leveling-data";
import { mapTrayLine, unmapTrayLine } from "@/lib/mapping";
import { awardPackage, awardPreflight, unawardPackage } from "@/lib/award";
import { answerQuestion, questionsFor, unansweredCount } from "@/lib/questions";
import { currentPlanFiles, listPlanFiles, readPlanFile, storageUsage, uploadPlanFile } from "@/lib/plan-files";
import { exportFilename, levelingCsv, levelingPdf } from "@/lib/export";
import { answeredQuestions } from "@/lib/questions";
import { canCreateProject, canAddSeat, hasLevelingExports, PLANS } from "@/lib/plans";
import { applySubscriptionSync, readSubscriptionEvent, trialState } from "@/lib/billing";
import { tick } from "@/lib/tick";
import { money } from "@/lib/format";

const db = getDb();
let failures = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`, extra ?? "");
  }
}
function item(n: string, s: string) {
  console.log(`\n=== MVP ${n}: ${s} ===`);
}

async function main() {
  await db.delete(S.companies);
  await db.delete(S.fileBlobs);

  /* ------------------------------------------------------------------------ */
  item("1", "auth + company setup, seats with estimator/viewer roles");

  const [company] = await db
    .insert(S.companies)
    .values({
      name: "Fulton Build Group",
      plan: "builder",
      replyToEmail: "estimating@fultonbuild.example",
      trialEndsAt: new Date(Date.now() + 11 * 86_400_000),
      settings: S.DEFAULT_SETTINGS,
    })
    .returning();
  const hash = await hashPassword("fulton-yard-2026");
  const [admin] = await db
    .insert(S.users)
    .values({
      companyId: company.id,
      email: "kyle@fultonbuild.example",
      name: "Kyle Ferrand",
      passwordHash: hash,
      role: "admin",
    })
    .returning();
  const actor = { userId: admin.id, label: admin.email };

  check("scrypt hash verifies", await verifyPassword("fulton-yard-2026", hash));
  check("a wrong password does not", !(await verifyPassword("wrong", hash)));
  check("password hashes are salted (two hashes differ)", (await hashPassword("x")) !== (await hashPassword("x")));

  const [estimator] = await db
    .insert(S.users)
    .values({
      companyId: company.id,
      email: "marisol@fultonbuild.example",
      passwordHash: await hashPassword("second-seat-pass"),
      role: "estimator",
    })
    .returning();
  const [viewer] = await db
    .insert(S.users)
    .values({
      companyId: company.id,
      email: "owner-rep@example.com",
      passwordHash: await hashPassword("viewer-seat-pass"),
      role: "viewer",
    })
    .returning();
  check("three seats, three roles", [admin.role, estimator.role, viewer.role].join(",") === "admin,estimator,viewer");
  check("an estimator may write, a viewer may not", canWrite(estimator.role) && !canWrite(viewer.role));
  check("only an admin administers", canAdminister(admin.role) && !canAdminister(estimator.role));
  check("roles have labels for the UI", ROLE_LABEL[viewer.role] === "Viewer");
  check("seat limit gate agrees with the plan", canAddSeat("builder", 3).allowed && !canAddSeat("builder", 5).allowed);
  check("trial state is reported", trialState(company).onTrial && trialState(company).daysLeft === 11, trialState(company));

  /* ------------------------------------------------------------------------ */
  item("2", "sub directory: companies, contacts, CSI trades, notes, CSV import");

  const csv = [
    "Company Name,Contact,Email Address,Phone,Divisions,City,Notes",
    "Meridian Electric,Dana Reyes,dana@meridian-elec.example,503-555-0142,26;27,Portland,Sharp on TI work",
    'Harlan Voss Electric,"Hal Voss, PE",hal@harlanvoss.example,(503) 555-0199,Div 26,Beaverton,',
    "Brightline Electric,Sam Ives,sam@brightline-elec.example,,electrical,Vancouver,Never itemises",
    "Pike Street Electric,Ruth Okafor,ruth@pikestreet-elec.example,503-555-0163,26,Portland,",
    "Cass Ridge Drywall,Marta Cass,office@cassridge.example,503-555-0121,Drywall,Gresham,",
    "Bad Row Co,,not-an-email,,26,,",
  ].join("\n");
  const preview = parseSubImport(csv);
  check("5 rows parsed, 1 unusable row reported not swallowed", preview.rows.length === 5 && preview.skipped.length === 1, preview.skipped);
  check("CSI codes parsed from three different spellings", JSON.stringify([preview.rows[0].trades, preview.rows[1].trades, preview.rows[2].trades]) === '[["26","27"],["26"],["26"]]', preview.rows.map((r) => r.trades));
  check("a quoted comma inside a name survives", preview.rows[1].contactName === "Hal Voss, PE");
  check("notes imported", preview.rows[0].notes === "Sharp on TI work");

  const imported = await importSubs(company.id, actor, preview.rows);
  check("5 subs + 5 contacts created", imported.companiesCreated === 5 && imported.contactsCreated === 5, imported);
  const again = await importSubs(company.id, actor, preview.rows);
  check("re-importing the same sheet adds nothing", again.companiesCreated === 0 && again.contactsCreated === 0, again);

  await createSubCompany(company.id, {
    name: "Northfield Roofing",
    trades: ["07"],
    city: "Tigard",
    notes: null,
    contactName: "Pat Northfield",
    contactEmail: "pat@northfieldroofing.example",
    contactPhone: null,
  });
  const directory = await listDirectory(company.id);
  check("manual add lands beside the imports", directory.length === 6, directory.length);
  const elecOnly = await listDirectory(company.id, "26");
  check("directory filters by CSI division", elecOnly.length === 4, elecOnly.map((e) => e.sub.name));
  const coverage = await tradeCoverage(company.id);
  check("trade coverage counts subs per division", coverage.get("26") === 4 && coverage.get("09") === 1, [...coverage]);
  check("every contact has a primary flag", (await db.select().from(S.subContacts).where(eq(S.subContacts.isPrimary, true))).length === 6);

  /* ------------------------------------------------------------------------ */
  item("3", "project setup: name, location, due date, packages, structured bid form");

  const dueAt = new Date(Date.now() + 6 * 86_400_000);
  const project = await createProject(company.id, company.plan, actor, {
    name: "Fulton Yard — Building B TI",
    address: "1420 SE Fulton St, Portland OR",
    bidDueAt: dueAt,
    notes: "Owner meeting the 24th.",
  });
  check("project created with address and due date", project.address!.includes("Fulton") && project.bidDueAt.getTime() === dueAt.getTime());
  check("it counts as active", (await countActiveProjects(company.id)) === 1);

  const pkg = await createPackage(company.id, project.id, actor, {
    csiDivision: "26",
    scopeNotes: "Base bid excludes owner-furnished fixtures. Include all permits.",
    seedForm: true,
  });
  const pkgMech = await createPackage(company.id, project.id, actor, {
    csiDivision: "23",
    scopeNotes: "Two RTUs, curbs by us.",
    seedForm: true,
  });
  const pkgFinish = await createPackage(company.id, project.id, actor, {
    csiDivision: "09",
    scopeNotes: "Level 4 finish throughout.",
    seedForm: true,
  });
  check("three packages on the project", (await listPackages(company.id, project.id)).length === 3);
  let duplicateBlocked = false;
  try {
    await createPackage(company.id, project.id, actor, { csiDivision: "26", scopeNotes: null, seedForm: false });
  } catch {
    duplicateBlocked = true;
  }
  check("one package per division per project", duplicateBlocked);

  let formLines = await listFormLines(pkg.id);
  check("the bid form is seeded from the division", formLines.length === 5, formLines.map((f) => f.description));
  await addFormLine(company.id, pkg.id, {
    description: "ALT 1: Site lighting poles",
    unit: "EA",
    quantity: "6",
    isAlternate: true,
    isAllowance: false,
  });
  await addFormLine(company.id, pkg.id, {
    description: "Scrap line to delete",
    unit: null,
    quantity: null,
    isAlternate: false,
    isAllowance: false,
  });
  formLines = await listFormLines(pkg.id);
  check("lines can be added, with unit and quantity", formLines.length === 7 && formLines[5].unit === "EA");
  await deleteFormLine(company.id, pkg.id, formLines[6].id);
  formLines = await listFormLines(pkg.id);
  check("an unpriced line can be deleted", formLines.length === 6);
  const at = (d: string) => formLines.find((f) => f.description.startsWith(d))!.id;

  /* ------------------------------------------------------------------------ */
  item("4", "plans/specs hosting: upload, version marking, one link per package");

  const planV1 = await uploadPlanFile(company.id, company.plan, actor, {
    projectId: project.id,
    packageId: null,
    filename: "Fulton-B-E-sheets.pdf",
    contentType: "application/pdf",
    data: Buffer.from("%PDF-1.4 rev1 " + "x".repeat(2000)),
    versionLabel: "Permit set, Rev 1",
    supersedes: null,
  });
  const planV2 = await uploadPlanFile(company.id, company.plan, actor, {
    projectId: project.id,
    packageId: null,
    filename: "Fulton-B-E-sheets.pdf",
    contentType: "application/pdf",
    data: Buffer.from("%PDF-1.4 rev2 " + "y".repeat(3000)),
    versionLabel: "Permit set, Rev 2",
    supersedes: planV1.id,
  });
  const elecOnlyPlan = await uploadPlanFile(company.id, company.plan, actor, {
    projectId: project.id,
    packageId: pkg.id,
    filename: "E2-1-panel-schedule.pdf",
    contentType: "application/pdf",
    data: Buffer.from("%PDF-1.4 panels"),
    versionLabel: "Rev 0",
    supersedes: null,
  });
  const finishPlan = await uploadPlanFile(company.id, company.plan, actor, {
    projectId: project.id,
    packageId: pkgFinish.id,
    filename: "A6-finishes.pdf",
    contentType: "application/pdf",
    data: Buffer.from("%PDF-1.4 finishes"),
    versionLabel: "Rev 0",
    supersedes: null,
  });
  const allPlans = await listPlanFiles(company.id, project.id);
  const current = await currentPlanFiles(company.id, project.id);
  check("4 files stored, the superseded one still downloadable", allPlans.length === 4 && current.length === 3);
  const [v1Row] = await db.select().from(S.planFiles).where(eq(S.planFiles.id, planV1.id));
  check("rev 1 is marked superseded, not deleted", v1Row.supersededAt !== null && (await readPlanFile(v1Row)) !== null);
  check("rev 2 carries its version label", planV2.versionLabel === "Permit set, Rev 2");
  const bytes = await readPlanFile(planV2);
  check("the bytes round-trip out of storage", bytes!.data.toString().startsWith("%PDF-1.4 rev2"));
  check("storage usage is tracked for the plan cap", (await storageUsage(company.id)) === allPlans.reduce((s, f) => s + f.bytes, 0));
  let badTypeBlocked = false;
  try {
    await uploadPlanFile(company.id, company.plan, actor, {
      projectId: project.id, packageId: null, filename: "malware.exe",
      contentType: "application/octet-stream", data: Buffer.from("MZ"), versionLabel: "x", supersedes: null,
    });
  } catch { badTypeBlocked = true; }
  check("a .exe in a bid package is refused", badTypeBlocked);

  /* ------------------------------------------------------------------------ */
  item("5", "invitations: per-trade emails, personal notes, tracked opens, reminders, board");

  const contacts = await db
    .select({ c: S.subContacts, s: S.subCompanies })
    .from(S.subContacts)
    .innerJoin(S.subCompanies, eq(S.subContacts.subCompanyId, S.subCompanies.id))
    .where(eq(S.subContacts.companyId, company.id));
  const elec = contacts.filter((r) => r.s.trades.includes("26"));
  const invited = await sendInvites(company.id, actor, {
    packageId: pkg.id,
    subContactIds: elec.map((e) => e.c.id),
    personalNote: "Same tenant as Building A. Walk-through Thursday at 9.",
  });
  check("4 electrical subs invited", invited.sent === 4, invited.sent);
  const inviteMails = await db
    .select()
    .from(S.emailEvents)
    .where(and(eq(S.emailEvents.companyId, company.id), eq(S.emailEvents.kind, "invite")));
  check("one invite email per sub, deduped by key", inviteMails.length === 4 && new Set(inviteMails.map((m) => m.dedupeKey)).size === 4);
  check("the personal note is stored on the invitation", (await db.select().from(S.invitations).limit(1))[0].personalNote!.includes("Walk-through"));

  const reInvite = await sendInvites(company.id, actor, {
    packageId: pkg.id, subContactIds: elec.map((e) => e.c.id), personalNote: null,
  });
  check("pressing Send twice mails nobody twice", reInvite.sent === 0 && reInvite.skipped === 4, reInvite);
  check("and reproduces the identical links (the sub keeps the first email)",
    reInvite.links.every((l) => invited.links.some((o) => o.url === l.url)));

  const link = (name: string) => invited.links.find((l) => l.subCompany === name)!.url.split("/bid/")[1];
  const drywall = contacts.find((r) => r.s.name === "Cass Ridge Drywall")!;
  const finishInvite = await sendInvites(company.id, actor, {
    packageId: pkgFinish.id, subContactIds: [drywall.c.id], personalNote: null,
  });
  const finishToken = finishInvite.links[0].url.split("/bid/")[1];

  const before = await boardFor(company.id, pkg.id);
  check("the board starts everyone at SENT", before!.rows.every((r) => r.status === "sent"), before!.rows.map((r) => r.status));
  const mCtx = await requirePortal(link("Meridian Electric"));
  await markPortalOpened(mCtx);
  const afterOpen = await boardFor(company.id, pkg.id);
  const meridianRow = afterOpen!.rows.find((r) => r.subCompany.name === "Meridian Electric")!;
  check("an open is tracked and shows on the board", meridianRow.status === "opened" && meridianRow.invitation.openedAt !== null);

  /* ------------------------------------------------------------------------ */
  item("6", "no-login sub portal: token, scope, plans, Q&A, bid form, lump sum, attachment");

  const good = await resolvePortal(link("Harlan Voss Electric"));
  check("a valid token resolves with ids from the invitation row", good.ok && good.ok === true);
  for (const [label, token] of [
    ["garbage", "not-a-token"],
    ["empty", ""],
    ["a jwt signed with another key", "eyJhbGciOiJIUzI1NiJ9.eyJpbnYiOiJ4In0.aaaa"],
  ] as const) {
    const r = await resolvePortal(token);
    check(`${label} is rejected`, !r.ok, r);
  }
  const forged = await mintPortalToken({
    invitationId: mCtx.invitationId, tradePackageId: pkg.id, generation: 77,
  });
  const forgedResult = await verifyPortalToken(forged.token);
  check("a correctly signed token with no matching hash is rejected",
    !forgedResult.ok && forgedResult.reason === "unknown", forgedResult);

  const mView = await loadPortalView(mCtx);
  check("the portal shows project-wide + own-package plans only", mView.plans.length === 3 && !mView.plans.some((p) => p.id === finishPlan.id), mView.plans.map((p) => p.filename));
  check("the portal shows the GC's bid form", mView.formLines.length === 6);

  const mSubmit = await submitPortalBid(mCtx, {
    kind: "itemized",
    lines: [
      { formLineId: at("Temporary power"), rawDescription: "", state: "priced", amount: "8,400" },
      { formLineId: at("Panelboards"), rawDescription: "", state: "priced", amount: "46,200" },
      { formLineId: at("Branch wiring"), rawDescription: "", state: "priced", amount: "92,500" },
      { formLineId: at("Light fixtures"), rawDescription: "", state: "priced", amount: "18,000" },
      { formLineId: at("Fire alarm"), rawDescription: "", state: "excluded", amount: "" },
      { formLineId: at("ALT 1"), rawDescription: "", state: "priced", amount: "22,000" },
    ],
    lumpSumAmount: null,
    inclusions: ["Permits and fees", "As-builts"],
    exclusions: ["Fire alarm", "Dumpsters"],
    notes: "Price holds 30 days.",
  });
  check("submitted total is the base, alternates apart ($165,100)", mSubmit.bid.totalCents === 16_510_000, money(mSubmit.bid.totalCents));
  check("inclusions and exclusions stored as chips", mSubmit.bid.inclusions.length === 2 && mSubmit.bid.exclusions.length === 2);

  const hCtx = await requirePortal(link("Harlan Voss Electric"));
  const draft = await savePortalDraft(hCtx, {
    kind: "itemized",
    lines: [{ formLineId: at("Temporary power"), rawDescription: "", state: "priced", amount: "9,100" }],
    lumpSumAmount: null, inclusions: [], exclusions: [], notes: null,
  });
  check("a draft is saved and not visible as a bid", draft.isDraft && (await loadPortalView(hCtx)).submitted === null);
  const draftAgain = await savePortalDraft(hCtx, {
    kind: "itemized",
    lines: [{ formLineId: at("Temporary power"), rawDescription: "", state: "priced", amount: "9,150" }],
    lumpSumAmount: null, inclusions: [], exclusions: [], notes: null,
  });
  check("saving again edits the same draft, never a second one", draftAgain.id === draft.id);
  const hReturn = await loadPortalView(hCtx);
  check("a returning sub sees their draft on the same link", hReturn.working?.lines[0].amountCents === 915_000);

  await attachToPortalBid(hCtx, {
    filename: "harlan-proposal.pdf", contentType: "application/pdf", data: Buffer.from("%PDF-1.4 proposal"),
  });
  const withAttachment = await loadPortalView(hCtx);
  check("a sub can attach their own proposal", withAttachment.working?.attachments.length === 1);
  let bigBlocked = false;
  try {
    await attachToPortalBid(hCtx, {
      filename: "huge.pdf", contentType: "application/pdf", data: Buffer.alloc(13 * 1024 * 1024),
    });
  } catch { bigBlocked = true; }
  check("an oversized attachment is refused with a reason", bigBlocked);

  const hSubmit = await submitPortalBid(hCtx, {
    kind: "itemized",
    lines: [
      { formLineId: at("Temporary power"), rawDescription: "", state: "priced", amount: "9,100" },
      { formLineId: at("Panelboards"), rawDescription: "", state: "priced", amount: "44,800" },
      { formLineId: at("Branch wiring"), rawDescription: "", state: "priced", amount: "95,750" },
      { formLineId: at("Light fixtures"), rawDescription: "", state: "priced", amount: "17,400" },
      { formLineId: at("Fire alarm"), rawDescription: "", state: "priced", amount: "12,300" },
      { formLineId: null, rawDescription: "Temp power poles + meter base", state: "priced", amount: "4,200" },
    ],
    lumpSumAmount: null, inclusions: ["Dumpsters", "Permits & fees"], exclusions: [], notes: null,
  });
  check("free-form money is inside the submitted total ($183,550)", hSubmit.bid.totalCents === 18_355_000, money(hSubmit.bid.totalCents));

  const bCtx = await requirePortal(link("Brightline Electric"));
  const bSubmit = await submitPortalBid(bCtx, {
    kind: "lump_sum", lines: [], lumpSumAmount: "164,900",
    inclusions: [], exclusions: ["Fire alarm"], notes: "Will not break out by line.",
  });
  check("the lump-sum fallback is accepted as a real answer", bSubmit.bid.kind === "lump_sum" && bSubmit.bid.totalCents === 16_490_000);
  let emptyLumpBlocked = false;
  try {
    await submitPortalBid(bCtx, { kind: "lump_sum", lines: [], lumpSumAmount: "", inclusions: [], exclusions: [], notes: null });
  } catch { emptyLumpBlocked = true; }
  check("an empty lump sum is refused, not stored as zero", emptyLumpBlocked);
  let emptyItemizedBlocked = false;
  try {
    await submitPortalBid(bCtx, { kind: "itemized", lines: [], lumpSumAmount: null, inclusions: [], exclusions: [], notes: null });
  } catch { emptyItemizedBlocked = true; }
  check("an itemized bid with no priced line is refused", emptyItemizedBlocked);

  // Revision.
  const mRevised = await submitPortalBid(mCtx, {
    kind: "itemized",
    lines: [
      { formLineId: at("Temporary power"), rawDescription: "", state: "priced", amount: "8,400" },
      { formLineId: at("Panelboards"), rawDescription: "", state: "priced", amount: "45,900" },
      { formLineId: at("Branch wiring"), rawDescription: "", state: "priced", amount: "92,500" },
      { formLineId: at("Light fixtures"), rawDescription: "", state: "priced", amount: "18,000" },
      { formLineId: at("Fire alarm"), rawDescription: "", state: "excluded", amount: "" },
      { formLineId: at("ALT 1"), rawDescription: "", state: "priced", amount: "22,000" },
    ],
    lumpSumAmount: null,
    inclusions: ["Permits and fees", "As-builts"],
    exclusions: ["Fire alarm", "Dumpsters"],
    notes: "Revised: panel pricing came down.",
  });
  check("a resubmission becomes revision 2", mRevised.revision === 2);
  const revisions = await db
    .select()
    .from(S.bids)
    .where(and(eq(S.bids.invitationId, mCtx.invitationId), eq(S.bids.isDraft, false)));
  check("revision 1 is preserved and marked superseded",
    revisions.length === 2 && revisions.find((r) => r.revision === 1)!.supersededById === mRevised.bid.id);

  // Decline, then change of mind.
  const pikeCtx = await requirePortal(link("Pike Street Electric"));
  await declineFromPortal(pikeCtx, "Booked through July — thanks for the invite.");
  const declined = await boardFor(company.id, pkg.id);
  check("a one-tap decline shows on the board with its reason",
    declined!.rows.find((r) => r.subCompany.name === "Pike Street Electric")!.status === "declined");
  await willBidFromPortal(pikeCtx);
  const unDeclined = await boardFor(company.id, pkg.id);
  check("and can be reversed to WILL BID",
    unDeclined!.rows.find((r) => r.subCompany.name === "Pike Street Electric")!.status === "will_bid");

  /* ------------------------------------------------------------------------ */
  console.log("\n=== BID CONFIDENTIALITY: two subs on one project, each portal driven with the other's ids ===");

  const otherPkgLines = await listFormLines(pkgFinish.id);
  check("Meridian cannot fetch the finishes package's plan by id", (await portalPlanFile(mCtx, finishPlan.id)) === null);
  check("…nor a plan id that belongs to nobody", (await portalPlanFile(mCtx, "00000000-0000-4000-8000-000000000000")) === null);
  check("…nor a non-uuid path", (await portalPlanFile(mCtx, "../../etc/passwd")) === null);
  check("…but can fetch its own package's sheet", (await portalPlanFile(mCtx, elecOnlyPlan.id))?.id === elecOnlyPlan.id);
  check("the drywall bidder cannot fetch the electrical-only sheet", (await portalPlanFile(await requirePortal(finishToken), elecOnlyPlan.id)) === null);

  const injected = await submitPortalBid(mCtx, {
    kind: "itemized",
    lines: [
      { formLineId: at("Temporary power"), rawDescription: "", state: "priced", amount: "8,400" },
      { formLineId: at("Panelboards"), rawDescription: "", state: "priced", amount: "46,200" },
      { formLineId: at("Branch wiring"), rawDescription: "", state: "priced", amount: "92,500" },
      { formLineId: at("Light fixtures"), rawDescription: "", state: "priced", amount: "18,000" },
      { formLineId: at("Fire alarm"), rawDescription: "", state: "excluded", amount: "" },
      { formLineId: at("ALT 1"), rawDescription: "", state: "priced", amount: "22,000" },
      { formLineId: otherPkgLines[0].id, rawDescription: "injected into finishes", state: "priced", amount: "999,999" },
      { formLineId: "00000000-0000-4000-8000-000000000000", rawDescription: "invented id", state: "priced", amount: "1" },
    ],
    lumpSumAmount: null,
    inclusions: ["Permits and fees", "As-builts"],
    exclusions: ["Fire alarm", "Dumpsters"],
    notes: "Revised: panel pricing came down.",
  });
  const injectedLines = await db.select().from(S.bidLines).where(eq(S.bidLines.bidId, injected.bid.id));
  check("a foreign form-line id is dropped, not stored", injectedLines.length === 6 && !injectedLines.some((l) => l.rawDescription.includes("injected")), injectedLines.map((l) => l.rawDescription));
  check("…and not silently turned into a free-form row", !injectedLines.some((l) => l.bidFormLineId === null));
  check("…and the rest of the bid still saved", injected.bid.totalCents === 16_510_000, money(injected.bid.totalCents));
  check("nothing leaked into the finishes grid", (await loadLevelingPage(company.id, pkgFinish.id))!.grid.columns.length === 0);

  const mJson = JSON.stringify(await loadPortalView(mCtx));
  const hJson = JSON.stringify(await loadPortalView(hCtx));
  const bJson = JSON.stringify(await loadPortalView(bCtx));
  check("Meridian's portal never mentions Harlan's bid id", !mJson.includes(hSubmit.bid.id));
  check("Meridian's portal never mentions Brightline's bid id", !mJson.includes(bSubmit.bid.id));
  check("Meridian's portal never contains Harlan's total in cents", !mJson.includes("18355000"));
  check("Meridian's portal never contains Brightline's total in cents", !mJson.includes("16490000"));
  check("Meridian's portal never mentions another invitation id", !mJson.includes(hCtx.invitationId) && !mJson.includes(bCtx.invitationId));
  check("Harlan's portal never mentions Meridian's or Brightline's bid ids", !hJson.includes(injected.bid.id) && !hJson.includes(bSubmit.bid.id));
  check("Harlan's portal never contains Meridian's total in cents", !hJson.includes("16510000"));
  check("Brightline's portal never mentions the itemised bidders' ids", !bJson.includes(injected.bid.id) && !bJson.includes(hSubmit.bid.id));
  check("Harlan's private note is not in anyone else's portal", !mJson.includes("Temp power poles") && !bJson.includes("Temp power poles"));
  check("each portal's working bid belongs to that invitation",
    (await loadPortalView(mCtx)).working?.bid.invitationId === mCtx.invitationId &&
      (await loadPortalView(hCtx)).working?.bid.invitationId === hCtx.invitationId);
  const hAttachment = withAttachment.working!.attachments[0];
  check("one sub cannot fetch another's attachment by id", (await portalAttachment(mCtx, hAttachment.id)) === null);
  check("…but can fetch their own", (await portalAttachment(hCtx, hAttachment.id))?.id === hAttachment.id);

  // A token for one package cannot read a sibling package.
  const crossCtx = await requirePortal(finishToken);
  const crossJson = JSON.stringify(await loadPortalView(crossCtx));
  check("the drywall token resolves only to the drywall package", crossCtx.tradePackageId === pkgFinish.id);
  check("the drywall bidder sees none of the electrical bids",
    !crossJson.includes(hSubmit.bid.id) && !crossJson.includes(injected.bid.id) && !crossJson.includes("18355000"));

  // Revocation and rotation.
  await revokeInvitation(company.id, actor, pikeCtx.invitationId);
  const revoked = await resolvePortal(link("Pike Street Electric"));
  check("a withdrawn link stops working immediately", !revoked.ok && revoked.reason === "revoked", revoked);
  const fresh = await freshLinkFor(company.id, pikeCtx.invitationId);
  check("a fresh link works again", (await resolvePortal(fresh!.split("/bid/")[1])).ok);
  check("…and the old one is dead for good", !(await resolvePortal(link("Pike Street Electric"))).ok);

  // Cross-tenant.
  const [rival] = await db.insert(S.companies).values({ name: "Rival Builders", plan: "crew" }).returning();
  const [rivalUser] = await db
    .insert(S.users)
    .values({ companyId: rival.id, email: "rival@example.com", passwordHash: await hashPassword("rival-pass"), role: "admin" })
    .returning();
  check("another GC cannot load the grid", (await loadLevelingPage(rival.id, pkg.id)) === null);
  check("…nor the status board", (await boardFor(rival.id, pkg.id)) === null);
  check("…nor the questions", (await questionsFor(rival.id, pkg.id)).length === 0);
  check("…nor the plan file", (await listPlanFiles(rival.id, project.id)).length === 0);
  let rivalBlocked = 0;
  for (const attempt of [
    () => mapTrayLine({ companyId: rival.id, userId: rivalUser.id, tradePackageId: pkg.id, bidLineId: injectedLines[0].id, bidFormLineId: at("Panelboards") }),
    () => addAdjustment(rival.id, { userId: rivalUser.id, label: "rival" }, { packageId: pkg.id, bidId: null, bidFormLineId: null, kind: "normalize", amountCents: -1, reason: "sabotage" }),
    () => awardPackage(rival.id, { userId: rivalUser.id, label: "rival" }, { packageId: pkg.id, bidId: hSubmit.bid.id, note: null, acknowledgedWarnings: 0, sendRegrets: false }),
    () => sendInvites(rival.id, { userId: rivalUser.id, label: "rival" }, { packageId: pkg.id, subContactIds: [elec[0].c.id], personalNote: null }),
    () => transcribeBid(rival.id, { userId: rivalUser.id, label: "rival" }, { invitationId: hCtx.invitationId, kind: "lump_sum", lumpSumCents: 1, lines: [], notes: null }),
  ]) {
    try { await attempt(); } catch { rivalBlocked++; }
  }
  check("every write path refuses a foreign company", rivalBlocked === 5, rivalBlocked);

  /* ------------------------------------------------------------------------ */
  item("10", "Q&A thread per package with broadcast answers");

  await askPortalQuestion(hCtx, "Is the fire alarm rough-in in this package, or is 28 buying it out separately?");
  check("the question is recorded against the asker", (await questionsFor(company.id, pkg.id))[0].asker.name === "Harlan Voss Electric");
  check("the GC sees it as unanswered", (await unansweredCount(company.id, pkg.id)) === 1);
  check("other bidders cannot see an unanswered question", (await loadPortalView(mCtx)).questions.length === 0);
  const q = (await questionsFor(company.id, pkg.id))[0].question;
  const answered = await answerQuestion(company.id, actor, {
    questionId: q.id, answer: "Rough-in is in this package. Devices are under 28.", broadcast: true,
  });
  check("the answer broadcasts to every live bidder", answered.notified === 4, answered);
  const mQ = (await loadPortalView(mCtx)).questions;
  check("other bidders now see the Q and A", mQ.length === 1 && mQ[0].answerBody !== null);
  check("…but never who asked", mQ[0].mine === false);
  check("the asker sees it as theirs", (await loadPortalView(hCtx)).questions[0].mine === true);
  const reAnswer = await answerQuestion(company.id, actor, { questionId: q.id, answer: "Rough-in is in this package. Devices are under 28.", broadcast: true });
  check("re-answering does not re-mail anyone", reAnswer.notified === 0, reAnswer);
  check("Q&A emails recorded", (await db.select().from(S.emailEvents).where(eq(S.emailEvents.kind, "qa"))).length >= 4);

  /* ------------------------------------------------------------------------ */
  console.log("\n=== MVP 5 (cont): reminder schedule T-7 / T-3 / T-1 ===");

  const sweepAt = (days: number) => reminderSweep(new Date(dueAt.getTime() - days * 86_400_000));
  const s7 = await sweepAt(5);
  const s7again = await sweepAt(5);
  check("T-7's window sends", s7.sent > 0, s7);
  check("a second sweep in the same window sends nothing", s7again.sent === 0, s7again);
  const s3 = await sweepAt(2);
  check("T-3 fires later, so the ladder does not go silent", s3.sent > 0, s3);
  const s1 = await sweepAt(1);
  check("T-1 fires", s1.sent > 0, s1);
  const s1again = await sweepAt(0);
  check("due-day sweep adds nothing new (T-1 already sent)", s1again.sent === 0, s1again);
  for (const overdue of [1, 4, 30, 400]) {
    const after = await reminderSweep(new Date(dueAt.getTime() + overdue * 86_400_000));
    check(`nothing fires ${overdue} day(s) past the date`, after.sent === 0, after);
  }
  const reminders = await db.select().from(S.emailEvents).where(eq(S.emailEvents.kind, "reminder"));
  check("no rung was ever sent twice", new Set(reminders.map((r) => r.dedupeKey)).size === reminders.length);
  check("submitted bidders were never chased",
    !reminders.some((r) => [mCtx.invitationId, hCtx.invitationId, bCtx.invitationId].includes(r.invitationId ?? "")),
    reminders.map((r) => r.dedupeKey));
  const nudge1 = await nudgeInvitations(company.id, actor, pkgMech.id);
  const nudge2 = await nudgeInvitations(company.id, actor, pkgMech.id);
  check("the manual nudge is once per sub per day", nudge2.sent === 0, [nudge1, nudge2]);

  const cronResult = await tick(new Date(dueAt.getTime() - 2 * 86_400_000));
  check("the cron tick runs and reports", typeof cronResult.reminders.considered === "number", cronResult);

  /* ------------------------------------------------------------------------ */
  item("7", "line-item normalisation: deterministic mapping, lump sum flagged");

  const level1 = await loadLevelingPage(company.id, pkg.id, actor);
  check("Harlan's free-form row is in the tray", level1!.grid.tray.length === 1 && level1!.grid.tray[0].subName === "Harlan Voss Electric", level1!.grid.tray);
  const suggestion = level1!.suggestions.get(level1!.grid.tray[0].bidLineId)!;
  check("a suggestion is offered, and is not auto-applied", suggestion.bidFormLineId === at("Temporary power") && suggestion.autoApply === false, suggestion);
  check("the lump-sum column is flagged as such", level1!.grid.columns.find((c) => c.bid.subName === "Brightline Electric")!.isLumpSum);

  await mapTrayLine({
    companyId: company.id, userId: admin.id, tradePackageId: pkg.id,
    bidLineId: level1!.grid.tray[0].bidLineId, bidFormLineId: at("Temporary power"), remember: true,
  });
  const level2 = await loadLevelingPage(company.id, pkg.id);
  const hCol = level2!.grid.columns.find((c) => c.bid.subName === "Harlan Voss Electric")!;
  check("the tray empties", level2!.grid.tray.length === 0);
  check("the sub's total is unchanged by mapping", hCol.baseCents === 18_355_000, money(hCol.baseCents));
  const tempRow = level2!.grid.rows.find((r) => r.formLine.id === at("Temporary power"))!;
  const hTempCell = tempRow.cells.find((c) => c.bidId === hCol.bid.id)!;
  check("the cell sums both rows ($13,300)", hTempCell.amountCents === 1_330_000 && hTempCell.lineCount === 2);
  check("the correction is remembered for this sub", (await db.select().from(S.subLineAliases)).length === 1);
  await unmapTrayLine({ companyId: company.id, userId: admin.id, tradePackageId: pkg.id, bidLineId: level1!.grid.tray[0].bidLineId });
  check("unmapping puts it back and forgets the alias",
    (await loadLevelingPage(company.id, pkg.id))!.grid.tray.length === 1 && (await db.select().from(S.subLineAliases)).length === 0);
  await mapTrayLine({
    companyId: company.id, userId: admin.id, tradePackageId: pkg.id,
    bidLineId: level1!.grid.tray[0].bidLineId, bidFormLineId: at("Temporary power"), remember: true,
  });

  /* ------------------------------------------------------------------------ */
  item("8", "bid leveling: side-by-side, per-line lows, matrix, plugs, adjustments, apparent low");

  await addAdjustment(company.id, actor, {
    packageId: pkg.id, bidId: bSubmit.bid.id, bidFormLineId: at("Fire alarm"),
    kind: "plug", amountCents: 1_230_000, reason: "Lump sum excludes fire alarm",
  });
  await addAdjustment(company.id, actor, {
    packageId: pkg.id, bidId: bSubmit.bid.id, bidFormLineId: null,
    kind: "scope_add", amountCents: 240_000, reason: "Dumpsters not carried in the lump sum",
  });
  await addAdjustment(company.id, actor, {
    packageId: pkg.id, bidId: injected.bid.id, bidFormLineId: at("Fire alarm"),
    kind: "plug", amountCents: 1_230_000, reason: "Plugged at Harlan's fire alarm number",
  });
  const scrap = await addAdjustment(company.id, actor, {
    packageId: pkg.id, bidId: hSubmit.bid.id, bidFormLineId: null,
    kind: "normalize", amountCents: -1, reason: "to be removed",
  });
  const scrapRow = (await adjustmentsFor(company.id, pkg.id)).find((a) => a.reason === "to be removed")!;
  await removeAdjustment(company.id, actor, scrapRow.id);
  check("an adjustment can be removed", !(await adjustmentsFor(company.id, pkg.id)).some((a) => a.reason === "to be removed"));

  const g = (await loadLevelingPage(company.id, pkg.id))!.grid;
  const mCol = g.columns.find((c) => c.bid.subName === "Meridian Electric")!;
  const hCol2 = g.columns.find((c) => c.bid.subName === "Harlan Voss Electric")!;
  const bCol = g.columns.find((c) => c.bid.subName === "Brightline Electric")!;
  check("three columns, one per active revision", g.columns.length === 3, g.columns.map((c) => `${c.bid.subName} r${c.bid.revision}`));
  check("only the latest revision is compared", mCol.bid.revision === 3, mCol.bid.revision);
  check("Meridian base $165,100 + plug $12,300 = $177,400", mCol.baseCents === 16_510_000 && mCol.adjustedTotalCents === 17_740_000, money(mCol.adjustedTotalCents));
  check("Harlan adjusted $183,550", hCol2.adjustedTotalCents === 18_355_000, money(hCol2.adjustedTotalCents));
  check("Brightline raw $164,900 → adjusted $179,600", bCol.baseCents === 16_490_000 && bCol.adjustedTotalCents === 17_960_000, money(bCol.adjustedTotalCents));
  check("the raw low is Brightline at $164,900", [...g.columns].sort((a, b) => a.baseCents - b.baseCents)[0].bid.id === bCol.bid.id, g.columns.map((c) => [c.bid.subName, money(c.baseCents)]));
  check("the apparent low is Meridian, on adjusted totals", g.apparentLow!.bidId === mCol.bid.id, g.apparentLow);
  check("spread is high minus low ($6,150)", g.spreadCents === 615_000, money(g.spreadCents!));
  const faRow = g.rows.find((r) => r.formLine.id === at("Fire alarm"))!;
  check("Harlan's real fire-alarm price wins the per-line low", faRow.lowCents === 1_230_000);
  check("neither plug is marked low", faRow.cells.filter((c) => c.kind === "plug").every((c) => !c.isLow));
  check("the fire-alarm row is a scope gap", faRow.scopeGap === true);
  const panelRow = g.rows.find((r) => r.formLine.id === at("Panelboards"))!;
  // Harlan 44,800 against Meridian's revised 45,900 — Harlan holds this line.
  check("the cheaper panel price wins that line", panelRow.lowCents === 4_480_000, money(panelRow.lowCents!));
  check("the matrix flags dumpsters as a scope gap", g.matrix.some((m) => /dumpster/i.test(m.label) && m.scopeGap), g.matrix.map((m) => [m.label, m.scopeGap]));
  check("alternates are held in their own block", g.alternateRows.length === 1 && mCol.alternatesCents === 2_200_000);
  check("every column reconciles: base + plugs + adjustments", g.columns.every((c) => c.adjustedTotalCents === c.baseCents + c.plugCents + c.adjustmentCents));

  /* ------------------------------------------------------------------------ */
  console.log("\n=== MVP 5 (cont): transcribing a bid that came by email ===");
  const mechContact = contacts.find((r) => r.s.name === "Meridian Electric")!;
  await sendInvites(company.id, actor, { packageId: pkgMech.id, subContactIds: [mechContact.c.id], personalNote: null });
  const mechBoard = await boardFor(company.id, pkgMech.id);
  const mechLines = await listFormLines(pkgMech.id);
  await transcribeBid(company.id, actor, {
    invitationId: mechBoard!.rows[0].invitation.id,
    kind: "itemized",
    lumpSumCents: null,
    lines: mechLines.map((l, i) => ({ bidFormLineId: l.id, amountCents: (i + 1) * 250_000, excluded: false })),
    notes: "Emailed PDF 3/15.",
  });
  const mechGrid = await loadLevelingPage(company.id, pkgMech.id);
  check("a transcribed bid appears on the grid", mechGrid!.grid.columns.length === 1 && mechGrid!.grid.columns[0].baseCents > 0, mechGrid!.grid.columns[0]?.baseCents);
  check("it is attributed to the estimator who typed it",
    (await db.select().from(S.bidLines).where(eq(S.bidLines.bidId, mechGrid!.grid.columns[0].bid.id)))[0].mappedBy === admin.id);

  /* ------------------------------------------------------------------------ */
  item("12", "leveling export: CSV and PDF for the owner meeting");

  const page = (await loadLevelingPage(company.id, pkg.id))!;
  const exportInput = {
    project, pkg: page.pkg, grid: page.grid,
    adjustments: await adjustmentsFor(company.id, pkg.id),
    questions: await answeredQuestions(company.id, pkg.id),
    generatedAt: new Date(), companyName: company.name,
  };
  const csvOut = levelingCsv(exportInput);
  check("CSV names every bidder", ["Meridian", "Harlan", "Brightline"].every((n) => csvOut.includes(n)));
  check("CSV marks plugs with (p)", csvOut.includes("(p)"));
  check("CSV footnotes the plug reason", csvOut.includes("Lump sum excludes fire alarm"));
  check("CSV flags the scope gap", csvOut.includes("*SCOPE GAP*"));
  check("CSV carries the adjusted totals", csvOut.includes("ADJUSTED TOTAL") && csvOut.includes("179,600.00"));
  check("CSV separates the alternates", csvOut.includes("Alternates (not in the base total)"));
  check("CSV includes the Q&A as an addendum", csvOut.includes("Devices are under 28"));
  check("CSV notes the lump-sum bidder", csvOut.includes("submitted a lump sum"));
  const pdf = await levelingPdf(exportInput);
  check("PDF is a PDF and is not trivially small", Buffer.from(pdf.slice(0, 5)).toString() === "%PDF-" && pdf.byteLength > 3000, pdf.byteLength);
  check("export filename is readable", exportFilename({ project, pkg: page.pkg, ext: "csv" }) === "fulton-yard-building-b-ti-26-electrical-leveling.csv", exportFilename({ project, pkg: page.pkg, ext: "csv" }));
  check("exports are gated to Builder and up", hasLevelingExports("builder") && !hasLevelingExports("crew"));

  /* ------------------------------------------------------------------------ */
  item("9", "award flow: winner per trade, award + regret notices, statuses locked");

  const pre = await awardPreflight(company.id, pkg.id, g.apparentLow!.bidId);
  check("preflight reports the adjusted basis", pre.adjustedTotalCents === 17_740_000, money(pre.adjustedTotalCents));
  check("preflight names what is outstanding", pre.warnings.length > 0, pre.warnings);
  const notLow = await awardPreflight(company.id, pkg.id, hSubmit.bid.id);
  check("choosing a bidder who is not the low is flagged", notLow.notApparentLow === true);

  let staleBlocked = false;
  try {
    await awardPackage(company.id, actor, { packageId: pkg.id, bidId: g.apparentLow!.bidId, note: null, acknowledgedWarnings: 99, sendRegrets: true });
  } catch { staleBlocked = true; }
  check("awarding without acknowledging the current flags is refused", staleBlocked);

  const awarded = await awardPackage(company.id, actor, {
    packageId: pkg.id, bidId: g.apparentLow!.bidId, note: "Subcontract to follow.",
    acknowledgedWarnings: pre.warnings.length, sendRegrets: true,
  });
  check("1 award notice + 2 regret notices", awarded.awardEmails === 1 && awarded.regretEmails === 2, awarded);
  check("the awarded total is frozen at the basis used", awarded.award.awardedTotalCents === 17_740_000);
  const [lockedPkg] = await db.select().from(S.tradePackages).where(eq(S.tradePackages.id, pkg.id));
  check("the package is locked to awarded", lockedPkg.status === "awarded" && lockedPkg.awardedBidId === g.apparentLow!.bidId);
  check("award + regret emails recorded",
    (await db.select().from(S.emailEvents).where(inArray(S.emailEvents.kind, ["award", "regret"]))).length === 3);

  let portalLocked = false;
  try {
    await submitPortalBid(hCtx, { kind: "lump_sum", lines: [], lumpSumAmount: "1", inclusions: [], exclusions: [], notes: null });
  } catch { portalLocked = true; }
  check("the portal refuses a bid on an awarded package", portalLocked);
  let draftLocked = false;
  try {
    await savePortalDraft(hCtx, { kind: "itemized", lines: [], lumpSumAmount: null, inclusions: [], exclusions: [], notes: null });
  } catch { draftLocked = true; }
  check("…and refuses to save a draft", draftLocked);
  let adjLocked = false;
  try {
    await addAdjustment(company.id, actor, { packageId: pkg.id, bidId: null, bidFormLineId: null, kind: "normalize", amountCents: 1, reason: "after award" });
  } catch { adjLocked = true; }
  check("…and adjustments are refused after the award", adjLocked);
  let mapLocked = false;
  try {
    await mapTrayLine({ companyId: company.id, userId: admin.id, tradePackageId: pkg.id, bidLineId: injectedLines[0].id, bidFormLineId: at("Panelboards") });
  } catch { mapLocked = true; }
  check("…and mapping is refused after the award", mapLocked);

  await unawardPackage(company.id, actor, { packageId: pkg.id, reason: "Sub withdrew — could not hold the price." });
  const [reopened] = await db.select().from(S.tradePackages).where(eq(S.tradePackages.id, pkg.id));
  const awardRows = await db.select().from(S.awards).where(eq(S.awards.tradePackageId, pkg.id));
  check("un-awarding reopens the package", reopened.status === "open" && reopened.awardedBidId === null);
  check("…and keeps the prior award as history", awardRows.length === 1 && awardRows[0].revokedAt !== null);
  await awardPackage(company.id, actor, {
    packageId: pkg.id, bidId: g.apparentLow!.bidId, note: null,
    acknowledgedWarnings: (await awardPreflight(company.id, pkg.id, g.apparentLow!.bidId)).warnings.length, sendRegrets: false,
  });
  check("it can be re-awarded", (await db.select().from(S.tradePackages).where(eq(S.tradePackages.id, pkg.id)))[0].status === "awarded");

  await updateProject(company.id, project.id, { status: "leveling" });
  for (const p of [pkgMech.id, pkgFinish.id]) {
    await db.update(S.tradePackages).set({ status: "awarded" }).where(eq(S.tradePackages.id, p));
  }
  await rollUpProjectStatus(company.id, project.id);
  check("a project rolls to awarded when every package is",
    (await db.select().from(S.projects).where(eq(S.projects.id, project.id)))[0].status === "awarded");

  /* ------------------------------------------------------------------------ */
  item("11", "billing: three tiers, project and seat limits enforced");

  const [crewCo] = await db.insert(S.companies).values({ name: "Crew Only", plan: "crew" }).returning();
  for (let i = 0; i < 3; i++) {
    await createProject(crewCo.id, "crew", actor, { name: `Job ${i}`, address: null, bidDueAt: new Date(Date.now() + 86_400_000), notes: null });
  }
  let fourth = "";
  try {
    await createProject(crewCo.id, "crew", actor, { name: "Job 4", address: null, bidDueAt: new Date(Date.now() + 86_400_000), notes: null });
  } catch (e) { fourth = (e as Error).message; }
  check("a Crew account cannot open a 4th active project", fourth.includes("Builder"), fourth);
  check("archiving frees the slot", await (async () => {
    const [p] = await db.select().from(S.projects).where(eq(S.projects.companyId, crewCo.id)).limit(1);
    await updateProject(crewCo.id, p.id, { status: "archived" });
    return canCreateProject("crew", await countActiveProjects(crewCo.id)).allowed;
  })());
  check("Precon is unlimited", canCreateProject("precon", 500).allowed);
  check("plan prices match the README", [PLANS.crew.priceMonthly, PLANS.builder.priceMonthly, PLANS.precon.priceMonthly].join(",") === "149,249,399");

  const sync = readSubscriptionEvent({
    id: "sub_test", status: "active", metadata: { companyId: crewCo.id },
    items: { data: [{ price: { id: "price_unknown_to_us" } }] },
  });
  await applySubscriptionSync(sync);
  check("an unrecognised price never downgrades a payer",
    (await db.select().from(S.companies).where(eq(S.companies.id, crewCo.id)))[0].plan === "crew" && sync.plan === null);

  /* ------------------------------------------------------------------------ */
  console.log("\n=== audit log: every bid view and portal access ===");
  const trail = await db.select().from(S.auditLog).where(eq(S.auditLog.companyId, company.id));
  const actions = new Set(trail.map((t) => t.action));
  for (const a of [
    "project.created", "package.created", "subs.imported", "plan.uploaded", "invites.sent",
    "portal.open", "bid.submitted", "bid.resubmitted", "bid.draft_saved", "bid.attachment_added",
    "plan.downloaded", "question.asked", "question.answered_broadcast", "bid_line.mapped",
    "leveling.plug_added", "leveling.viewed", "package.awarded", "package.unawarded",
    "invitation.declined", "invitation.revoked", "bid.transcribed", "reminders.nudged",
  ]) {
    check(`audit records ${a}`, actions.has(a), [...actions].sort().join(", "));
  }
  check("portal actions are attributed to the invitation, not a user",
    trail.filter((t) => t.action === "bid.submitted").every((t) => t.actorKind === "invitation"));

  const summaries = await packageSummaries(company.id, project.id);
  check("package summaries cover the project", summaries.length === 3 && summaries.some((s) => s.submitted === 3), summaries.map((s) => [s.pkg.csiDivision, s.submitted]));

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  await closeDb();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("\nFATAL", err);
  await closeDb();
  process.exit(1);
});
