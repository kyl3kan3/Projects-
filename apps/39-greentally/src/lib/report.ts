/**
 * Everything the CSRD-lite report and the questionnaire answer bank need, assembled
 * once.
 *
 * Both surfaces state the same figures, so both read the same context object. If the
 * report and an answer ever disagreed about a number, the product's one real claim —
 * provenance — would be gone.
 */

import { and, eq, inArray } from "drizzle-orm";
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
  type Organization,
  type ReportingPeriod,
  type Scope,
  type Site,
} from "@/db/schema";
import { EEIO_BY_SLUG } from "@/db/factors";
import { computeCoverage, type Coverage } from "@/lib/coverage";
import {
  ENGINE_VERSION,
  intensityPerFte,
  intensityPerRevenue,
  totalsOf,
  type ScopeTotals,
} from "@/lib/footprint";
import { CATEGORY_LABEL } from "@/lib/units";
import { summarise, type SpendSummary } from "@/lib/spend";

export interface ScopeCategoryRow {
  scope: Scope;
  category: string;
  label: string;
  gco2e: number;
  /** Canonical activity total behind the row, for the report's activity table. */
  quantityMilli: number;
  unit: string;
  factorLabel: string;
  factorCitation: string;
  factorVintage: string;
  factorMicro: number;
}

export interface SiteRow {
  siteId: string;
  name: string;
  country: string;
  gridRegion: string;
  marketMethod: string;
  renewableSharePct: number;
  contractNote: string;
  gco2e: number;
}

export interface ReportContext {
  org: Organization;
  period: ReportingPeriod;
  sites: Site[];
  totals: ScopeTotals;
  intensityPerRevenueMilli: number;
  intensityPerFteMilli: number;
  coverage: Coverage;
  rows: ScopeCategoryRow[];
  siteRows: SiteRow[];
  energy: { category: ActivityCategory; label: string; quantityMilli: number; unit: string }[];
  scope3Top: { category: string; label: string; gco2e: number; cents: number }[];
  factorsUsed: { label: string; citation: string; vintage: string }[];
  documentCount: number;
  activityLineCount: number;
  spend: SpendSummary;
  engineVersion: string;
  generatedAt: Date;
  /** Reasons a figure could be incomplete, stated in the report rather than hidden. */
  caveats: string[];
}

