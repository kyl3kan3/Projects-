import test from "node:test";
import assert from "node:assert/strict";
import {
  computeResults,
  gramsFromActivity,
  gramsFromSpend,
  gridRegionFor,
  intensityPerFte,
  intensityPerRevenue,
  totalsOf,
  type EngineFactor,
  type EngineInput,
} from "./footprint";
import { computeCoverage, splitAcrossMonths } from "./coverage";

/* ------------------------------------------------------------------ fixtures */

const F = {
  egridRfcw: {
    id: "f-egrid-rfcw",
    factorSet: "egrid_2024",
    category: "electricity_kwh",
    region: "RFCW",
    unit: "kWh",
    kgco2ePerUnitMicro: 453_592,
    scope: "2_location",
    vintage: "eGRID2022 (published 2024)",
    citation: "eGRID2022 RFCW 1000 lb/MWh",
    label: "eGRID RFCW",
  },
  egridNyup: {
    id: "f-egrid-nyup",
    factorSet: "egrid_2024",
    category: "electricity_kwh",
    region: "NYUP",
    unit: "kWh",
    kgco2ePerUnitMicro: 113_398,
    scope: "2_location",
    vintage: "eGRID2022 (published 2024)",
    citation: "eGRID2022 NYUP 250 lb/MWh",
    label: "eGRID NYUP",
  },
  epaGas: {
    id: "f-epa-gas",
    factorSet: "epa_2025",
    category: "natural_gas_kwh",
    region: "US",
    unit: "kWh",
    kgco2ePerUnitMicro: 181_218,
    scope: "1",
    vintage: "2025",
    citation: "EPA 2025 natural gas",
    label: "EPA natural gas",
  },
  epaDiesel: {
    id: "f-epa-diesel",
    factorSet: "epa_2025",
    category: "diesel_l",
    region: "US",
    unit: "L",
    kgco2ePerUnitMicro: 2_705_046,
    scope: "1",
    vintage: "2025",
    citation: "EPA 2025 distillate No. 2",
    label: "EPA diesel",
  },
  contractual: {
    id: "f-contract",
    factorSet: "contractual",
    category: "electricity_kwh",
    region: "GLOBAL",
    unit: "kWh",
    kgco2ePerUnitMicro: 0,
    scope: "2_market",
    vintage: "n/a",
    citation: "GHG Protocol Scope 2 market-based",
    label: "Contractual instrument",
  },
  eeioFreight: {
    id: "f-eeio-freight",
    factorSet: "useeio_v2",
    category: "freight_trucking",
    region: "US",
    unit: "USD",
    kgco2ePerUnitMicro: 860_000,
    scope: "3_spend",
    vintage: "USEEIO v2.0",
    citation: "USEEIO v2.0 freight",
    label: "Freight & trucking",
  },
} satisfies Record<string, EngineFactor>;

const FACTORS = Object.values(F) as EngineFactor[];

function input(over: Partial<EngineInput> = {}): EngineInput {
  return {
    organizationId: "org-1",
    periodId: "period-1",
    year: 2025,
    sites: [
      {
        id: "site-1",
        name: "Brooklyn plant",
        country: "US",
        gridRegion: "RFCW",
        marketMethod: "residual_mix",
        renewableSharePct: 0,
        contractNote: "",
      },
    ],
    activity: [],
    spend: [],
    factors: FACTORS,
    ...over,
  };
}

/* ---------------------------------------------------------------- arithmetic */

test("activity arithmetic is integer grams with one rounding step", () => {
  // 4,182 kWh × 0.453592 kgCO2e/kWh = 1,896.9218 kg = 1,896,922 g
  assert.equal(gramsFromActivity(4_182_000, 453_592), 1_896_922);
  assert.equal(gramsFromActivity(0, 453_592), 0);
});

test("spend arithmetic converts cents against a kg-per-dollar factor", () => {
  // $12,480.00 × 0.86 kgCO2e/USD = 10,732.8 kg = 10,732,800 g
  assert.equal(gramsFromSpend(1_248_000, 860_000), 10_732_800);
});

test("intensity metrics are zero, not NaN, when the denominator is missing", () => {
  assert.equal(intensityPerRevenue(128_400_000, 0), 0);
  assert.equal(intensityPerFte(128_400_000, 0), 0);
});

test("intensity metrics compute in milli-tonnes", () => {
  // 128.4 tCO2e over $4.2M revenue = 30.571 tCO2e per $M
  assert.equal(intensityPerRevenue(128_400_000, 420_000_000), 30_571);
  // 128.4 tCO2e over 42 FTE = 3.057 tCO2e per head
  assert.equal(intensityPerFte(128_400_000, 42), 3_057);
});

/* -------------------------------------------------------------------- scopes */

