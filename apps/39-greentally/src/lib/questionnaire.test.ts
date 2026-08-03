import test from "node:test";
import assert from "node:assert/strict";
import { TEMPLATES, fullAnswerText, tagFor, templatesFor } from "./questionnaire";
import type { ReportContext } from "./report";
import type { Organization, QuestionnaireAnswer, ReportingPeriod, Site } from "@/db/schema";

/* A context shaped like a real 42-person machine shop's first inventory. */
function ctx(over: Partial<ReportContext> = {}): ReportContext {
  const org = {
    id: "org-1",
    name: "Meserole Precision LLC",
    plan: "standard",
    billingInterval: "year",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    industryCode: "332710",
    industryLabel: "Machine shops",
    annualRevenueCents: 420_000_000,
    fteCount: 42,
    reportingCurrency: "USD",
    settings: {
      contactName: "Dana Whitfield",
      contactEmail: "dana@meseroleprecision.com",
      reportWordmark: "",
      frameworks: ["cdp_style"],
      spendMapping: null,
    },
    onboardedAt: new Date("2026-01-04T00:00:00Z"),
    createdAt: new Date("2026-01-02T00:00:00Z"),
    updatedAt: new Date("2026-01-04T00:00:00Z"),
  } as unknown as Organization;

  const period = {
    id: "period-1",
    organizationId: "org-1",
    year: 2025,
    status: "review",
    lockedAt: null,
    snapshot: null,
    snapshotAt: null,
    createdAt: new Date("2026-01-02T00:00:00Z"),
  } as unknown as ReportingPeriod;

  const site = {
    id: "site-1",
    organizationId: "org-1",
    name: "Brooklyn shop",
    address: "118 Meserole Ave, Brooklyn NY 11222",
    country: "US",
    gridRegion: "NYCW",
    floorAreaSqm: 1_450,
    marketMethod: "renewable_contract",
    renewableSharePct: 35,
    contractNote: "Con Edison Solutions 35% renewable supply agreement (2025)",
    createdAt: new Date("2026-01-04T00:00:00Z"),
  } as unknown as Site;

  return {
    org,
    period,
    sites: [site],
    totals: {
      scope1: 22_100_000,
      scope2Location: 63_900_000,
      scope2Market: 41_535_000,
      scope3Spend: 42_400_000,
      totalMarket: 106_035_000,
      totalLocation: 128_400_000,
    },
    intensityPerRevenueMilli: 25_246,
    intensityPerFteMilli: 2_525,
    coverage: {
      months: [],
      monthsComplete: 11,
      monthsPartial: 1,
      monthsWithData: 12,
      sources: [
        { siteId: "site-1", category: "electricity_kwh" },
        { siteId: "site-1", category: "natural_gas_kwh" },
      ],
      pct: 96,
    },
    rows: [
      {
        scope: "1",
        category: "natural_gas_kwh",
        label: "Natural gas",
        gco2e: 22_100_000,
        quantityMilli: 121_950_000,
        unit: "kWh",
        factorLabel: "EPA natural gas",
        factorCitation: "US EPA (2025) Table 1, 53.11 kgCO2e/mmBtu",
        factorVintage: "2025",
        factorMicro: 181_218,
      },
      {
        scope: "2_location",
        category: "electricity_kwh",
        label: "Purchased electricity",
        gco2e: 63_900_000,
        quantityMilli: 192_100_000,
        unit: "kWh",
        factorLabel: "eGRID NYCW",
        factorCitation: "US EPA eGRID2022 NYCW 733 lb/MWh",
        factorVintage: "eGRID2022 (published 2024)",
        factorMicro: 332_500,
      },
    ],
    siteRows: [
      {
        siteId: "site-1",
        name: "Brooklyn shop",
        country: "US",
        gridRegion: "NYCW",
        marketMethod: "renewable_contract",
        renewableSharePct: 35,
        contractNote: "Con Edison Solutions 35% renewable supply agreement (2025)",
        gco2e: 63_635_000,
      },
    ],
    energy: [
      { category: "electricity_kwh", label: "Purchased electricity", quantityMilli: 192_100_000, unit: "kWh" },
      { category: "natural_gas_kwh", label: "Natural gas", quantityMilli: 121_950_000, unit: "kWh" },
    ],
    scope3Top: [
      { category: "iron_steel", label: "Iron & steel mill products", gco2e: 28_100_000, cents: 151_891_00 },
      { category: "freight_trucking", label: "Freight & trucking", gco2e: 9_200_000, cents: 10_697_00 },
    ],
    factorsUsed: [
      { label: "EPA natural gas", citation: "US EPA (2025) Table 1", vintage: "2025" },
      { label: "eGRID NYCW", citation: "US EPA eGRID2022 NYCW", vintage: "eGRID2022 (published 2024)" },
    ],
    documentCount: 26,
    activityLineCount: 24,
    spend: {
      rows: 984,
      includedRows: 712,
      excludedRows: 198,
      unclassifiedRows: 74,
      includedCents: 214_880_00,
      excludedCents: 88_120_00,
      byReason: [{ reason: "Payroll", rows: 24, cents: 62_000_00 }],
    },
    engineVersion: "1.0.0",
    generatedAt: new Date("2026-02-01T10:00:00Z"),
    caveats: [],
    ...over,
  };
}

