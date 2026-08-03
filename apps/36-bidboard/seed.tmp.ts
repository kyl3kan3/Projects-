/** Throwaway seed for browser verification. Leaves a package mid-bid, not awarded. */
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import * as S from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { addFormLine, createPackage, createProject, listFormLines } from "@/lib/projects";
import { importSubs, parseSubImport } from "@/lib/subs";
import { sendInvites } from "@/lib/invites";
import { askPortalQuestion, requirePortal, submitPortalBid } from "@/lib/portal";
import { uploadPlanFile } from "@/lib/plan-files";
import { addAdjustment, loadLevelingPage } from "@/lib/leveling-data";

const db = getDb();

async function main() {
  await db.delete(S.companies);
  await db.delete(S.fileBlobs);

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
  const [user] = await db
    .insert(S.users)
    .values({
      companyId: company.id,
      email: "kyle@fultonbuild.example",
      name: "Kyle Ferrand",
      passwordHash: await hashPassword("fulton-yard-2026"),
      role: "admin",
    })
    .returning();
  const actor = { userId: user.id, label: user.email };

  const csv = [
    "Company Name,Contact,Email Address,Phone,Divisions,City",
    "Meridian Electric,Dana Reyes,dana@meridian-elec.example,503-555-0142,26;27,Portland",
    "Harlan Voss Electric,Hal Voss,hal@harlanvoss.example,503-555-0199,Div 26,Beaverton",
    "Brightline Electric,Sam Ives,sam@brightline-elec.example,503-555-0177,electrical,Vancouver",
    "Pike Street Electric,Ruth Okafor,ruth@pikestreet-elec.example,503-555-0163,26,Portland",
    "Cass Ridge Drywall,Marta Cass,office@cassridge.example,503-555-0121,Drywall,Gresham",
    "Northfield Roofing,Pat Northfield,pat@northfieldroofing.example,,Roofing,Tigard",
  ].join("\n");
  await importSubs(company.id, actor, parseSubImport(csv).rows);

  const project = await createProject(company.id, "builder", actor, {
    name: "Fulton Yard — Building B TI",
    address: "1420 SE Fulton St, Portland OR",
    bidDueAt: new Date(Date.now() + 6 * 86_400_000),
    notes: "Owner meeting the 24th. Tenant wants mechanical broken out.",
  });
  const pkg = await createPackage(company.id, project.id, actor, {
    csiDivision: "26",
    scopeNotes:
      "Base bid excludes owner-furnished fixtures. Include all permits and inspections. Night work weeks 3-4.",
    seedForm: true,
  });
  await createPackage(company.id, project.id, actor, {
    csiDivision: "23",
    scopeNotes: "Two RTUs, curbs by us.",
    seedForm: true,
  });
  await createPackage(company.id, project.id, actor, {
    csiDivision: "09",
    scopeNotes: "Level 4 finish throughout.",
    seedForm: true,
  });
  await addFormLine(company.id, pkg.id, {
    description: "ALT 1: Site lighting poles",
    unit: "EA",
    quantity: "6",
    isAlternate: true,
    isAllowance: false,
  });
  await uploadPlanFile(company.id, "builder", actor, {
    projectId: project.id,
    packageId: null,
    filename: "Fulton-B-E-sheets.pdf",
    contentType: "application/pdf",
    data: Buffer.from("%PDF-1.4 " + "x".repeat(4000)),
    versionLabel: "Permit set, Rev 2",
    supersedes: null,
  });

  const contacts = await db
    .select({ c: S.subContacts, s: S.subCompanies })
    .from(S.subContacts)
    .innerJoin(S.subCompanies, eq(S.subContacts.subCompanyId, S.subCompanies.id));
  const bidders = contacts.filter(
    (r) => r.s.trades.includes("26") && r.s.name !== "Pike Street Electric",
  );
  const invited = await sendInvites(company.id, actor, {
    packageId: pkg.id,
    subContactIds: bidders.map((e) => e.c.id),
    personalNote: "Same tenant as Building A. Walk-through Thursday at 9.",
  });
  // Pike Street is invited and stays silent, so the board shows a real mix.
  const pike = contacts.find((r) => r.s.name === "Pike Street Electric")!;
  const pikeInvite = await sendInvites(company.id, actor, {
    packageId: pkg.id,
    subContactIds: [pike.c.id],
    personalNote: null,
  });

  const formLines = await listFormLines(pkg.id);
  const at = (d: string) => formLines.find((f) => f.description.startsWith(d))!.id;
  const link = (name: string) =>
    invited.links.find((l) => l.subCompany === name)!.url.split("/bid/")[1];

  const m = await requirePortal(link("Meridian Electric"));
  await submitPortalBid(m, {
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
    notes: "Price holds 30 days. Assumes panel schedule on E2.1 rev 2.",
  });

  const h = await requirePortal(link("Harlan Voss Electric"));
  await submitPortalBid(h, {
    kind: "itemized",
    lines: [
      { formLineId: at("Temporary power"), rawDescription: "", state: "priced", amount: "9,100" },
      { formLineId: at("Panelboards"), rawDescription: "", state: "priced", amount: "44,800" },
      { formLineId: at("Branch wiring"), rawDescription: "", state: "priced", amount: "95,750" },
      { formLineId: at("Light fixtures"), rawDescription: "", state: "priced", amount: "17,400" },
      { formLineId: at("Fire alarm"), rawDescription: "", state: "priced", amount: "12,300" },
      {
        formLineId: null,
        rawDescription: "Temp power poles + meter base",
        state: "priced",
        amount: "4,200",
      },
    ],
    lumpSumAmount: null,
    inclusions: ["Dumpsters", "Permits & fees"],
    exclusions: [],
    notes: null,
  });

  const b = await requirePortal(link("Brightline Electric"));
  await submitPortalBid(b, {
    kind: "lump_sum",
    lines: [],
    lumpSumAmount: "164,900",
    inclusions: [],
    exclusions: ["Fire alarm"],
    notes: "Will not break out by line.",
  });

  const level = await loadLevelingPage(company.id, pkg.id);
  const bCol = level!.grid.columns.find((c) => c.bid.subName === "Brightline Electric")!;
  const mCol = level!.grid.columns.find((c) => c.bid.subName === "Meridian Electric")!;
  await addAdjustment(company.id, actor, {
    packageId: pkg.id,
    bidId: bCol.bid.id,
    bidFormLineId: at("Fire alarm"),
    kind: "plug",
    amountCents: 1_230_000,
    reason: "Lump sum excludes fire alarm",
  });
  await addAdjustment(company.id, actor, {
    packageId: pkg.id,
    bidId: bCol.bid.id,
    bidFormLineId: null,
    kind: "scope_add",
    amountCents: 240_000,
    reason: "Dumpsters not carried in the lump sum",
  });
  await addAdjustment(company.id, actor, {
    packageId: pkg.id,
    bidId: mCol.bid.id,
    bidFormLineId: at("Fire alarm"),
    kind: "plug",
    amountCents: 1_230_000,
    reason: "Plugged at Harlan's fire alarm number",
  });

  await askPortalQuestion(
    h,
    "Is the fire alarm rough-in in this package, or is 28 buying it out separately?",
  );

  console.log(
    JSON.stringify(
      {
        login: { email: user.email, password: "fulton-yard-2026" },
        projectId: project.id,
        pkgId: pkg.id,
        pikePortal: pikeInvite.links[0].url,
        harlanPortal: invited.links.find((l) => l.subCompany === "Harlan Voss Electric")!.url,
      },
      null,
      2,
    ),
  );
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