test("electricity produces both Scope 2 methods and no Scope 1", () => {
  const out = computeResults(
    input({
      activity: [
        {
          id: "a1",
          siteId: "site-1",
          category: "electricity_kwh",
          quantityMilli: 4_182_000,
          serviceStart: "2025-03-01",
          serviceEnd: "2025-03-31",
        },
      ],
    }),
  );
  const t = totalsOf(out.results);
  assert.equal(t.scope1, 0);
  assert.equal(t.scope2Location, gramsFromActivity(4_182_000, 453_592));
  // No contractual instrument, so market-based equals location-based.
  assert.equal(t.scope2Market, gramsFromActivity(4_182_000, 453_592));
  assert.deepEqual(out.unresolved, []);
});

test("a renewable contract zeroes the covered share of market-based Scope 2 only", () => {
  const out = computeResults(
    input({
      sites: [
        {
          id: "site-1",
          name: "Brooklyn plant",
          country: "US",
          gridRegion: "RFCW",
          marketMethod: "renewable_contract",
          renewableSharePct: 60,
          contractNote: "Con Edison Solutions 60% renewable supply agreement, 2025",
        },
      ],
      activity: [
        {
          id: "a1",
          siteId: "site-1",
          category: "electricity_kwh",
          quantityMilli: 10_000_000,
          serviceStart: "2025-03-01",
          serviceEnd: "2025-03-31",
        },
      ],
    }),
  );
  const t = totalsOf(out.results);
  // Location-based ignores contracts entirely — that is what makes it comparable.
  assert.equal(t.scope2Location, gramsFromActivity(10_000_000, 453_592));
  // Market-based charges only the uncovered 40%.
  assert.equal(t.scope2Market, gramsFromActivity(4_000_000, 453_592));
  assert.ok(t.scope2Market < t.scope2Location);
  // The covered share still gets a row, so the report can name the instrument.
  const contract = out.results.filter((r) => r.factorId === F.contractual.id);
  assert.equal(contract.length, 1);
  assert.equal(contract[0].gco2e, 0);
  assert.equal(contract[0].quantityMilli, 6_000_000);
});

test("a 100% renewable contract still reports a non-zero location-based figure", () => {
  const out = computeResults(
    input({
      sites: [
        {
          id: "site-1",
          name: "Brooklyn plant",
          country: "US",
          gridRegion: "RFCW",
          marketMethod: "renewable_contract",
          renewableSharePct: 100,
          contractNote: "100% renewable tariff",
        },
      ],
      activity: [
        {
          id: "a1",
          siteId: "site-1",
          category: "electricity_kwh",
          quantityMilli: 5_000_000,
          serviceStart: "2025-06-01",
          serviceEnd: "2025-06-30",
        },
      ],
    }),
  );
  const t = totalsOf(out.results);
  assert.equal(t.scope2Market, 0);
  assert.ok(t.scope2Location > 0, "a green tariff does not change the grid you are on");
});

test("gas and diesel are Scope 1, electricity is not", () => {
  const out = computeResults(
    input({
      activity: [
        {
          id: "a1",
          siteId: "site-1",
          category: "natural_gas_kwh",
          quantityMilli: 23_791_681,
          serviceStart: "2025-11-01",
          serviceEnd: "2025-11-30",
        },
        {
          id: "a2",
          siteId: "site-1",
          category: "diesel_l",
          quantityMilli: 1_841_264,
          serviceStart: "2025-06-01",
          serviceEnd: "2025-06-30",
        },
      ],
    }),
  );
  const t = totalsOf(out.results);
  assert.equal(t.scope2Location, 0);
  assert.equal(
    t.scope1,
    gramsFromActivity(23_791_681, 181_218) + gramsFromActivity(1_841_264, 2_705_046),
  );
});

test("the reported total uses market-based Scope 2, and both totals are available", () => {
  const out = computeResults(
    input({
      sites: [
        {
          id: "site-1",
          name: "Plant",
          country: "US",
          gridRegion: "RFCW",
          marketMethod: "renewable_contract",
          renewableSharePct: 50,
          contractNote: "half green",
        },
      ],
      activity: [
        {
          id: "a1",
          siteId: "site-1",
          category: "electricity_kwh",
          quantityMilli: 8_000_000,
          serviceStart: "2025-02-01",
          serviceEnd: "2025-02-28",
        },
      ],
      spend: [{ id: "s1", amountCents: 1_248_000, eeioCategory: "freight_trucking", excluded: false }],
    }),
  );
  const t = totalsOf(out.results);
  assert.equal(t.totalMarket, t.scope1 + t.scope2Market + t.scope3Spend);
  assert.equal(t.totalLocation, t.scope1 + t.scope2Location + t.scope3Spend);
  assert.ok(t.totalLocation > t.totalMarket);
});

/* --------------------------------------------------------------- Scope 3 --- */