test("the bank offers at least 20 mapped answers across the two frameworks", () => {
  assert.ok(TEMPLATES.length >= 20, `expected >= 20 templates, found ${TEMPLATES.length}`);
  assert.ok(templatesFor("cdp_style").length >= 12);
  assert.ok(templatesFor("ecovadis_style").length >= 8);
  assert.equal(templatesFor("custom").length, TEMPLATES.length);
});

test("every template has a unique key inside its framework and a tag", () => {
  const seen = new Set<string>();
  for (const tpl of TEMPLATES) {
    const id = `${tpl.framework}|${tpl.key}`;
    assert.equal(seen.has(id), false, `duplicate template ${id}`);
    seen.add(id);
    assert.match(tpl.tag, /STYLE/);
    assert.ok(tpl.question.endsWith("?") || tpl.question.endsWith("."), tpl.key);
  }
});

test("every template renders text and at least one answer carries source refs", () => {
  const c = ctx();
  let withRefs = 0;
  for (const tpl of TEMPLATES) {
    const { text, refs } = tpl.render(c);
    assert.ok(text.length > 60, `${tpl.key} produced a stub`);
    assert.equal(text.includes("undefined"), false, `${tpl.key} interpolated undefined`);
    assert.equal(text.includes("NaN"), false, `${tpl.key} interpolated NaN`);
    if (refs.length > 0) withRefs += 1;
  }
  assert.ok(withRefs >= TEMPLATES.length - 6, "most answers must carry provenance");
});

test("the Scope 1 answer states the computed figure, not a placeholder", () => {
  const a = TEMPLATES.find((tpl) => tpl.key === "c6_1_scope1")!.render(ctx());
  assert.match(a.text, /22\.1 tCO2e/);
  assert.ok(a.refs.some((r) => r.kind === "figure" && /22\.1/.test(r.detail)));
});

test("both Scope 2 methods appear, and market-based is the lower one here", () => {
  const a = TEMPLATES.find((tpl) => tpl.key === "c6_3_scope2")!.render(ctx());
  assert.match(a.text, /Location-based: 63\.9 tCO2e/);
  assert.match(a.text, /Market-based: 41\.5 tCO2e/);
});

test("the Scope 3 answer labels itself a screening estimate", () => {
  const a = TEMPLATES.find((tpl) => tpl.key === "c6_5_scope3")!.render(ctx());
  assert.match(a.text, /screening estimate/i);
  assert.match(a.text, /order of magnitude/i);
});

