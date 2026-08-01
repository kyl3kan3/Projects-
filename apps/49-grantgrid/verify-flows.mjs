/**
 * The remaining ROADMAP acceptance criteria, exercised against the real database
 * and the running server. Throwaway; the reusable assertions live in src/lib.
 */
process.env.DRY_RUN = "1";

const { getDb, closeDb } = await import("./src/db/index.ts");
const schema = await import("./src/db/schema.ts");
const { eq, inArray } = await import("drizzle-orm");
const { hashPassword } = await import("./src/lib/auth.ts");
const { createGrant, addDeadline } = await import("./src/lib/grants.ts");
const { ensureChecklist, linkAnswer, listWorkspace } = await import("./src/lib/workspace.ts");
const { searchFunders } = await import("./src/lib/discovery.ts");
const { causeLabel } = await import("./src/lib/fit-score.ts");
const { staleness, stalenessLabel } = await import("./src/lib/answers.ts");
const { hashIcsToken, newIcsToken } = await import("./src/lib/ics.ts");
const { checkGrantCap } = await import("./src/lib/plans.ts");
const { entitlement } = await import("./src/lib/billing.ts");

const db = getDb();
const stamp = Date.now();
let failures = 0;
const createdOrgs = [];
const createdUsers = [];

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`);
}

let orgSeq = 0;

async function makeOrg(plan, opts = {}) {
  orgSeq++;
  const [org] = await db
    .insert(schema.organizations)
    .values({
      name: `Flow ${plan} ${stamp}-${orgSeq}`,
      plan,
      subscriptionStatus: opts.status ?? "active",
      timezone: "America/New_York",
      profile: opts.profile ?? schema.EMPTY_PROFILE,
      profileVersion: 1,
    })
    .returning();
  const [user] = await db
    .insert(schema.users)
    .values({
      email: `flow-${stamp}-${orgSeq}-${plan}@example.org`,
      name: "Flow tester",
      passwordHash: await hashPassword("flow-test-password"),
    })
    .returning();
  await db
    .insert(schema.memberships)
    .values({ organizationId: org.id, userId: user.id, role: "owner" });
  createdOrgs.push(org.id);
  createdUsers.push(user.email);
  return { org, user };
}

try {
  /* ---- 1. Seed's 25-grant cap blocks the 26th and touches nothing ---- */
  const seed = await makeOrg("seed");
  for (let i = 0; i < 25; i++) {
    const result = await createGrant(seed.org, {
      organizationId: seed.org.id,
      title: `Request ${i + 1}`,
      funderName: `Sample Funder ${i + 1}`,
      askAmountCents: 500_000,
      ownerUserId: seed.user.id,
      actor: "Flow tester",
    });
    if ("error" in result) throw new Error(`unexpected refusal at ${i}: ${result.error}`);
  }
  const twentySixth = await createGrant(seed.org, {
    organizationId: seed.org.id,
    title: "Request 26",
    funderName: "Sample Funder 26",
    actor: "Flow tester",
  });
  const stillThere = await db
    .select()
    .from(schema.grants)
    .where(eq(schema.grants.organizationId, seed.org.id));
  check("the 26th add is refused on Seed", "error" in twentySixth, true);
  check("and the 25 already there are untouched", stillThere.length, 25);
  check(
    "the refusal explains itself without threatening the data",
    /Nothing has been removed/.test(twentySixth.error ?? ""),
    true,
  );

  // Same org, upgraded: the add goes through, still nothing lost.
  await db
    .update(schema.organizations)
    .set({ plan: "grow" })
    .where(eq(schema.organizations.id, seed.org.id));
  const [upgraded] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.id, seed.org.id));
  const afterUpgrade = await createGrant(upgraded, {
    organizationId: upgraded.id,
    title: "Request 26",
    funderName: "Sample Funder 26",
    actor: "Flow tester",
  });
  check("Grow accepts the 26th", "grant" in afterUpgrade, true);
  check("the cap check agrees", checkGrantCap("grow", 26).allowed, true);

  /* ---- 2. linking an answer snapshots it ---- */
  const ws = await makeOrg("grow");
  const [answer] = await db
    .insert(schema.answers)
    .values({
      organizationId: ws.org.id,
      kind: "mission_long",
      title: "Mission (long)",
      body: "ORIGINAL: Riverside Youth Collective serves 240 students in Cuyahoga County.",
      version: 4,
      lastReviewedAt: new Date(),
    })
    .returning();
  const grantResult = await createGrant(ws.org, {
    organizationId: ws.org.id,
    title: "Snapshot test",
    funderName: "Sample Snapshot Foundation",
    actor: "Flow tester",
  });
  const grant = grantResult.grant;
  await ensureChecklist(ws.org.id, grant.id);
  const before = await listWorkspace(ws.org.id, grant.id);
  await linkAnswer(ws.org.id, before[0].item.id, answer.id, "Flow tester");

  const linked = (await listWorkspace(ws.org.id, grant.id))[0];
  check("the draft holds a copy of the block", linked.item.draftBody, answer.body);
  check("with a breadcrumb naming the version", linked.item.answerSource, "Mission (long) · V4");

  // Now rewrite the library block, exactly as someone polishing it would.
  await db
    .update(schema.answers)
    .set({ body: "REWRITTEN: a completely different mission statement.", version: 5 })
    .where(eq(schema.answers.id, answer.id));
  const afterEdit = (await listWorkspace(ws.org.id, grant.id))[0];
  check(
    "editing the library does NOT rewrite the submitted draft",
    afterEdit.item.draftBody,
    "ORIGINAL: Riverside Youth Collective serves 240 students in Cuyahoga County.",
  );
  check(
    "and the breadcrumb still names the version that was sent",
    afterEdit.item.answerSource,
    "Mission (long) · V4",
  );

  /* ---- 3. staleness flags ---- */
  const now = new Date();
  const old = new Date(now.getTime() - 400 * 86_400_000);
  await db
    .insert(schema.answers)
    .values({
      organizationId: ws.org.id,
      kind: "board_list",
      title: "Board of directors",
      body: "Chair, treasurer, secretary and four members.",
      lastReviewedAt: old,
      updatedAt: old,
    });
  const blocks = await db
    .select()
    .from(schema.answers)
    .where(eq(schema.answers.organizationId, ws.org.id));
  const boardBlock = blocks.find((b) => b.kind === "board_list");
  check("a block unreviewed for 400 days is stale", staleness(boardBlock, now), "stale");
  check(
    "and the label says how long it has been",
    /REVIEWED 1[23] MO AGO/.test(stalenessLabel(boardBlock, now)),
    true,
  );

  /* ---- 4. a thin profile produces no scores at all ---- */
  const thin = await makeOrg("grow");
  const thinResults = await searchFunders(
    thin.org.id,
    {
      mission: "",
      serviceStates: [],
      causeCodes: [],
      typicalAskCents: null,
      budgetBand: "",
    },
    1,
    { state: null, cause: null, minSizeCents: null, query: null },
    causeLabel,
  );
  check("discovery still lists funders for a thin profile", thinResults.length > 0, true);
  check(
    "but not one of them carries a score",
    thinResults.every((r) => r.score === null),
    true,
  );

  /* ---- 5. a complete profile scores, with reasons on every factor ---- */
  const full = await makeOrg("grow", {
    profile: {
      mission: "After-school tutoring in Cuyahoga County.",
      programs: "Tutoring, summer camp",
      budgetBand: "100k_500k",
      serviceStates: ["OH"],
      causeCodes: ["youth", "education"],
      ein: "34-1234567",
      typicalAskCents: 1_000_000,
    },
  });
  const scored = await searchFunders(
    full.org.id,
    {
      mission: "After-school tutoring in Cuyahoga County.",
      serviceStates: ["OH"],
      causeCodes: ["youth", "education"],
      typicalAskCents: 1_000_000,
      budgetBand: "100k_500k",
    },
    1,
    { state: null, cause: null, minSizeCents: null, query: null },
    causeLabel,
  );
  check("every funder now has a score", scored.every((r) => r.score !== null), true);
  check(
    "and every score carries five reasoned factors",
    scored.every(
      (r) => r.score.factors.length === 5 && r.score.factors.every((f) => f.reason.length > 20),
    ),
    true,
  );
  check(
    "best fit first",
    scored[0].score.total >= scored[scored.length - 1].score.total,
    true,
  );
  check(
    "only approved records appear",
    scored.every((r) => r.funder.curationStatus === "approved"),
    true,
  );
  check(
    "and every shipped record is marked as sample data",
    scored.every((r) => r.funder.isSample === true),
    true,
  );

  /* ---- 6. discovery filters actually filter ---- */
  const ohOnly = await searchFunders(
    full.org.id,
    {
      mission: "x",
      serviceStates: ["OH"],
      causeCodes: ["youth"],
      typicalAskCents: 1_000_000,
      budgetBand: "100k_500k",
    },
    1,
    { state: "MI", cause: null, minSizeCents: null, query: null },
    causeLabel,
  );
  check(
    "a state filter keeps only funders giving there (or nationally)",
    ohOnly.every((r) => r.funder.statesFunded.includes("MI") || r.funder.statesFunded.includes("US")),
    true,
  );
  const bigOnly = await searchFunders(
    full.org.id,
    {
      mission: "x",
      serviceStates: ["OH"],
      causeCodes: ["youth"],
      typicalAskCents: 1_000_000,
      budgetBand: "100k_500k",
    },
    1,
    { state: null, cause: null, minSizeCents: 10_000_000, query: null },
    causeLabel,
  );
  check(
    "a size filter keeps only funders whose top range clears it",
    bigOnly.every((r) => (r.funder.grantSizeMaxCents ?? 0) >= 10_000_000),
    true,
  );

  /* ---- 7. the ICS feed, and rotation killing the old URL ---- */
  const feedOrg = await makeOrg("grow");
  await addDeadline(
    feedOrg.org.id,
    (
      await createGrant(feedOrg.org, {
        organizationId: feedOrg.org.id,
        title: "Feed test",
        funderName: "Sample Feed Foundation",
        actor: "Flow tester",
      })
    ).grant.id,
    { kind: "report", dueOn: "2027-03-01" },
    "Flow tester",
  );

  const secret = process.env.ICS_TOKEN_SECRET || process.env.AUTH_SECRET;
  const firstToken = newIcsToken();
  await db
    .update(schema.organizations)
    .set({ icsTokenHash: hashIcsToken(firstToken, secret) })
    .where(eq(schema.organizations.id, feedOrg.org.id));

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3049";
  const firstResponse = await fetch(`${base}/api/calendar/${firstToken}/grantgrid.ics`);
  const feedBody = await firstResponse.text();
  check("the feed serves 200", firstResponse.status, 200);
  check(
    "as text/calendar",
    firstResponse.headers.get("content-type"),
    "text/calendar; charset=utf-8",
  );
  check("with the report as an all-day event", /DTSTART;VALUE=DATE:20270301/.test(feedBody), true);
  check("and no timestamped DTSTART", /DTSTART:\d{8}T/.test(feedBody), false);

  const etag = firstResponse.headers.get("etag");
  const cached = await fetch(`${base}/api/calendar/${firstToken}/grantgrid.ics`, {
    headers: { "if-none-match": etag },
  });
  check("an unchanged feed answers a poller with 304", cached.status, 304);

  const secondToken = newIcsToken();
  await db
    .update(schema.organizations)
    .set({ icsTokenHash: hashIcsToken(secondToken, secret) })
    .where(eq(schema.organizations.id, feedOrg.org.id));
  const oldUrl = await fetch(`${base}/api/calendar/${firstToken}/grantgrid.ics`);
  const newUrl = await fetch(`${base}/api/calendar/${secondToken}/grantgrid.ics`);
  check("rotating the token 404s the old URL immediately", oldUrl.status, 404);
  check("and the new URL works", newUrl.status, 200);

  /* ---- 8. entitlement is derived as-of-now, not read from a stale column ---- */
  const [expiredOrg] = await db
    .insert(schema.organizations)
    .values({
      name: `Flow expired ${stamp}`,
      plan: "field",
      subscriptionStatus: "trialing",
      trialEndsAt: new Date(Date.now() - 60_000),
      timezone: "America/New_York",
    })
    .returning();
  createdOrgs.push(expiredOrg.id);
  check(
    "a trial that ended a minute ago is already Seed on screen",
    entitlement(expiredOrg).plan,
    "seed",
  );
  check("even though the column still says field", expiredOrg.plan, "field");

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
} finally {
  if (createdOrgs.length) {
    await db
      .delete(schema.organizations)
      .where(inArray(schema.organizations.id, createdOrgs));
  }
  if (createdUsers.length) {
    await db.delete(schema.users).where(inArray(schema.users.email, createdUsers));
  }
  await closeDb();
}

process.exit(failures === 0 ? 0 : 1);
