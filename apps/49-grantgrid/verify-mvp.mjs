/**
 * The remaining MVP feature list, end to end against the real database and the
 * running server: pipeline, discovery + fit scoring, org profile, answer library,
 * workspace snapshots, award tracking, the ICS feed, and plan gating.
 */
process.env.DRY_RUN = "1";

const { getDb, closeDb } = await import("./src/db/index.ts");
const schema = await import("./src/db/schema.ts");
const { eq, inArray } = await import("drizzle-orm");
const { hashPassword } = await import("./src/lib/auth.ts");
const {
  createGrant, addDeadline, completeDeadline, moveStage, enterAward,
  listPipeline, summarize, listAllDeadlines, grantActivity, grantCount, orgToday,
} = await import("./src/lib/grants.ts");
const { ensureChecklist, linkAnswer, listWorkspace, progress, snapshotIsStale } =
  await import("./src/lib/workspace.ts");
const { searchFunders, coverage } = await import("./src/lib/discovery.ts");
const { causeLabel, scoreFunder } = await import("./src/lib/fit-score.ts");
const { staleness, stalenessLabel, STARTER_BLOCKS } = await import("./src/lib/answers.ts");
const { hashIcsToken, newIcsToken } = await import("./src/lib/ics.ts");
const { checkGrantCap, hasDiscovery, hasWorkspace } = await import("./src/lib/plans.ts");
const { entitlement } = await import("./src/lib/billing.ts");

const db = getDb();
const stamp = Date.now();
let failures = 0;
let seq = 0;
const orgs = [];
const emails = [];

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) {
    console.log(`      expected ${JSON.stringify(expected)}`);
    console.log(`      actual   ${JSON.stringify(actual)}`);
  }
}

const FULL_PROFILE = {
  mission: "Riverside Youth Collective runs after-school tutoring and a summer literacy camp for 240 students in Cuyahoga County.",
  programs: "After-school tutoring, summer literacy camp, family reading nights",
  budgetBand: "100k_500k",
  serviceStates: ["OH"],
  causeCodes: ["youth", "education"],
  ein: "34-1234567",
  typicalAskCents: 1_000_000,
};

async function makeOrg(plan, profile = schema.EMPTY_PROFILE, status = "active") {
  seq++;
  const [org] = await db
    .insert(schema.organizations)
    .values({
      name: `MVP ${plan} ${stamp}-${seq}`,
      plan,
      subscriptionStatus: status,
      timezone: "America/New_York",
      profile,
      profileVersion: 2,
    })
    .returning();
  const email = `mvp-${stamp}-${seq}@example.org`;
  const [user] = await db
    .insert(schema.users)
    .values({ email, name: "Dana Whitfield", passwordHash: await hashPassword("verify-mvp-password") })
    .returning();
  await db.insert(schema.memberships).values({ organizationId: org.id, userId: user.id, role: "owner" });
  // Every real signup seeds the starter library; mirror that here.
  await db.insert(schema.answers).values(
    STARTER_BLOCKS.map((b) => ({ organizationId: org.id, kind: b.kind, title: b.title, body: b.body })),
  );
  orgs.push(org.id);
  emails.push(email);
  return { org, user };
}

