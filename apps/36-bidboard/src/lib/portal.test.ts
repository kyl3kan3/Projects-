/**
 * Database-backed behaviour: bid confidentiality (proved by attack) and the mapping
 * memory.
 *
 * This is the test that matters most in the product. Two subs are invited to one
 * project — one on the electrical package, one on finishes — and each portal is then
 * driven with the *other* one's ids: their plan file, their form line, their token's
 * package. Nothing may leak, and nothing may be written across the boundary.
 *
 * It needs a real database, because the whole mechanism is `(id, scope)` pairs in
 * SQL — an in-memory fake would prove nothing. With no `DATABASE_URL` the suite skips
 * rather than passing vacuously:
 *
 *   node --env-file=.env.local node_modules/.bin/tsx --test src/lib/portal.test.ts
 */

import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import {
  bidLines,
  companies,
  subCompanies,
  subContacts,
  users,
  DEFAULT_SETTINGS,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { addFormLine, createPackage, createProject, listFormLines } from "@/lib/projects";
import { uploadPlanFile } from "@/lib/plan-files";
import { boardFor, sendInvites } from "@/lib/invites";
import { loadLevelingPage } from "@/lib/leveling-data";
import { mapTrayLine } from "@/lib/mapping";
import {
  loadPortalView,
  portalPlanFile,
  requirePortal,
  submitPortalBid,
} from "@/lib/portal";
import { mintPortalToken, resolveAndVerifyForTest } from "@/lib/portal-tokens.test-helpers";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("bid confidentiality", { skip: hasDb ? false : "set DATABASE_URL to run" }, () => {
  const ids = {
    companyId: "",
    userId: "",
    projectId: "",
    elecPkgId: "",
    finishPkgId: "",
    elecPlanId: "",
    finishPlanId: "",
    sharedPlanId: "",
    tokenA: "",
    tokenB: "",
    tokenC: "",
  };

  before(async () => {
    const db = getDb();
    const [company] = await db
      .insert(companies)
      .values({
        name: `Confidentiality Fixture ${Date.now()}`,
        plan: "builder",
        replyToEmail: "estimating@fixture.example",
        settings: DEFAULT_SETTINGS,
      })
      .returning();
    ids.companyId = company.id;

    const [user] = await db
      .insert(users)
      .values({
        companyId: company.id,
        email: `fixture-${Date.now()}@fixture.example`,
        passwordHash: await hashPassword("fixture-password"),
        role: "admin",
      })
      .returning();
    ids.userId = user.id;
    const actor = { userId: user.id, label: user.email };

    const project = await createProject(company.id, "builder", actor, {
      name: "Confidentiality Fixture Project",
      address: null,
      bidDueAt: new Date(Date.now() + 6 * 86_400_000),
      notes: null,
    });
    ids.projectId = project.id;

    const elec = await createPackage(company.id, project.id, actor, {
      csiDivision: "26",
      scopeNotes: "Electrical.",
      seedForm: true,
    });
    const finishes = await createPackage(company.id, project.id, actor, {
      csiDivision: "09",
      scopeNotes: "Finishes.",
      seedForm: true,
    });
    ids.elecPkgId = elec.id;
    ids.finishPkgId = finishes.id;
    await addFormLine(company.id, elec.id, {
      description: "ALT 1: Site lighting poles",
      unit: "EA",
      quantity: "6",
      isAlternate: true,
      isAllowance: false,
    });

    const shared = await uploadPlanFile(company.id, "builder", actor, {
      projectId: project.id,
      packageId: null,
      filename: "shared-cover.pdf",
      contentType: "application/pdf",
      data: Buffer.from("%PDF-1.4 cover sheet"),
      versionLabel: "Rev 0",
      supersedes: null,
    });
    const elecPlan = await uploadPlanFile(company.id, "builder", actor, {
      projectId: project.id,
      packageId: elec.id,
      filename: "electrical-only.pdf",
      contentType: "application/pdf",
      data: Buffer.from("%PDF-1.4 electrical"),
      versionLabel: "Rev 0",
      supersedes: null,
    });
    const finishPlan = await uploadPlanFile(company.id, "builder", actor, {
      projectId: project.id,
      packageId: finishes.id,
      filename: "finishes-only.pdf",
      contentType: "application/pdf",
      data: Buffer.from("%PDF-1.4 finishes"),
      versionLabel: "Rev 0",
      supersedes: null,
    });
    ids.sharedPlanId = shared.id;
    ids.elecPlanId = elecPlan.id;
    ids.finishPlanId = finishPlan.id;

    const mkSub = async (name: string, email: string, trades: string[]) => {
      const [sub] = await db
        .insert(subCompanies)
        .values({ companyId: company.id, name, trades, source: "manual" })
        .returning();
      const [contact] = await db
        .insert(subContacts)
        .values({ companyId: company.id, subCompanyId: sub.id, name, email, isPrimary: true })
        .returning();
      return contact.id;
    };
    const stamp = Date.now();
    const a = await mkSub("Fixture Electric A", `a-${stamp}@fixture.example`, ["26"]);
    const b = await mkSub("Fixture Electric B", `b-${stamp}@fixture.example`, ["26"]);
    const c = await mkSub("Fixture Drywall C", `c-${stamp}@fixture.example`, ["09"]);

    const elecInvites = await sendInvites(company.id, actor, {
      packageId: elec.id,
      subContactIds: [a, b],
      personalNote: null,
    });
    const finishInvites = await sendInvites(company.id, actor, {
      packageId: finishes.id,
      subContactIds: [c],
      personalNote: null,
    });
    ids.tokenA = elecInvites.links[0].url.split("/bid/")[1];
    ids.tokenB = elecInvites.links[1].url.split("/bid/")[1];
    ids.tokenC = finishInvites.links[0].url.split("/bid/")[1];
  });

  after(async () => {
    if (!hasDb) return;
    const db = getDb();
    await db.delete(companies).where(eq(companies.id, ids.companyId));
    await closeDb();
  });

  it("resolves a scope whose ids all come from the invitation row", async () => {
    const ctx = await requirePortal(ids.tokenA);
    assert.equal(ctx.companyId, ids.companyId);
    assert.equal(ctx.tradePackageId, ids.elecPkgId);
    assert.equal(ctx.invitation.tradePackageId, ids.elecPkgId);
  });

  it("rejects a validly signed token whose hash is not the stored one", async () => {
    const ctx = await requirePortal(ids.tokenA);
    // Signed with the real key, for the real invitation — but at a generation the
    // invitation is not at, so the hash does not match the row.
    const forged = await mintPortalToken({
      invitationId: ctx.invitationId,
      tradePackageId: ids.elecPkgId,
      generation: 4242,
    });
    const result = await resolveAndVerifyForTest(forged.token);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "unknown");
  });

  it("hands each bidder only their own plans", async () => {
    const a = await requirePortal(ids.tokenA);
    const c = await requirePortal(ids.tokenC);

    // The shared cover sheet: both.
    assert.equal((await portalPlanFile(a, ids.sharedPlanId))?.id, ids.sharedPlanId);
    assert.equal((await portalPlanFile(c, ids.sharedPlanId))?.id, ids.sharedPlanId);
    // Their own package's sheet: yes.
    assert.equal((await portalPlanFile(a, ids.elecPlanId))?.id, ids.elecPlanId);
    assert.equal((await portalPlanFile(c, ids.finishPlanId))?.id, ids.finishPlanId);
    // The other package's sheet, asked for by id: null, not the file.
    assert.equal(await portalPlanFile(a, ids.finishPlanId), null);
    assert.equal(await portalPlanFile(c, ids.elecPlanId), null);
    // And a well-formed id that is nobody's.
    assert.equal(await portalPlanFile(a, "00000000-0000-4000-8000-000000000000"), null);
    // And an id that is not a uuid at all.
    assert.equal(await portalPlanFile(a, "../../etc/passwd"), null);
  });

  it("drops an amount posted against another package's form line", async () => {
    const a = await requirePortal(ids.tokenA);
    const elecLines = await listFormLines(ids.elecPkgId);
    const finishLines = await listFormLines(ids.finishPkgId);

    const result = await submitPortalBid(a, {
      kind: "itemized",
      lines: [
        {
          formLineId: elecLines[0].id,
          rawDescription: "",
          state: "priced",
          amount: "8,400",
        },
        {
          formLineId: finishLines[0].id,
          rawDescription: "injected into the finishes package",
          state: "priced",
          amount: "999,999",
        },
        {
          formLineId: "00000000-0000-4000-8000-000000000000",
          rawDescription: "invented id",
          state: "priced",
          amount: "1",
        },
      ],
      lumpSumAmount: null,
      inclusions: [],
      exclusions: [],
      notes: null,
    });

    const db = getDb();
    const stored = await db.select().from(bidLines).where(eq(bidLines.bidId, result.bid.id));
    // Only the line that belongs to this package survived.
    assert.equal(stored.length, 1);
    assert.equal(stored[0].bidFormLineId, elecLines[0].id);
    // The foreign ids were dropped, not silently turned into free-form rows — which
    // would have let an attacker inject arbitrary rows into a bid.
    assert.equal(
      stored.some((l) => l.rawDescription.includes("injected")),
      false,
    );
    // The rest of the bid still saved: one bad field does not lose a sub's work.
    assert.equal(result.bid.totalCents, 840_000);

    // Nothing appeared in the other package's grid.
    const finishGrid = await loadLevelingPage(ids.companyId, ids.finishPkgId);
    assert.equal(finishGrid!.grid.columns.length, 0);
  });

  it("never renders one sub's numbers in another sub's portal", async () => {
    const a = await requirePortal(ids.tokenA);
    const b = await requirePortal(ids.tokenB);
    const elecLines = await listFormLines(ids.elecPkgId);

    const bBid = await submitPortalBid(b, {
      kind: "itemized",
      lines: [
        { formLineId: elecLines[0].id, rawDescription: "", state: "priced", amount: "7,777.77" },
        {
          formLineId: null,
          rawDescription: "B's private extra scope",
          state: "priced",
          amount: "1,234.56",
        },
      ],
      lumpSumAmount: null,
      inclusions: ["B only inclusion"],
      exclusions: [],
      notes: "B's private note",
      });

    const aView = JSON.stringify(await loadPortalView(a));
    assert.equal(aView.includes(bBid.bid.id), false, "A must not see B's bid id");
    assert.equal(aView.includes("777777"), false, "A must not see B's amount in cents");
    assert.equal(aView.includes("7,777.77"), false);
    assert.equal(aView.includes("B's private note"), false);
    assert.equal(aView.includes("B only inclusion"), false);
    assert.equal(aView.includes("B's private extra scope"), false);
    assert.equal(aView.includes(b.invitationId), false, "A must not see B's invitation id");

    // And the reverse.
    const bView = JSON.stringify(await loadPortalView(b));
    assert.equal(bView.includes(a.invitationId), false);

    // Each portal's working bid is its own.
    const aWorking = (await loadPortalView(a)).working;
    assert.equal(aWorking?.bid.invitationId, a.invitationId);
    const bWorking = (await loadPortalView(b)).working;
    assert.equal(bWorking?.bid.invitationId, b.invitationId);
  });

  it("keeps the GC-side board and grid scoped to the owning company", async () => {
    const db = getDb();
    const [rival] = await db
      .insert(companies)
      .values({ name: `Rival ${Date.now()}`, plan: "crew" })
      .returning();
    try {
      assert.equal(await loadLevelingPage(rival.id, ids.elecPkgId), null);
      assert.equal(await boardFor(rival.id, ids.elecPkgId), null);

      const line = (await db.select().from(bidLines).limit(1))[0];
      const elecLines = await listFormLines(ids.elecPkgId);
      await assert.rejects(
        mapTrayLine({
          companyId: rival.id,
          userId: ids.userId,
          tradePackageId: ids.elecPkgId,
          bidLineId: line.id,
          bidFormLineId: elecLines[0].id,
        }),
      );
    } finally {
      await db.delete(companies).where(eq(companies.id, rival.id));
    }
  });

  it("shows a broadcast answer to everyone and the asker to no one", async () => {
    const { askPortalQuestion } = await import("@/lib/portal");
    const { answerQuestion, questionsFor } = await import("@/lib/questions");
    const a = await requirePortal(ids.tokenA);
    const b = await requirePortal(ids.tokenB);

    await askPortalQuestion(a, "Is the fire alarm in this package?");
    const rows = await questionsFor(ids.companyId, ids.elecPkgId);
    const question = rows[0].question;

    // Before the answer, only the asker can see it at all.
    assert.equal((await loadPortalView(b)).questions.length, 0);
    assert.equal((await loadPortalView(a)).questions.length, 1);

    await answerQuestion(
      ids.companyId,
      { userId: ids.userId, label: "estimator" },
      { questionId: question.id, answer: "Rough-in only; devices under 28.", broadcast: true },
    );

    const bQuestions = (await loadPortalView(b)).questions;
    assert.equal(bQuestions.length, 1);
    assert.equal(bQuestions[0].mine, false); // B sees it, but not that A asked
    assert.match(bQuestions[0].answerBody!, /Rough-in only/);

    const aQuestions = (await loadPortalView(a)).questions;
    assert.equal(aQuestions[0].mine, true);

    // The asker's identity is only ever on the GC side.
    assert.equal(rows[0].asker.name, "Fixture Electric A");
    assert.equal(JSON.stringify(bQuestions).includes("Fixture Electric A"), false);
  });
});