test("with no spend data the Scope 3 answer says unmeasured, not zero", () => {
  const c = ctx({
    totals: {
      scope1: 22_100_000,
      scope2Location: 63_900_000,
      scope2Market: 41_535_000,
      scope3Spend: 0,
      totalMarket: 63_635_000,
      totalLocation: 86_000_000,
    },
    scope3Top: [],
  });
  const a = TEMPLATES.find((tpl) => tpl.key === "c6_5_scope3")!.render(c);
  assert.match(a.text, /unmeasured rather than zero/i);
});

test("the assurance answer never claims verification", () => {
  for (const key of ["c10_1_verification", "env_verification"]) {
    const a = TEMPLATES.find((tpl) => tpl.key === key)!.render(ctx());
    assert.match(a.text, /\bnot\b|\bNo\b/);
    assert.equal(/is verified|has been verified|independently assured/i.test(a.text), false);
  }
});

test("a renewable contract is reflected in market-based Scope 2 only, and the answer says so", () => {
  const a = TEMPLATES.find((tpl) => tpl.key === "env_renewable")!.render(ctx());
  assert.match(a.text, /35%/);
  assert.match(a.text, /location-based figure is unchanged/i);
});

test("with no contract the renewable answer claims zero percent", () => {
  const c = ctx({
    siteRows: [
      {
        siteId: "site-1",
        name: "Brooklyn shop",
        country: "US",
        gridRegion: "NYCW",
        marketMethod: "residual_mix",
        renewableSharePct: 0,
        contractNote: "",
        gco2e: 63_635_000,
      },
    ],
  });
  const a = TEMPLATES.find((tpl) => tpl.key === "env_renewable")!.render(c);
  assert.match(a.text, /0% of purchased electricity/);
});

test("missing intensity denominators produce an honest sentence, not 'NaN tCO2e'", () => {
  const c = ctx({ intensityPerRevenueMilli: 0, intensityPerFteMilli: 0 });
  const a = TEMPLATES.find((tpl) => tpl.key === "c6_10_intensity")!.render(c);
  assert.match(a.text, /unavailable/i);
  assert.equal(a.text.includes("NaN"), false);
});

test("an empty inventory still renders every answer without crashing", () => {
  const empty = ctx({
    sites: [],
    siteRows: [],
    rows: [],
    energy: [],
    scope3Top: [],
    factorsUsed: [],
    documentCount: 0,
    activityLineCount: 0,
    totals: {
      scope1: 0,
      scope2Location: 0,
      scope2Market: 0,
      scope3Spend: 0,
      totalMarket: 0,
      totalLocation: 0,
    },
    coverage: { months: [], monthsComplete: 0, monthsPartial: 0, monthsWithData: 0, sources: [], pct: 0 },
    spend: { rows: 0, includedRows: 0, excludedRows: 0, unclassifiedRows: 0, includedCents: 0, excludedCents: 0, byReason: [] },
  });
  for (const tpl of TEMPLATES) {
    const { text } = tpl.render(empty);
    assert.ok(text.length > 20, tpl.key);
    assert.equal(text.includes("NaN"), false, tpl.key);
    assert.equal(text.includes("undefined"), false, tpl.key);
  }
});

test("tone notes append to the generated answer and never replace it", () => {
  const answer = {
    answerText: "Scope 1: 22.1 tCO2e.",
    toneNote: "Our Brooklyn shop runs a second shift from March to October.",
  } as unknown as QuestionnaireAnswer;
  const full = fullAnswerText(answer);
  assert.match(full, /^Scope 1: 22\.1 tCO2e\./);
  assert.match(full, /second shift/);
  assert.equal(
    fullAnswerText({ answerText: "Scope 1: 22.1 tCO2e.", toneNote: "  " } as unknown as QuestionnaireAnswer),
    "Scope 1: 22.1 tCO2e.",
  );
});

test("tags resolve per framework", () => {
  assert.equal(tagFor("cdp_style", "c6_1_scope1"), "CDP-STYLE C6.1");
  assert.equal(tagFor("ecovadis_style", "env_policy"), "ECOVADIS-STYLE ENV 1.1");
  assert.equal(tagFor("cdp_style", "nope"), "CUSTOM");
});
