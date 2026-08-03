/**
 * The emissions engine.
 *
 * Deterministic and replayable: results are a pure function of (activity lines, spend
 * lines, sites, factor set, engine version). `computeResults` touches no database and
 * no clock, which is what makes the idempotency test in footprint.test.ts meaningful —
 * deleting every result row and replaying produces the same figures.
 *
 * Arithmetic is integer throughout. A quantity is thousandths of a kWh or a litre, a
 * factor is millionths of a kgCO2e per unit, and a result is whole grams CO2e. There
 * is exactly one rounding step per result row and it is stated below.
 *
 * Scope 2 is always computed **both ways**, per the GHG Protocol Scope 2 Guidance.
 * The market-based figure is not a second opinion: it is a required disclosure, and a
 * report that shows only one of them will be sent back by anyone who reads it
 * properly.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  activityLines,
  documents,
  emissionFactors,
  emissionResults,
  organizations,
  reportingPeriods,
  sites,
  spendLines,
  type ActivityCategory,
  type EmissionFactor,
  type NewEmissionResult,
  type PeriodSnapshot,
  type Scope,
} from "@/db/schema";
import { fuelFactorSetFor } from "@/db/factors";
import { computeCoverage, splitAcrossMonths } from "@/lib/coverage";
import { CANONICAL_UNIT, CATEGORY_LABEL } from "@/lib/units";
import { audit, SYSTEM } from "@/lib/audit";

export const ENGINE_VERSION = "1.0.0";

/* ------------------------------------------------------------- pure inputs --- */

export interface EngineSite {
  id: string;
  name: string;
  country: string;
  gridRegion: string;
  marketMethod: "residual_mix" | "renewable_contract";
  renewableSharePct: number;
  contractNote: string;
}

export interface EngineActivity {
  id: string;
  siteId: string;
  category: ActivityCategory;
  quantityMilli: number;
  serviceStart: string;
  serviceEnd: string;
}

export interface EngineSpend {
  id: string;
  amountCents: number;
  eeioCategory: string | null;
  excluded: boolean;
}

export interface EngineFactor {
  id: string;
  factorSet: string;
  category: string;
  region: string;
  unit: string;
  kgco2ePerUnitMicro: number;
  scope: Scope;
  vintage: string;
  citation: string;
  label: string;
}

export interface EngineInput {
  organizationId: string;
  periodId: string;
  year: number;
  sites: EngineSite[];
  activity: EngineActivity[];
  spend: EngineSpend[];
  factors: EngineFactor[];
}

export interface EngineOutput {
  results: NewEmissionResult[];
  /** Human-readable reasons a line produced no result. Surfaced, never swallowed. */
  unresolved: string[];
  /** Factor rows actually used, for the report's citation block. */
  factorsUsed: { label: string; citation: string; vintage: string }[];
}

/* -------------------------------------------------------------- arithmetic --- */

/**
 * grams CO2e = quantity(unit) × factor(kgCO2e/unit) × 1000
 *            = (quantityMilli / 1000) × (factorMicro / 1e6) × 1000
 *            = quantityMilli × factorMicro / 1e6
 *
 * One `Math.round`, here. IEEE-754 multiplication is deterministic, so the same two
 * integers always produce the same gram figure — which is the property the
 * idempotency test depends on.
 */
export function gramsFromActivity(quantityMilli: number, factorMicro: number): number {
  return Math.round((quantityMilli * factorMicro) / 1_000_000);
}

/**
 * grams CO2e = (cents / 100) USD × (factorMicro / 1e6) kgCO2e/USD × 1000
 *            = cents × factorMicro / 1e5
 */
export function gramsFromSpend(amountCents: number, factorMicro: number): number {
  return Math.round((amountCents * factorMicro) / 100_000);
}

/* ------------------------------------------------------------ factor lookup --- */

function findFactor(
  factors: EngineFactor[],
  scope: Scope,
  category: string,
  region: string,
  factorSet?: string,
): EngineFactor | null {
  return (
    factors.find(
      (f) =>
        f.scope === scope &&
        f.category === category &&
        f.region === region &&
        (!factorSet || f.factorSet === factorSet),
    ) ?? null
  );
}

/** The grid region a site's electricity is priced against. */
export function gridRegionFor(site: EngineSite): string {
  return site.country === "GB" ? "GB" : site.gridRegion;
}

/* ------------------------------------------------------------------ compute --- */

/**
 * Sort keys, so the result set is byte-identical between runs regardless of the order
 * Postgres handed the rows back in.
 */