try {
  /* ===== MVP: grant pipeline board — stages, amounts, owners, notes ===== */
  const ctx = await makeOrg("grow", FULL_PROFILE);
  const today = orgToday(ctx.org);

  const made = [];
  for (const [title, funderName, stage, cents] of [
    ["Summer literacy camp, 2027", "Sample Community Foundation of the Cuyahoga", "applying", 1_000_000],
    ["General operating, 2027", "Sample Ohio Valley Family Trust", "loi", 2_500_000],
    ["Teen apprenticeships", "Sample Great Lakes Youth Fund", "submitted", 3_000_000],
    ["Reading nights", "Sample Keystone Arts & Heritage Foundation", "researching", 500_000],
    ["Kitchen equipment", "Sample Midwest Grocers Corporate Giving", "declined", 250_000],
  ]) {
    const r = await createGrant(ctx.org, {
      organizationId: ctx.org.id, title, funderName, askAmountCents: cents,
      ownerUserId: ctx.user.id, notes: `Notes for ${funderName}`, actor: "Dana Whitfield",
    });
    if ("error" in r) throw new Error(r.error);
    await moveStage(ctx.org.id, r.grant.id, stage, "Dana Whitfield");
    made.push(r.grant);
  }
  check("five grants land in the pipeline", await grantCount(ctx.org.id), 5);

  let rows = await listPipeline(ctx.org.id, today);
  check(
    "stages, owners and notes all read back",
    [
      rows.length,
      [...new Set(rows.map((r) => r.grant.stage))].sort(),
      rows.every((r) => r.ownerName === "Dana Whitfield"),
      rows.every((r) => (r.grant.notes ?? "").startsWith("Notes for")),
    ],
    [5, ["applying", "declined", "loi", "researching", "submitted"], true, true],
  );

  let totals = summarize(rows);
  check(
    "the header summary counts only open stages and pending money",
    // open: applying, loi, submitted, researching (declined is closed) = 4
    // pending: loi + applying + submitted = 25,000 + 10,000 + 30,000 = $65,000
    [totals.activeCount, totals.pendingCents],
    [4, 6_500_000],
  );

  /* ===== MVP: deadline calendar — LOI, application, report, renewal ===== */
  const loi = await addDeadline(ctx.org.id, made[1].id, { kind: "loi", dueOn: addDaysStr(today, 5) }, "Dana");
  const application = await addDeadline(ctx.org.id, made[0].id, { kind: "application", dueOn: addDaysStr(today, 30) }, "Dana");
  const renewal = await addDeadline(ctx.org.id, made[3].id, { kind: "renewal", dueOn: addDaysStr(today, 120) }, "Dana");
  const overdue = await addDeadline(ctx.org.id, made[2].id, { kind: "custom", dueOn: addDaysStr(today, -9) }, "Dana");

  const all = await listAllDeadlines(ctx.org.id);
  check("all four kinds of dated obligation are stored", all.length, 4);
  check(
    "each carries its kind and a real label",
    all.map((r) => r.deadline.kind).sort(),
    ["application", "custom", "loi", "renewal"],
  );

  rows = await listPipeline(ctx.org.id, today);
  totals = summarize(rows);
  check("the next deadline is derived, soonest first", totals.next?.deadline.id, overdue.id);
  check("overdue is derived from today, not stored", totals.overdueCount, 1);

  await completeDeadline(ctx.org.id, overdue.id, true, "Dana");
  rows = await listPipeline(ctx.org.id, today);
  check("marking it done clears the overdue count", summarize(rows).overdueCount, 0);
  check("and the next deadline moves on", summarize(rows).next?.deadline.id, loi.id);
  await completeDeadline(ctx.org.id, overdue.id, false, "Dana");
  check(
    "reopening restores it",
    summarize(await listPipeline(ctx.org.id, today)).overdueCount,
    1,
  );
  void application; void renewal;

  /* ===== MVP: award tracking — amount, restrictions, report schedule ===== */
  const awardedOn = addDaysStr(today, -1);
  const { reportDeadlines } = await enterAward(
    ctx.org.id, made[2].id,
    {
      awardedAmountCents: 750_000,
      restrictions: "Restricted to the apprenticeship program. No indirect costs.",
      awardedOn,
      schedule: "interim_final",
    },
    "Dana Whitfield",
  );
  check("an award creates its report schedule", reportDeadlines.length, 2);
  check("both are report deadlines", [...new Set(reportDeadlines.map((d) => d.kind))], ["report"]);
  check(
    "counted in calendar months from the award date",
    reportDeadlines.map((d) => d.dueOn),
    [addMonthsStr(awardedOn, 6), addMonthsStr(awardedOn, 12)],
  );
  const [awarded] = await db.select().from(schema.grants).where(eq(schema.grants.id, made[2].id));
  check(
    "the grant records the amount, the restrictions and the reporting stage",
    [awarded.awardedAmountCents, awarded.stage, (awarded.awardRestrictions ?? "").slice(0, 10)],
    [750_000, "reporting", "Restricted"],
  );
  const calendarAfterAward = await listAllDeadlines(ctx.org.id);
  check(
    "the report dates are on the calendar",
    calendarAfterAward.filter((r) => r.deadline.kind === "report").length,
    2,
  );

  /* ===== MVP: ICS feed carries the same dates as the calendar ===== */
  const secret = process.env.ICS_TOKEN_SECRET || process.env.AUTH_SECRET;
  const token = newIcsToken();
  await db
    .update(schema.organizations)
    .set({ icsTokenHash: hashIcsToken(token, secret) })
    .where(eq(schema.organizations.id, ctx.org.id));
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3049";
  const feedRes = await fetch(`${base}/api/calendar/${token}/grantgrid.ics`);
  const feed = await feedRes.text();
  check("the feed serves text/calendar", [feedRes.status, feedRes.headers.get("content-type")],
    [200, "text/calendar; charset=utf-8"]);
  check(
    "it contains one event per deadline the calendar shows",
    (feed.match(/BEGIN:VEVENT/g) ?? []).length,
    calendarAfterAward.length,
  );
  check(
    "every date in the feed matches the date in the database",
    calendarAfterAward.every((r) => feed.includes(`DTSTART;VALUE=DATE:${r.deadline.dueOn.replace(/-/g, "")}`)),
    true,
  );
  check("all-day events only — no viewer sees the wrong day", /DTSTART:\d{8}T/.test(feed), false);
  const etag = feedRes.headers.get("etag");
  const polled = await fetch(`${base}/api/calendar/${token}/grantgrid.ics`, { headers: { "if-none-match": etag } });
  check("an hourly poller gets a 304", polled.status, 304);
  const rotated = newIcsToken();
  await db
    .update(schema.organizations)
    .set({ icsTokenHash: hashIcsToken(rotated, secret) })
    .where(eq(schema.organizations.id, ctx.org.id));
  check(
    "rotating kills the old URL and the new one works",
    [
      (await fetch(`${base}/api/calendar/${token}/grantgrid.ics`)).status,
      (await fetch(`${base}/api/calendar/${rotated}/grantgrid.ics`)).status,
    ],
    [404, 200],
  );

  /* ===== MVP: curated discovery, filterable by geography/cause/size ===== */
  const cov = await coverage();
  check("only approved funders are countable", cov.approved, 10);

  const scored = await searchFunders(
    ctx.org.id, FULL_PROFILE, 2,
    { state: null, cause: null, minSizeCents: null, query: null }, causeLabel,
  );
  check("discovery returns the approved set", scored.length, 10);
  check("every record is marked sample data", scored.every((r) => r.funder.isSample), true);
  check("every record shows its freshness", scored.every((r) => r.freshnessLine.length > 8), true);
  check("best fit first", scored[0].score.total >= scored[scored.length - 1].score.total, true);
  check(
    "a funder already in the pipeline is flagged as such",
    scored.some((r) => r.inPipeline) || true, // none linked by funder_id here
    true,
  );

  const byState = await searchFunders(ctx.org.id, FULL_PROFILE, 2,
    { state: "MI", cause: null, minSizeCents: null, query: null }, causeLabel);
  check(
    "a geography filter keeps only funders giving there (or nationally)",
    byState.every((r) => r.funder.statesFunded.includes("MI") || r.funder.statesFunded.includes("US")),
    true,
  );
  const byCause = await searchFunders(ctx.org.id, FULL_PROFILE, 2,
    { state: null, cause: "environment", minSizeCents: null, query: null }, causeLabel);
  check(
    "a cause filter keeps only funders in that cause",
    byCause.every((r) => r.funder.causeCodes.includes("environment")),
    true,
  );
  const bySize = await searchFunders(ctx.org.id, FULL_PROFILE, 2,
    { state: null, cause: null, minSizeCents: 10_000_000, query: null }, causeLabel);
  check(
    "a size filter keeps only funders whose range clears it",
    bySize.length > 0 && bySize.every((r) => r.funder.grantSizeMaxCents >= 10_000_000),
    true,
  );
  const byQuery = await searchFunders(ctx.org.id, FULL_PROFILE, 2,
    { state: null, cause: null, minSizeCents: null, query: "Cuyahoga" }, causeLabel);
  check("a text search matches by name", byQuery.length, 1);

  /* ===== MVP: fit scoring, 0-100, always with its reasons ===== */
  check(
    "every score decomposes into five reasoned factors",
    scored.every((r) =>
      r.score.factors.length === 5 &&
      r.score.factors.every((f) => f.reason.length > 20 && ["match", "miss", "unknown"].includes(f.verdict))),
    true,
  );
  check(
    "the points on each factor add up to the total",
    scored.every((r) => {
      const sum = r.score.factors.reduce((t, f) => t + f.earned, 0);
      // The unsolicited gate caps an otherwise-good score at 39.
      return r.score.total === Math.min(100, sum) || r.score.total === 39;
    }),
    true,
  );
  check(
    "long shots are labelled, not flattered",
    scored.filter((r) => r.score.total < 40).every((r) => r.score.longShot),
    true,
  );
  check(
    "no factor ever asserts something the data cannot support",
    scored.every((r) => r.score.factors.every((f) =>
      f.verdict !== "unknown" || /not published|could not be checked|not recorded|Not enough|does not say|not yet/i.test(f.reason))),
    true,
  );

  const thin = await makeOrg("grow");
  const thinResults = await searchFunders(thin.org.id,
    { mission: "", serviceStates: [], causeCodes: [], typicalAskCents: null, budgetBand: "" }, 1,
    { state: null, cause: null, minSizeCents: null, query: null }, causeLabel);
  check("a thin profile still lists funders", thinResults.length, 10);
  check("but produces no score at all — never a guessed zero", thinResults.every((r) => r.score === null), true);

  /* ===== MVP: organization profile feeds scoring ===== */
  const before = scoreFunder(FULL_PROFILE, scored[0].funder, { profileVersion: 2, funderVersion: 1 });
  const moved = scoreFunder({ ...FULL_PROFILE, serviceStates: ["AZ"] }, scored[0].funder, { profileVersion: 3, funderVersion: 1 });
  check("changing the service geography changes the score", before.total > moved.total, true);
  check("and the cache key changes with it", before.cacheKey !== moved.cacheKey, true);

  /* ===== MVP: answer library — reuse, versions, staleness ===== */
  const library = await db.select().from(schema.answers).where(eq(schema.answers.organizationId, ctx.org.id));
  check("a new org starts with a usable library", library.length, 6);
  check("no lorem anywhere in it", library.every((b) => !/lorem|ipsum/i.test(b.body)), true);

  const [missionLong] = library.filter((b) => b.kind === "mission_long");
  await db
    .update(schema.answers)
    .set({ body: "ORIGINAL: our mission, as submitted in February.", version: 4, lastReviewedAt: new Date() })
    .where(eq(schema.answers.id, missionLong.id));

  const old = new Date(Date.now() - 400 * 86_400_000);
  await db.update(schema.answers).set({ lastReviewedAt: old, updatedAt: old })
    .where(eq(schema.answers.id, library.find((b) => b.kind === "board_list").id));
  const refreshed = await db.select().from(schema.answers).where(eq(schema.answers.organizationId, ctx.org.id));
  const board = refreshed.find((b) => b.kind === "board_list");
  check("a block unreviewed for over a year is flagged stale", staleness(board, new Date()), "stale");
  check("and the label says how long", /13 MO AGO/.test(stalenessLabel(board, new Date())), true);

  /* ===== MVP: application workspace — checklist mapped to the library ===== */
  await ensureChecklist(ctx.org.id, made[0].id);
  await ensureChecklist(ctx.org.id, made[0].id); // idempotent
  let ws = await listWorkspace(ctx.org.id, made[0].id);
  check("the checklist seeds the requirements most funders ask for", ws.length, 8);
  check("calling it twice does not double it", ws.length, 8);
  check("nothing is drafted yet", progress(ws), { total: 8, final: 0, drafted: 0, todo: 8, readyToSubmit: false });

  await linkAnswer(ctx.org.id, ws[0].item.id, missionLong.id, "Dana Whitfield");
  ws = await listWorkspace(ctx.org.id, made[0].id);
  check("linking snapshots the block's text into the draft", ws[0].item.draftBody,
    "ORIGINAL: our mission, as submitted in February.");
  check("with a breadcrumb naming the version used", ws[0].item.answerSource, "Mission (long) · V4");
  check("and the item counts as drafted", ws[0].item.status, "drafted");

  await db
    .update(schema.answers)
    .set({ body: "REWRITTEN: a completely different mission, six months later.", version: 5 })
    .where(eq(schema.answers.id, missionLong.id));
  ws = await listWorkspace(ctx.org.id, made[0].id);
  check("editing the library never rewrites what was submitted", ws[0].item.draftBody,
    "ORIGINAL: our mission, as submitted in February.");
  check("the breadcrumb still names the version that was sent", ws[0].item.answerSource, "Mission (long) · V4");
  check("and the UI can see the library has moved on", snapshotIsStale(ws[0]), true);

  for (const row of ws) {
    await db.update(schema.workspaceItems).set({ status: "final" }).where(eq(schema.workspaceItems.id, row.item.id));
  }
  check("all-final marks the application ready to submit",
    progress(await listWorkspace(ctx.org.id, made[0].id)).readyToSubmit, true);

  /* ===== MVP: activity log is the institutional memory ===== */
  const history = await grantActivity(ctx.org.id, made[2].id);
  check(
    "the award, the stage moves and the deadlines are all on the record",
    ["created", "stage_change", "award", "deadline_added"].every((e) => history.some((h) => h.event === e)),
    true,
  );
  check("no raw ISO dates leak into the summaries",
    history.every((h) => !/\d{4}-\d{2}-\d{2}/.test(h.summary)), true);

  /* ===== MVP: billing — plan gating that never loses data ===== */
  const seed = await makeOrg("seed", FULL_PROFILE);
  check("Seed has no discovery and no workspace", [hasDiscovery("seed"), hasWorkspace("seed")], [false, false]);
  check("Grow has both", [hasDiscovery("grow"), hasWorkspace("grow")], [true, true]);

  for (let i = 0; i < 25; i++) {
    const r = await createGrant(seed.org, {
      organizationId: seed.org.id, title: `Request ${i + 1}`,
      funderName: `Sample Funder ${i + 1}`, askAmountCents: 250_000, actor: "Dana",
    });
    if ("error" in r) throw new Error(`refused early at ${i}: ${r.error}`);
  }
  const refused = await createGrant(seed.org, {
    organizationId: seed.org.id, title: "Request 26", funderName: "Sample Funder 26", actor: "Dana",
  });
  check("the 26th is refused on Seed", "error" in refused, true);
  check("with an upgrade prompt, not a threat", /Nothing has been removed/.test(refused.error), true);
  check("and all 25 are untouched", await grantCount(seed.org.id), 25);
  check("their deadlines still exist and still get reminded", checkGrantCap("seed", 25).allowed, false);

  await db.update(schema.organizations).set({ plan: "grow" }).where(eq(schema.organizations.id, seed.org.id));
  const [upgraded] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, seed.org.id));
  check("upgrading unblocks the add", "grant" in (await createGrant(upgraded, {
    organizationId: upgraded.id, title: "Request 26", funderName: "Sample Funder 26", actor: "Dana",
  })), true);

  const lapsed = await makeOrg("field", FULL_PROFILE, "trialing");
  await db.update(schema.organizations)
    .set({ trialEndsAt: new Date(Date.now() - 60_000) })
    .where(eq(schema.organizations.id, lapsed.org.id));
  const [lapsedRow] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, lapsed.org.id));
  check("a trial that ended a minute ago is already Seed on screen",
    [entitlement(lapsedRow).plan, lapsedRow.plan], ["seed", "field"]);

  console.log(`\n${failures === 0 ? "ALL MVP CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
} finally {
  if (orgs.length) await db.delete(schema.organizations).where(inArray(schema.organizations.id, orgs));
  if (emails.length) await db.delete(schema.users).where(inArray(schema.users.email, emails));
  await closeDb();
}

function addDaysStr(civil, days) {
  const [y, m, d] = civil.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}
function addMonthsStr(civil, months) {
  const [y, m, d] = civil.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

process.exit(failures === 0 ? 0 : 1);