export async function buildReportContext(periodId: string): Promise<ReportContext> {
  const db = getDb();
  const [period] = await db.select().from(reportingPeriods).where(eq(reportingPeriods.id, periodId));
  if (!period) throw new Error(`No reporting period ${periodId}`);
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, period.organizationId));
  const siteRows = await db.select().from(sites).where(eq(sites.organizationId, org.id));

  const results = await db
    .select({
      scope: emissionResults.scope,
      category: emissionResults.category,
      gco2e: emissionResults.gco2e,
      siteId: emissionResults.siteId,
      quantityMilli: emissionResults.quantityMilli,
      unit: emissionResults.unit,
      factorId: emissionResults.factorId,
      activityLineId: emissionResults.activityLineId,
      spendLineId: emissionResults.spendLineId,
    })
    .from(emissionResults)
    .where(eq(emissionResults.periodId, periodId));

  const factorIds = [...new Set(results.map((r) => r.factorId).filter((v): v is string => !!v))];
  const factorRows = factorIds.length
    ? await db.select().from(emissionFactors).where(inArray(emissionFactors.id, factorIds))
    : [];
  const factorById = new Map(factorRows.map((f) => [f.id, f]));

  const totals = totalsOf(results.map((r) => ({ scope: r.scope, gco2e: r.gco2e })));

  /* --- rows: one per (scope, category, factor) --- */
  const rowMap = new Map<string, ScopeCategoryRow>();
  // A result row restates its activity line's whole quantity on every month slice, so
  // summing `quantityMilli` across slices would multiply it. Count each source line once.
  const countedLines = new Set<string>();
  for (const r of results) {
    const f = r.factorId ? factorById.get(r.factorId) : undefined;
    const key = `${r.scope}|${r.category}|${r.factorId ?? "none"}`;
    const existing = rowMap.get(key);
    const lineKey = `${key}|${r.activityLineId ?? r.spendLineId ?? ""}`;
    const addQuantity = !countedLines.has(lineKey);
    if (addQuantity) countedLines.add(lineKey);
    if (existing) {
      existing.gco2e += r.gco2e;
      if (addQuantity) existing.quantityMilli += r.quantityMilli;
      continue;
    }
    rowMap.set(key, {
      scope: r.scope,
      category: r.category,
      label:
        r.scope === "3_spend"
          ? (EEIO_BY_SLUG.get(r.category)?.label ?? r.category)
          : (CATEGORY_LABEL[r.category as ActivityCategory] ?? r.category),
      gco2e: r.gco2e,
      quantityMilli: addQuantity ? r.quantityMilli : 0,
      unit: r.unit,
      factorLabel: f?.label ?? "—",
      factorCitation: f?.citation ?? "",
      factorVintage: f?.vintage ?? "",
      factorMicro: f?.kgco2ePerUnitMicro ?? 0,
    });
  }
  const rows = [...rowMap.values()].sort(
    (a, b) => a.scope.localeCompare(b.scope) || b.gco2e - a.gco2e,
  );

  /* --- per-site totals, on the reported (market-based) basis --- */
  const siteTotals = new Map<string, number>();
  for (const r of results) {
    if (r.scope === "2_location" || !r.siteId) continue;
    siteTotals.set(r.siteId, (siteTotals.get(r.siteId) ?? 0) + r.gco2e);
  }

  /* --- energy consumption, from accepted activity lines --- */
  const acceptedLines = await db
    .select({
      siteId: activityLines.siteId,
      category: activityLines.category,
      quantityMilli: activityLines.quantityMilli,
      unit: activityLines.unit,
      serviceStart: activityLines.serviceStart,
      serviceEnd: activityLines.serviceEnd,
    })
    .from(activityLines)
    .innerJoin(documents, eq(activityLines.documentId, documents.id))
    .where(and(eq(activityLines.periodId, periodId), eq(documents.status, "accepted")));

  const energyMap = new Map<ActivityCategory, { quantityMilli: number; unit: string }>();
  for (const l of acceptedLines) {
    const cur = energyMap.get(l.category) ?? { quantityMilli: 0, unit: l.unit };
    energyMap.set(l.category, { quantityMilli: cur.quantityMilli + l.quantityMilli, unit: l.unit });
  }

  const coverage = computeCoverage(
    acceptedLines.map((l) => ({
      siteId: l.siteId,
      category: l.category,
      serviceStart: l.serviceStart,
      serviceEnd: l.serviceEnd,
    })),
    period.year,
    new Map(siteRows.map((s) => [s.id, s.name])),
    new Map(Object.entries(CATEGORY_LABEL)),
  );

  /* --- spend --- */
  const spendRows = await db
    .select({
      amountCents: spendLines.amountCents,
      eeioCategory: spendLines.eeioCategory,
      excluded: spendLines.excluded,
      exclusionReason: spendLines.exclusionReason,
      classificationSource: spendLines.classificationSource,
    })
    .from(spendLines)
    .where(eq(spendLines.periodId, periodId));

  const unconfirmedSpend = spendRows.filter(
    (s) => !s.excluded && s.eeioCategory && s.classificationSource !== "user",
  ).length;

  const spendByCategory = new Map<string, number>();
  for (const s of spendRows) {
    if (s.excluded || !s.eeioCategory) continue;
    spendByCategory.set(s.eeioCategory, (spendByCategory.get(s.eeioCategory) ?? 0) + s.amountCents);
  }

  const scope3Top = rows
    .filter((r) => r.scope === "3_spend")
    .slice(0, 8)
    .map((r) => ({
      category: r.category,
      label: r.label,
      gco2e: r.gco2e,
      cents: spendByCategory.get(r.category) ?? 0,
    }));

  const docCount = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.periodId, periodId));

  const factorsUsed = [
    ...new Map(
      rows
        .filter((r) => r.factorCitation)
        .map((r) => [
          r.factorCitation,
          { label: r.factorLabel, citation: r.factorCitation, vintage: r.factorVintage },
        ]),
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label));

  const spend = summarise(spendRows);

  const caveats: string[] = [];
  if (coverage.monthsComplete < 12) {
    caveats.push(
      `${coverage.monthsComplete} of 12 months have every metered source (electricity and gas) present. Months with partial or no data are listed in the coverage table; the totals below cover only the periods actually billed. Fuel deliveries are included in Scope 1 wherever they occurred and are not expected monthly.`,
    );
  }
  if (spend.unclassifiedRows > 0) {
    caveats.push(
      `${spend.unclassifiedRows} spend line${spend.unclassifiedRows === 1 ? " is" : "s are"} still unclassified and therefore excluded from the Scope 3 screen.`,
    );
  }
  if (unconfirmedSpend > 0) {
    caveats.push(
      `${unconfirmedSpend} of the ${spend.includedRows} spend lines in the Scope 3 screen carry an automatic category suggestion that has not been individually confirmed. Each suggestion is a keyword match on the ledger description and is shown with its rule in the app.`,
    );
  }
  if (spendRows.length === 0) {
    caveats.push(
      "No spend data was imported, so no Scope 3 screening estimate is reported. Scope 3 is not zero — it is unmeasured.",
    );
  }
  if (siteRows.some((s) => s.floorAreaSqm === 0)) {
    caveats.push(
      "One or more sites have no floor area recorded, so the intensity sanity check on their electricity readings was skipped.",
    );
  }

  return {
    org,
    period,
    sites: siteRows,
    totals,
    intensityPerRevenueMilli: intensityPerRevenue(totals.totalMarket, org.annualRevenueCents),
    intensityPerFteMilli: intensityPerFte(totals.totalMarket, org.fteCount),
    coverage,
    rows,
    siteRows: siteRows.map((s) => ({
      siteId: s.id,
      name: s.name,
      country: s.country,
      gridRegion: s.country === "GB" ? "GB" : s.gridRegion,
      marketMethod: s.marketMethod,
      renewableSharePct: s.renewableSharePct,
      contractNote: s.contractNote,
      gco2e: siteTotals.get(s.id) ?? 0,
    })),
    energy: [...energyMap.entries()].map(([category, v]) => ({
      category,
      label: CATEGORY_LABEL[category],
      quantityMilli: v.quantityMilli,
      unit: v.unit,
    })),
    scope3Top,
    factorsUsed,
    documentCount: docCount.length,
    activityLineCount: acceptedLines.length,
    spend,
    engineVersion: period.snapshot?.engineVersion ?? ENGINE_VERSION,
    generatedAt: new Date(),
    caveats,
  };
}