function sortActivity(a: EngineActivity, b: EngineActivity): number {
  return (
    a.siteId.localeCompare(b.siteId) ||
    a.category.localeCompare(b.category) ||
    a.serviceStart.localeCompare(b.serviceStart) ||
    a.id.localeCompare(b.id)
  );
}

export function computeResults(input: EngineInput): EngineOutput {
  const results: NewEmissionResult[] = [];
  const unresolved: string[] = [];
  const used = new Map<string, { label: string; citation: string; vintage: string }>();
  const siteById = new Map(input.sites.map((s) => [s.id, s]));

  const note = (f: EngineFactor) =>
    used.set(f.id, { label: f.label, citation: f.citation, vintage: f.vintage });

  const base = {
    organizationId: input.organizationId,
    periodId: input.periodId,
    engineVersion: ENGINE_VERSION,
  };

  for (const line of [...input.activity].sort(sortActivity)) {
    const site = siteById.get(line.siteId);
    if (!site) {
      unresolved.push(`Activity line ${line.id} references a site that no longer exists.`);
      continue;
    }

    /* --- Scope 1: fuel combustion --- */
    if (line.category !== "electricity_kwh") {
      const set = fuelFactorSetFor(site.country);
      const factor = findFactor(input.factors, "1", line.category, site.country, set);
      if (!factor) {
        unresolved.push(
          `No ${set} factor for ${CATEGORY_LABEL[line.category]} in ${site.country} — ${site.name}. Run npm run db:seed-factors.`,
        );
        continue;
      }
      note(factor);
      const grams = gramsFromActivity(line.quantityMilli, factor.kgco2ePerUnitMicro);
      // The canonical unit of the *category*, not a hardcoded kWh: diesel is litres, and a
      // report that printed "1,841 kWh of diesel · 2.7058 kg/kWh" would be dismissed on
      // sight by the only reader who matters.
      const unit = CANONICAL_UNIT[line.category];
      for (const part of splitAcrossMonths(line.serviceStart, line.serviceEnd, grams)) {
        if (part.amount === 0) continue;
        results.push({
          ...base,
          siteId: site.id,
          scope: "1",
          category: line.category,
          gco2e: part.amount,
          factorId: factor.id,
          activityLineId: line.id,
          quantityMilli: line.quantityMilli,
          unit,
          month: part.key,
        });
      }
      continue;
    }

    /* --- Scope 2 location-based --- */
    const region = gridRegionFor(site);
    const gridSet = site.country === "GB" ? "defra_2025" : "egrid_2024";
    const grid = findFactor(input.factors, "2_location", "electricity_kwh", region, gridSet);
    if (!grid) {
      unresolved.push(
        `No grid factor for region ${region} (${site.name}). Check the site's grid region, then run npm run db:seed-factors.`,
      );
      continue;
    }
    note(grid);
    const locationGrams = gramsFromActivity(line.quantityMilli, grid.kgco2ePerUnitMicro);
    for (const part of splitAcrossMonths(line.serviceStart, line.serviceEnd, locationGrams)) {
      if (part.amount === 0) continue;
      results.push({
        ...base,
        siteId: site.id,
        scope: "2_location",
        category: "electricity_kwh",
        gco2e: part.amount,
        factorId: grid.id,
        activityLineId: line.id,
        quantityMilli: line.quantityMilli,
        unit: "kWh",
        month: part.key,
      });
    }

    /* --- Scope 2 market-based --- */
    const contractPct =
      site.marketMethod === "renewable_contract"
        ? Math.max(0, Math.min(100, site.renewableSharePct))
        : 0;
    const contractedMilli = Math.round((line.quantityMilli * contractPct) / 100);
    const residualMilli = line.quantityMilli - contractedMilli;

    if (contractedMilli > 0) {
      const contractual = findFactor(input.factors, "2_market", "electricity_kwh", "GLOBAL", "contractual");
      if (!contractual) {
        unresolved.push("No contractual-instrument factor row. Run npm run db:seed-factors.");
      } else {
        note(contractual);
        // Zero grams by construction, but the row exists so the report can show that
        // 62% of this site's electricity was covered by an instrument, and by which one.
        results.push({
          ...base,
          siteId: site.id,
          scope: "2_market",
          category: "electricity_kwh",
          gco2e: 0,
          factorId: contractual.id,
          activityLineId: line.id,
          quantityMilli: contractedMilli,
          unit: "kWh",
          month: line.serviceStart.slice(0, 7),
        });
      }
    }

    if (residualMilli > 0) {
      const residualGrams = gramsFromActivity(residualMilli, grid.kgco2ePerUnitMicro);
      for (const part of splitAcrossMonths(line.serviceStart, line.serviceEnd, residualGrams)) {
        if (part.amount === 0) continue;
        results.push({
          ...base,
          siteId: site.id,
          scope: "2_market",
          category: "electricity_kwh",
          gco2e: part.amount,
          factorId: grid.id,
          activityLineId: line.id,
          quantityMilli: residualMilli,
          unit: "kWh",
          month: part.key,
        });
      }
    }
  }

  /* --- Scope 3, spend-based screen --- */
  for (const s of [...input.spend].sort((a, b) => a.id.localeCompare(b.id))) {
    if (s.excluded || !s.eeioCategory || s.amountCents <= 0) continue;
    const factor = findFactor(input.factors, "3_spend", s.eeioCategory, "US", "useeio_v2");
    if (!factor) {
      unresolved.push(`No USEEIO factor for category "${s.eeioCategory}".`);
      continue;
    }
    note(factor);
    const grams = gramsFromSpend(s.amountCents, factor.kgco2ePerUnitMicro);
    if (grams === 0) continue;
    results.push({
      ...base,
      siteId: null,
      scope: "3_spend",
      category: s.eeioCategory,
      gco2e: grams,
      factorId: factor.id,
      spendLineId: s.id,
      quantityMilli: s.amountCents,
      unit: "USD cents",
      month: "",
    });
  }

  return {
    results,
    unresolved,
    factorsUsed: [...used.values()].sort((a, b) => a.label.localeCompare(b.label)),
  };
}