test("excluded and unclassified spend lines contribute nothing", () => {
  const out = computeResults(
    input({
      spend: [
        { id: "s1", amountCents: 1_248_000, eeioCategory: "freight_trucking", excluded: false },
        { id: "s2", amountCents: 9_999_900, eeioCategory: "freight_trucking", excluded: true },
        { id: "s3", amountCents: 5_000_000, eeioCategory: null, excluded: false },
        { id: "s4", amountCents: 0, eeioCategory: "freight_trucking", excluded: false },
      ],
    }),
  );
  assert.equal(totalsOf(out.results).scope3Spend, gramsFromSpend(1_248_000, 860_000));
  assert.equal(out.results.filter((r) => r.scope === "3_spend").length, 1);
});

test("an unknown EEIO category is reported as unresolved, not silently dropped", () => {
  const out = computeResults(
    input({ spend: [{ id: "s1", amountCents: 100_000, eeioCategory: "unicorns", excluded: false }] }),
  );
  assert.equal(out.results.length, 0);
  assert.equal(out.unresolved.length, 1);
  assert.match(out.unresolved[0], /unicorns/);
});

test("a missing grid factor is reported, and the line produces no figure at all", () => {
  const out = computeResults(
    input({
      sites: [
        {
          id: "site-1",
          name: "Phoenix yard",
          country: "US",
          gridRegion: "AZNM",
          marketMethod: "residual_mix",
          renewableSharePct: 0,
          contractNote: "",
        },
      ],
      activity: [
        {
          id: "a1",
          siteId: "site-1",
          category: "electricity_kwh",
          quantityMilli: 1_000_000,
          serviceStart: "2025-03-01",
          serviceEnd: "2025-03-31",
        },
      ],
    }),
  );
  assert.equal(out.results.length, 0);
  assert.match(out.unresolved[0], /AZNM/);
});

test("a UK site uses the national grid factor, not an eGRID subregion", () => {
  assert.equal(
    gridRegionFor({
      id: "s",
      name: "Leeds",
      country: "GB",
      gridRegion: "ignored",
      marketMethod: "residual_mix",
      renewableSharePct: 0,
      contractNote: "",
    }),
    "GB",
  );
});

/* ------------------------------------------------------------- determinism --- */

test("recompute is idempotent: the same inputs produce the same figures", () => {
  const shuffled = input({
    activity: [
      {
        id: "a3",
        siteId: "site-1",
        category: "diesel_l",
        quantityMilli: 1_841_264,
        serviceStart: "2025-06-01",
        serviceEnd: "2025-06-30",
      },
      {
        id: "a1",
        siteId: "site-1",
        category: "electricity_kwh",
        quantityMilli: 4_182_000,
        serviceStart: "2025-03-01",
        serviceEnd: "2025-03-31",
      },
      {
        id: "a2",
        siteId: "site-1",
        category: "natural_gas_kwh",
        quantityMilli: 23_791_681,
        serviceStart: "2025-11-01",
        serviceEnd: "2025-11-30",
      },
    ],
    spend: [
      { id: "s2", amountCents: 400_000, eeioCategory: "freight_trucking", excluded: false },
      { id: "s1", amountCents: 1_248_000, eeioCategory: "freight_trucking", excluded: false },
    ],
  });
  const reversed = input({
    activity: [...shuffled.activity].reverse(),
    spend: [...shuffled.spend].reverse(),
  });

  const project = (rs: ReturnType<typeof computeResults>["results"]) =>
    rs.map((r) => `${r.scope}|${r.category}|${r.month}|${r.gco2e}|${r.factorId}|${r.activityLineId ?? r.spendLineId}`);

  assert.deepEqual(project(computeResults(shuffled).results), project(computeResults(reversed).results));
  assert.deepEqual(project(computeResults(shuffled).results), project(computeResults(shuffled).results));
});

/* ---------------------------------------------------------- month splitting --- */

test("a bill straddling two months splits pro-rata and the parts sum to the whole", () => {
  const parts = splitAcrossMonths("2025-02-18", "2025-03-17", 1_000_000);
  assert.equal(parts.length, 2);
  assert.equal(
    parts.reduce((a, p) => a + p.amount, 0),
    1_000_000,
    "monthly figures must add up to the annual figure",
  );
  assert.equal(parts[0].key, "2025-02");
  assert.equal(parts[1].key, "2025-03");
  // 11 of 28 days fall in February.
  assert.equal(parts[0].amount, Math.round((1_000_000 * 11) / 28));
});