/* ---------------------------------------------------------- methodology text --- */

/**
 * The methodology section, generated from what actually happened rather than written
 * once and left to rot. Every sentence here is checkable against the tables beside it,
 * which is the only reason a $199/month report survives a procurement review.
 */
export function methodologyNotes(ctx: ReportContext): { heading: string; body: string }[] {
  const contracted = ctx.siteRows.filter(
    (s) => s.marketMethod === "renewable_contract" && s.renewableSharePct > 0,
  );
  return [
    {
      heading: "Standard and boundary",
      body: `Prepared following the GHG Protocol Corporate Accounting and Reporting Standard, with Scope 2 reported under the dual-reporting requirement of the GHG Protocol Scope 2 Guidance. The organisational boundary is operational control over ${ctx.sites.length} site${ctx.sites.length === 1 ? "" : "s"}: ${ctx.sites.map((s) => s.name).join(", ")}. Reporting period: 1 January to 31 December ${ctx.period.year}.`,
    },
    {
      heading: "Scope 1 — direct combustion",
      body: `Fuel quantities are taken from utility bills and fuel receipts, converted to a canonical unit (kWh for gaseous fuels, litres for liquid fuels), and multiplied by published combustion factors including CO2, CH4 and N2O at IPCC AR5 100-year global warming potentials. No process, fugitive or refrigerant emissions are included; if this organisation operates refrigeration or uses industrial gases, those sources are not in this figure.`,
    },
    {
      heading: "Scope 2 — purchased electricity",
      body: `Location-based Scope 2 uses the grid average emission rate for each site's grid region. Market-based Scope 2 credits electricity covered by contractual instruments at zero and applies the same grid rate to the remainder. ${
        contracted.length > 0
          ? contracted
              .map(
                (s) =>
                  `${s.name}: ${s.renewableSharePct}% covered by ${s.contractNote || "a supplier renewable contract"}.`,
              )
              .join(" ")
          : "No contractual instruments were recorded for any site, so the market-based and location-based figures are equal."
      } No published residual-mix rate is applied; using the grid average for uncontracted electricity is a conservative simplification and is disclosed here rather than buried.`,
    },
    {
      heading: "Scope 3 — spend-based screening estimate",
      body: `Scope 3 is a screening estimate only. Categorised general-ledger spend is multiplied by USEEIO v2.0 supply-chain factors expressed in kgCO2e per 2018 US dollar of purchaser-price spend. Spend-based estimates carry uncertainty of a factor of two or more at the line level and should be read as an order of magnitude, not a measurement. Payroll, taxes, depreciation, intra-company transfers and financing are excluded as transfers rather than purchases; electricity, gas and fuel purchases are excluded because Scopes 1 and 2 already measured them from the bills. ${ctx.spend.excludedRows} of ${ctx.spend.rows} imported lines were excluded on these grounds, each with its reason recorded.`,
    },
    {
      heading: "Data quality and provenance",
      body: `Every figure in this report traces to a source document and a published factor. ${ctx.activityLineCount} activity reading${ctx.activityLineCount === 1 ? "" : "s"} from ${ctx.documentCount} uploaded document${ctx.documentCount === 1 ? "" : "s"} were accepted after extraction; readings below the confidence threshold, or failing a unit-plausibility, period-continuity or duplicate check, were reviewed and confirmed by a person before inclusion. Emission factor sets, with vintages, are listed in full below.`,
    },
    {
      heading: "Assurance",
      body: `This report is not assured. No third party has verified these figures, and nothing in it should be described as verified, audited or assured. It is a self-prepared inventory suitable for answering a customer questionnaire or an RFP scorecard; an assurance engagement is a separate exercise with a separate cost.`,
    },
  ];
}