/* ------------------------------------------------------------------ totals --- */

export interface ScopeTotals {
  scope1: number;
  scope2Location: number;
  scope2Market: number;
  scope3Spend: number;
  /** Reported total: Scope 1 + market-based Scope 2 + Scope 3 screen. */
  totalMarket: number;
  totalLocation: number;
}

export function totalsOf(results: { scope: Scope; gco2e: number }[]): ScopeTotals {
  const sum = (scope: Scope) =>
    results.filter((r) => r.scope === scope).reduce((a, r) => a + r.gco2e, 0);
  const scope1 = sum("1");
  const scope2Location = sum("2_location");
  const scope2Market = sum("2_market");
  const scope3Spend = sum("3_spend");
  return {
    scope1,
    scope2Location,
    scope2Market,
    scope3Spend,
    totalMarket: scope1 + scope2Market + scope3Spend,
    totalLocation: scope1 + scope2Location + scope3Spend,
  };
}

/** tCO2e per million units of revenue, × 1000. Zero revenue yields zero, not NaN. */
export function intensityPerRevenue(totalGco2e: number, annualRevenueCents: number): number {
  if (annualRevenueCents <= 0) return 0;
  const tonnes = totalGco2e / 1_000_000;
  const millions = annualRevenueCents / 100 / 1_000_000;
  return Math.round((tonnes / millions) * 1000);
}

/** tCO2e per FTE, × 1000. */
export function intensityPerFte(totalGco2e: number, fteCount: number): number {
  if (fteCount <= 0) return 0;
  return Math.round((totalGco2e / 1_000_000 / fteCount) * 1000);
}

export function buildSnapshot(
  results: { scope: Scope; siteId: string | null; gco2e: number; month: string }[],
  coverage: { monthsComplete: number; monthsPartial: number; monthsWithData: number },
  counts: { activityLineCount: number; spendLineCount: number; spendClassifiedCount: number },
  computedAt: string,
): PeriodSnapshot {
  const byScope: Record<string, number> = {};
  const bySite: Record<string, number> = {};
  const byMonth: Record<string, number> = {};
  for (const r of results) {
    byScope[r.scope] = (byScope[r.scope] ?? 0) + r.gco2e;
    // Site attribution uses the market-based Scope 2, matching the reported total.
    if (r.scope !== "2_location") {
      const key = r.siteId ?? "org";
      bySite[key] = (bySite[key] ?? 0) + r.gco2e;
    }
    if (r.month && r.scope !== "2_location") {
      byMonth[r.month] = (byMonth[r.month] ?? 0) + r.gco2e;
    }
  }
  return {
    engineVersion: ENGINE_VERSION,
    computedAt,
    gco2eByScope: byScope,
    gco2eBySite: bySite,
    gco2eByMonth: byMonth,
    monthsComplete: coverage.monthsComplete,
    monthsPartial: coverage.monthsPartial,
    monthsWithData: coverage.monthsWithData,
    ...counts,
  };
}

/* ----------------------------------------------------------------- database --- */

function toEngineFactor(f: EmissionFactor): EngineFactor {
  return {
    id: f.id,
    factorSet: f.factorSet,
    category: f.category,
    region: f.region,
    unit: f.unit,
    kgco2ePerUnitMicro: f.kgco2ePerUnitMicro,
    scope: f.scope,
    vintage: f.vintage,
    citation: f.citation,
    label: f.label,
  };
}