/**
 * The other thing worth a real database: a correction the estimator made once has to
 * apply itself on that sub's next project, and it must never be silent about it.
 */
describe("remembered mappings", { skip: hasDb ? false : "set DATABASE_URL to run" }, () => {
  it("auto-applies a correction on the sub's next project, and labels it", async () => {
    const db = getDb();
    const stamp = Date.now();
    const [company] = await db
      .insert(companies)
      .values({ name: `Mapping Fixture ${stamp}`, plan: "builder", settings: DEFAULT_SETTINGS })
      .returning();
    try {
      const [user] = await db
        .insert(users)
        .values({
          companyId: company.id,
          email: `map-${stamp}@fixture.example`,
          passwordHash: await hashPassword("fixture-password"),
          role: "admin",
        })
        .returning();
      const actor = { userId: user.id, label: user.email };

      const [sub] = await db
        .insert(subCompanies)
        .values({ companyId: company.id, name: "Voss Electric", trades: ["26"], source: "manual" })
        .returning();
      const [contact] = await db
        .insert(subContacts)
        .values({
          companyId: company.id,
          subCompanyId: sub.id,
          name: "Hal",
          email: `hal-${stamp}@fixture.example`,
          isPrimary: true,
        })
        .returning();

      const makePackage = async (name: string) => {
        const project = await createProject(company.id, "builder", actor, {
          name,
          address: null,
          bidDueAt: new Date(Date.now() + 5 * 86_400_000),
          notes: null,
        });
        const pkg = await createPackage(company.id, project.id, actor, {
          csiDivision: "26",
          scopeNotes: null,
          seedForm: true,
        });
        const invite = await sendInvites(company.id, actor, {
          packageId: pkg.id,
          subContactIds: [contact.id],
          personalNote: null,
        });
        return { pkg, token: invite.links[0].url.split("/bid/")[1] };
      };

      /* --- first project: the sub invents a row, the estimator maps it --- */
      const first = await makePackage("Fixture Job One");
      const firstLines = await listFormLines(first.pkg.id);
      const tempPower = firstLines.find((l) => /Temporary power/.test(l.description))!;
      const ctx1 = await requirePortal(first.token);
      await submitPortalBid(ctx1, {
        kind: "itemized",
        lines: [
          { formLineId: tempPower.id, rawDescription: "", state: "priced", amount: "9,100" },
          {
            formLineId: null,
            rawDescription: "Temp power poles + meter base",
            state: "priced",
            amount: "4,200",
          },
        ],
        lumpSumAmount: null,
        inclusions: [],
        exclusions: [],
        notes: null,
      });

      const before = await loadLevelingPage(company.id, first.pkg.id);
      assert.equal(before!.grid.tray.length, 1);
      // A fresh sub gets a *suggestion*, never an automatic mapping.
      const suggestion = before!.suggestions.get(before!.grid.tray[0].bidLineId)!;
      assert.equal(suggestion.autoApply, false);
      assert.equal(suggestion.bidFormLineId, tempPower.id);

      await mapTrayLine({
        companyId: company.id,
        userId: user.id,
        tradePackageId: first.pkg.id,
        bidLineId: before!.grid.tray[0].bidLineId,
        bidFormLineId: tempPower.id,
        remember: true,
      });

      /* --- second project: the same wording maps itself --- */
      const second = await makePackage("Fixture Job Two");
      const secondLines = await listFormLines(second.pkg.id);
      const tempPower2 = secondLines.find((l) => /Temporary power/.test(l.description))!;
      const ctx2 = await requirePortal(second.token);
      await submitPortalBid(ctx2, {
        kind: "itemized",
        lines: [
          { formLineId: tempPower2.id, rawDescription: "", state: "priced", amount: "9,600" },
          {
            formLineId: null,
            rawDescription: "temp power poles + meter base",
            state: "priced",
            amount: "4,400",
          },
        ],
        lumpSumAmount: null,
        inclusions: [],
        exclusions: [],
        notes: null,
      });

      const after = await loadLevelingPage(company.id, second.pkg.id);
      assert.equal(after!.grid.tray.length, 0, "the remembered row mapped itself");
      // And it is labelled, not silent: the page lists it as mapped from memory, undoable.
      assert.equal(after!.remembered.length, 1);
      assert.equal(after!.remembered[0].formLineDescription, tempPower2.description);
      assert.match(after!.remembered[0].rawDescription, /temp power poles/i);

      // The cell sums both rows, and the sub's total is unchanged by the mapping.
      const column = after!.grid.columns[0];
      assert.equal(column.baseCents, 960_000 + 440_000);
      const row = after!.grid.rows.find((r) => r.formLine.id === tempPower2.id)!;
      assert.equal(row.cells[0].amountCents, 960_000 + 440_000);
      assert.equal(row.cells[0].lineCount, 2);
    } finally {
      await db.delete(companies).where(eq(companies.id, company.id));
      await closeDb();
    }
  });
});