test("monthly attribution of every result row sums back to the scope total", () => {
  const out = computeResults(
    input({
      activity: [
        {
          id: "a1",
          siteId: "site-1",
          category: "electricity_kwh",
          quantityMilli: 4_182_000,
          serviceStart: "2025-02-18",
          serviceEnd: "2025-03-17",
        },
      ],
    }),
  );
  const location = out.results.filter((r) => r.scope === "2_location");
  assert.equal(location.length, 2);
  assert.equal(
    location.reduce((a, r) => a + r.gco2e, 0),
    gramsFromActivity(4_182_000, 453_592),
  );
});

/* -------------------------------------------------------------- coverage --- */

test("coverage counts a month complete only when every known source covers it", () => {
  const lines = [
    { siteId: "s1", category: "electricity_kwh", serviceStart: "2025-01-01", serviceEnd: "2025-01-31" },
    { siteId: "s1", category: "natural_gas_kwh", serviceStart: "2025-01-01", serviceEnd: "2025-01-31" },
    { siteId: "s1", category: "electricity_kwh", serviceStart: "2025-02-01", serviceEnd: "2025-02-28" },
  ];
  const c = computeCoverage(lines, 2025);
  assert.equal(c.sources.length, 2);
  assert.equal(c.months[0].state, "complete");
  assert.equal(c.months[1].state, "partial");
  assert.equal(c.months[2].state, "empty");
  assert.equal(c.monthsComplete, 1);
  assert.equal(c.monthsWithData, 2);
  assert.equal(c.pct, Math.round((3 / 24) * 100));
});

test("coverage with no data at all is zero, not a divide by zero", () => {
  const c = computeCoverage([], 2025);
  assert.equal(c.pct, 0);
  assert.equal(c.monthsComplete, 0);
  assert.equal(c.months.length, 12);
  assert.ok(c.months.every((m) => m.state === "empty"));
});

test("a bill straddling a month boundary covers both months", () => {
  const c = computeCoverage(
    [{ siteId: "s1", category: "electricity_kwh", serviceStart: "2025-02-18", serviceEnd: "2025-03-17" }],
    2025,
  );
  assert.equal(c.months[1].state, "complete");
  assert.equal(c.months[2].state, "complete");
  assert.equal(c.monthsWithData, 2);
});

test("last year's bill does not fill this year's coverage", () => {
  const c = computeCoverage(
    [{ siteId: "s1", category: "electricity_kwh", serviceStart: "2024-03-01", serviceEnd: "2024-03-31" }],
    2025,
  );
  assert.equal(c.monthsWithData, 0);
});

test("a fuel delivery does not make every month incomplete", () => {
  // Electricity and gas are metered monthly; a January heating-oil drop and a June fleet
  // statement are complete records of what was bought. Requiring one of each every month
  // drove a real org's coverage meter to zero while its data was fine.
  const lines = [
    ...Array.from({ length: 12 }, (_, i) => ({
      siteId: "s1",
      category: "electricity_kwh",
      serviceStart: `2025-${String(i + 1).padStart(2, "0")}-01`,
      serviceEnd: `2025-${String(i + 1).padStart(2, "0")}-28`,
    })),
    ...Array.from({ length: 12 }, (_, i) => ({
      siteId: "s1",
      category: "natural_gas_kwh",
      serviceStart: `2025-${String(i + 1).padStart(2, "0")}-01`,
      serviceEnd: `2025-${String(i + 1).padStart(2, "0")}-28`,
    })),
    { siteId: "s1", category: "heating_oil_l", serviceStart: "2025-01-01", serviceEnd: "2025-01-31" },
    { siteId: "s1", category: "diesel_l", serviceStart: "2025-06-01", serviceEnd: "2025-06-30" },
  ];
  const c = computeCoverage(lines, 2025);
  assert.equal(c.monthsComplete, 12, "twelve months of both meters is complete coverage");
  assert.equal(c.pct, 100);
  assert.equal(c.sources.length, 2, "only the metered sources are required");
  assert.equal(c.deliverySources.length, 2, "the deliveries are still recorded");
  assert.deepEqual(
    c.deliverySources.map((d) => d.months),
    [1, 1],
  );
});

test("a Scope 1 result carries its category's own unit, not a hardcoded kWh", () => {
  const out = computeResults(
    input({
      activity: [
        {
          id: "a1",
          siteId: "site-1",
          category: "diesel_l",
          quantityMilli: 1_841_264,
          serviceStart: "2025-06-01",
          serviceEnd: "2025-06-30",
        },
        {
          id: "a2",
          siteId: "site-1",
          category: "natural_gas_kwh",
          quantityMilli: 23_791_681,
          serviceStart: "2025-11-01",
          serviceEnd: "2025-11-30",
        },
      ],
    }),
  );
  const diesel = out.results.find((r) => r.category === "diesel_l")!;
  const gas = out.results.find((r) => r.category === "natural_gas_kwh")!;
  assert.equal(diesel.unit, "L", "the report prints litres of diesel, not kWh of diesel");
  assert.equal(gas.unit, "kWh");
});