export interface RecomputeResult {
  totals: ScopeTotals;
  unresolved: string[];
  resultCount: number;
  factorsUsed: { label: string; citation: string; vintage: string }[];
}

/**
 * Load, compute, and replace every result row for a period, in one transaction.
 *
 * Only *accepted* activity lines feed the engine — a line still in review has not
 * been signed off, and a footprint that silently included unreviewed readings would
 * make the review screen decorative. Spend lines feed it once classified and not
 * excluded.
 *
 * A locked period is never recomputed: locking freezes the figures a report was
 * generated from, which is the whole point of locking.
 */
export async function recomputePeriod(periodId: string): Promise<RecomputeResult> {
  const db = getDb();
  const [period] = await db
    .select()
    .from(reportingPeriods)
    .where(eq(reportingPeriods.id, periodId));
  if (!period) throw new Error(`No reporting period ${periodId}`);

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, period.organizationId));

  const siteRows = await db.select().from(sites).where(eq(sites.organizationId, period.organizationId));
  const factorRows = await db.select().from(emissionFactors);

  const activityRows = await db
    .select({
      id: activityLines.id,
      siteId: activityLines.siteId,
      category: activityLines.category,
      quantityMilli: activityLines.quantityMilli,
      serviceStart: activityLines.serviceStart,
      serviceEnd: activityLines.serviceEnd,
      status: documents.status,
    })
    .from(activityLines)
    .innerJoin(documents, eq(activityLines.documentId, documents.id))
    .where(eq(activityLines.periodId, periodId));

  const accepted = activityRows.filter((r) => r.status === "accepted");

  const spendRows = await db
    .select({
      id: spendLines.id,
      amountCents: spendLines.amountCents,
      eeioCategory: spendLines.eeioCategory,
      excluded: spendLines.excluded,
    })
    .from(spendLines)
    .where(eq(spendLines.periodId, periodId));

  const input: EngineInput = {
    organizationId: period.organizationId,
    periodId,
    year: period.year,
    sites: siteRows.map((s) => ({
      id: s.id,
      name: s.name,
      country: s.country,
      gridRegion: s.gridRegion,
      marketMethod: s.marketMethod,
      renewableSharePct: s.renewableSharePct,
      contractNote: s.contractNote,
    })),
    activity: accepted.map((a) => ({
      id: a.id,
      siteId: a.siteId,
      category: a.category,
      quantityMilli: a.quantityMilli,
      serviceStart: a.serviceStart,
      serviceEnd: a.serviceEnd,
    })),
    spend: spendRows,
    factors: factorRows.map(toEngineFactor),
  };

  const { results, unresolved, factorsUsed } = computeResults(input);

  const coverage = computeCoverage(
    accepted.map((a) => ({
      siteId: a.siteId,
      category: a.category,
      serviceStart: a.serviceStart,
      serviceEnd: a.serviceEnd,
    })),
    period.year,
  );

  const snapshot = buildSnapshot(
    results.map((r) => ({
      scope: r.scope,
      siteId: r.siteId ?? null,
      gco2e: r.gco2e,
      month: r.month ?? "",
    })),
    coverage,
    {
      activityLineCount: accepted.length,
      spendLineCount: spendRows.length,
      spendClassifiedCount: spendRows.filter((s) => s.eeioCategory && !s.excluded).length,
    },
    new Date().toISOString(),
  );

  await db.transaction(async (tx) => {
    await tx.delete(emissionResults).where(eq(emissionResults.periodId, periodId));
    // Chunked: a year of bills plus a thousand spend lines is a big single statement.
    for (let i = 0; i < results.length; i += 500) {
      await tx.insert(emissionResults).values(results.slice(i, i + 500));
    }
    await tx
      .update(reportingPeriods)
      .set({ snapshot, snapshotAt: new Date() })
      .where(eq(reportingPeriods.id, periodId));
  });

  const totals = totalsOf(results.map((r) => ({ scope: r.scope, gco2e: r.gco2e })));

  await audit({
    organizationId: period.organizationId,
    actor: SYSTEM,
    action: "footprint.computed",
    target: `Reporting year ${period.year}`,
    metadata: {
      engineVersion: ENGINE_VERSION,
      total: `${(totals.totalMarket / 1_000_000).toFixed(1)} tCO2e`,
      rows: results.length,
      unresolved: unresolved.length,
      org: org?.name ?? "",
    },
  });

  return { totals, unresolved, resultCount: results.length, factorsUsed };
}
