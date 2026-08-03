/**
 * The questionnaire answer bank — the product, per README's differentiation section.
 *
 * Twenty-five templates mapping a computed period onto the questions a CDP supply-chain
 * request or an EcoVadis assessment actually asks, in plain English. Two rules make it
 * trustworthy:
 *
 *  1. **Figures are interpolated, never typed.** An answer's numbers come from
 *     `emission_results` through the report context. The operator can add tone (a
 *     sentence about their own business, a caveat about a site) and that text is stored
 *     separately in `toneNote`, appended on render. Editing an answer can therefore
 *     never change a number, and regenerating can never delete an edit.
 *  2. **Every answer carries its source refs.** The figure, the factor, the boundary,
 *     the documents. That is the one-click answer to "where did this come from", and it
 *     is the same chain the provenance thread draws in the app.
 *
 * Question wording here is written from scratch in plain English. It is deliberately
 * *equivalent to* the disclosure questions those frameworks ask, not copied from them.
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import {
  questionnaireAnswers,
  type AnswerSourceRef,
  type Framework,
  type QuestionnaireAnswer,
} from "@/db/schema";
import { audit, SYSTEM } from "@/lib/audit";
import { formatCentsCompact, formatQuantityMilli, formatTonnes } from "@/lib/units";
import { buildReportContext, type ReportContext } from "@/lib/report";

export type { Framework };

export interface AnswerTemplate {
  framework: Exclude<Framework, "custom">;
  key: string;
  /** The label chip, e.g. "CDP-STYLE C6.1". */
  tag: string;
  question: string;
  render(ctx: ReportContext): { text: string; refs: AnswerSourceRef[] };
}

/* ------------------------------------------------------------------ helpers --- */

const t = (g: number) => `${formatTonnes(g)} tCO2e`;

function figureRef(label: string, detail: string): AnswerSourceRef {
  return { kind: "figure", label, detail };
}

function factorRefs(ctx: ReportContext, limit = 4): AnswerSourceRef[] {
  return ctx.factorsUsed.slice(0, limit).map((f) => ({
    kind: "factor" as const,
    label: f.label,
    detail: `${f.citation} · vintage ${f.vintage}`,
  }));
}

function boundaryRef(ctx: ReportContext): AnswerSourceRef {
  return {
    kind: "boundary",
    label: "Organisational boundary",
    detail: `Operational control over ${ctx.sites.length} site${ctx.sites.length === 1 ? "" : "s"}: ${ctx.sites
      .map((s) => `${s.name} (${s.country})`)
      .join(", ")}`,
  };
}

function documentRef(ctx: ReportContext): AnswerSourceRef {
  return {
    kind: "document",
    label: "Source documents",
    detail: `${ctx.documentCount} uploaded document${ctx.documentCount === 1 ? "" : "s"} producing ${ctx.activityLineCount} accepted activity reading${ctx.activityLineCount === 1 ? "" : "s"}; ${ctx.coverage.monthsComplete} of 12 months complete`,
  };
}

function intensityText(ctx: ReportContext): string {
  const parts: string[] = [];
  if (ctx.intensityPerRevenueMilli > 0) {
    parts.push(
      `${(ctx.intensityPerRevenueMilli / 1000).toFixed(2)} tCO2e per million ${ctx.org.reportingCurrency} of revenue (revenue ${formatCentsCompact(ctx.org.annualRevenueCents, ctx.org.reportingCurrency)})`,
    );
  }
  if (ctx.intensityPerFteMilli > 0) {
    parts.push(`${(ctx.intensityPerFteMilli / 1000).toFixed(2)} tCO2e per full-time employee (${ctx.org.fteCount} FTE)`);
  }
  return parts.length > 0 ? parts.join("; ") : "Intensity metrics are unavailable: revenue and headcount have not been recorded.";
}

function energyText(ctx: ReportContext): string {
  if (ctx.energy.length === 0) return "No energy consumption data has been accepted yet.";
  return ctx.energy
    .map((e) => `${e.label}: ${formatQuantityMilli(e.quantityMilli)} ${e.unit}`)
    .join("; ");
}

function renewableText(ctx: ReportContext): string {
  const contracted = ctx.siteRows.filter(
    (s) => s.marketMethod === "renewable_contract" && s.renewableSharePct > 0,
  );
  if (contracted.length === 0) {
    return "No electricity is currently covered by a renewable contract or energy attribute certificate, so 0% of purchased electricity is claimed as renewable.";
  }
  return contracted
    .map(
      (s) =>
        `${s.name}: ${s.renewableSharePct}% of purchased electricity covered by ${s.contractNote || "a supplier renewable contract"}`,
    )
    .join("; ");
}

/* ---------------------------------------------------------------- templates --- */

export const TEMPLATES: AnswerTemplate[] = [
  /* ------------------------------------------------------------ CDP-style --- */
  {
    framework: "cdp_style",
    key: "c0_2_reporting_period",
    tag: "CDP-STYLE C0.2",
    question: "State the start and end date of the year for which you are reporting data.",
    render: (ctx) => ({
      text: `1 January ${ctx.period.year} to 31 December ${ctx.period.year}. This is a full calendar-year inventory. ${ctx.coverage.monthsComplete} of the 12 months have every uploaded source present; the remaining months are documented in the coverage table of our inventory report rather than estimated.`,
      refs: [documentRef(ctx)],
    }),
  },
  {
    framework: "cdp_style",
    key: "c0_3_countries",
    tag: "CDP-STYLE C0.3",
    question: "Select the countries or areas for which you will be supplying data.",
    render: (ctx) => ({
      text: `Countries of operation: ${[...new Set(ctx.sites.map((s) => s.country))].join(", ") || "not yet recorded"}. Sites included in this inventory: ${ctx.sites.map((s) => `${s.name} (${s.country}, grid region ${s.country === "GB" ? "GB" : s.gridRegion})`).join("; ") || "none recorded"}. We have no operations outside the countries listed.`,
      refs: [boundaryRef(ctx)],
    }),
  },
  {
    framework: "cdp_style",
    key: "c0_5_boundary",
    tag: "CDP-STYLE C0.5",
    question:
      "Select the option that describes the reporting boundary for which climate-related impacts are evaluated.",
    render: (ctx) => ({
      text: `Operational control. ${ctx.org.name} reports 100% of emissions from the ${ctx.sites.length} site${ctx.sites.length === 1 ? "" : "s"} it operates: ${ctx.sites.map((s) => s.name).join(", ")}. Leased space where the landlord holds the utility account and no consumption data is available to us is excluded and identified as such.`,
      refs: [boundaryRef(ctx)],
    }),
  },
  {
    framework: "cdp_style",
    key: "c1_1_oversight",
    tag: "CDP-STYLE C1.1",
    question: "Is there board-level or senior-management oversight of climate-related issues?",
    render: (ctx) => ({
      text: `Yes, at senior-management level. ${ctx.org.settings.contactName || "The operations lead"} is accountable for greenhouse-gas measurement and for responding to customer sustainability requirements, reporting to the owner/managing director. As a company of ${ctx.org.fteCount || "under 250"} employees we do not have a board committee or a dedicated sustainability function, and we would rather say so than describe a governance structure we do not have.`,
      refs: [],
    }),
  },
  {
    framework: "cdp_style",
    key: "c4_1_targets",
    tag: "CDP-STYLE C4.1",
    question: "Did you have an emissions target that was active in the reporting year?",
    render: (ctx) => ({
      text: `No quantified absolute or intensity target was active in ${ctx.period.year}. ${ctx.period.year} is our first measured inventory, and setting a target before we have a verified base year would produce a number we could not stand behind. Our stated intent is to complete a second consecutive year of measurement, then set a reduction target against ${ctx.period.year} as the base year.`,
      refs: [figureRef(`Base-year total ${ctx.period.year}`, `${t(ctx.totals.totalMarket)} (market-based Scope 2)`)],
    }),
  },
  {
    framework: "cdp_style",
    key: "c5_1_base_year",
    tag: "CDP-STYLE C5.1",
    question: "Provide details of your base year and base-year emissions.",
    render: (ctx) => ({
      text: `Base year: ${ctx.period.year} (first year measured). Base-year emissions — Scope 1: ${t(ctx.totals.scope1)}. Scope 2 location-based: ${t(ctx.totals.scope2Location)}. Scope 2 market-based: ${t(ctx.totals.scope2Market)}. Scope 3 (spend-based screening estimate): ${t(ctx.totals.scope3Spend)}.`,
      refs: [
        figureRef("Scope 1", t(ctx.totals.scope1)),
        figureRef("Scope 2 location-based", t(ctx.totals.scope2Location)),
        figureRef("Scope 2 market-based", t(ctx.totals.scope2Market)),
        figureRef("Scope 3 spend screen", t(ctx.totals.scope3Spend)),
      ],
    }),
  },
  {
    framework: "cdp_style",
    key: "c5_2_methodology",
    tag: "CDP-STYLE C5.2",
    question:
      "Select the name of the standard, protocol or methodology you have used to collect activity data and calculate emissions.",
    render: (ctx) => ({
      text: `GHG Protocol Corporate Accounting and Reporting Standard, with Scope 2 dual reporting under the GHG Protocol Scope 2 Guidance and Scope 3 screening under the Corporate Value Chain (Scope 3) Standard. Emission factors: ${ctx.factorsUsed.map((f) => `${f.label} (${f.vintage})`).join("; ") || "not yet applied"}. Global warming potentials: IPCC AR5, 100-year.`,
      refs: factorRefs(ctx, 6),
    }),
  },
  {
    framework: "cdp_style",
    key: "c6_1_scope1",
    tag: "CDP-STYLE C6.1",
    question: "What were your organisation's gross global Scope 1 emissions in metric tons CO2e?",
    render: (ctx) => ({
      text: `${t(ctx.totals.scope1)}. This covers stationary and mobile combustion of natural gas and liquid fuels at sites under our operational control, calculated from metered and invoiced fuel quantities. It excludes fugitive refrigerant emissions and process emissions, neither of which we currently measure.`,
      refs: [
        figureRef("Scope 1 total", t(ctx.totals.scope1)),
        ...ctx.rows
          .filter((r) => r.scope === "1")
          .map((r) => figureRef(r.label, `${t(r.gco2e)} from ${formatQuantityMilli(r.quantityMilli)} ${r.unit} · ${r.factorLabel}`)),
        documentRef(ctx),
      ],
    }),
  },
  {
    framework: "cdp_style",
    key: "c6_2_scope2_approach",
    tag: "CDP-STYLE C6.2",
    question: "Describe your organisation's approach to reporting Scope 2 emissions.",
    render: (ctx) => ({
      text: `We report both methods, as the Scope 2 Guidance requires. Location-based figures use grid-average emission rates for each site's grid region. Market-based figures credit electricity covered by contractual instruments at zero and apply the same grid rate to the remainder. ${renewableText(ctx)} We do not apply a published residual-mix rate; using the grid average for uncontracted electricity is conservative and we disclose it rather than leave it implied.`,
      refs: factorRefs(ctx),
    }),
  },
  {
    framework: "cdp_style",
    key: "c6_3_scope2",
    tag: "CDP-STYLE C6.3",
    question:
      "What were your organisation's gross global Scope 2 emissions in metric tons CO2e, location-based and market-based?",
    render: (ctx) => ({
      text: `Location-based: ${t(ctx.totals.scope2Location)}. Market-based: ${t(ctx.totals.scope2Market)}. Both are derived from the same metered electricity consumption of ${formatQuantityMilli(ctx.energy.find((e) => e.category === "electricity_kwh")?.quantityMilli ?? 0)} kWh.`,
      refs: [
        figureRef("Scope 2 location-based", t(ctx.totals.scope2Location)),
        figureRef("Scope 2 market-based", t(ctx.totals.scope2Market)),
        ...ctx.rows
          .filter((r) => r.scope === "2_location")
          .map((r) => figureRef(r.factorLabel, r.factorCitation)),
      ],
    }),
  },
  {
    framework: "cdp_style",
    key: "c6_5_scope3",
    tag: "CDP-STYLE C6.5",
    question:
      "Account for your organisation's gross global Scope 3 emissions, disclosing and explaining any exclusions.",
    render: (ctx) => ({
      text:
        ctx.totals.scope3Spend > 0
          ? `${t(ctx.totals.scope3Spend)}, as a spend-based screening estimate of purchased goods and services (category 1) and upstream transportation (category 4). Largest contributors: ${ctx.scope3Top
              .slice(0, 4)
              .map((s) => `${s.label} ${t(s.gco2e)}`)
              .join(", ")}. This is an economic-input-output screen, not activity data: it is accurate to an order of magnitude and is intended to identify where activity-based data collection would be worth the effort. Categories not evaluated: employee commuting, business travel, use of sold products, end-of-life treatment, franchises and investments.`
          : "Not yet quantified. We have not imported general-ledger spend for this period, so no screening estimate is reported. Scope 3 is unmeasured rather than zero, and we would rather report that than a figure we cannot support.",
      refs: [
        figureRef("Scope 3 screening estimate", t(ctx.totals.scope3Spend)),
        ...ctx.scope3Top
          .slice(0, 4)
          .map((s) => figureRef(s.label, `${t(s.gco2e)} from ${formatCentsCompact(s.cents)} of categorised spend`)),
      ],
    }),
  },
  {
    framework: "cdp_style",
    key: "c6_10_intensity",
    tag: "CDP-STYLE C6.10",
    question:
      "Provide an intensity figure for your gross global combined Scope 1 and 2 emissions, and the metric denominator you used.",
    render: (ctx) => ({
      text: `${intensityText(ctx)}. Denominators are the reporting-year figures for the same boundary as the emissions. Combined Scope 1 and market-based Scope 2: ${t(ctx.totals.scope1 + ctx.totals.scope2Market)}.`,
      refs: [
        figureRef("Scope 1 + Scope 2 market-based", t(ctx.totals.scope1 + ctx.totals.scope2Market)),
        figureRef("Revenue denominator", formatCentsCompact(ctx.org.annualRevenueCents, ctx.org.reportingCurrency)),
        figureRef("Headcount denominator", `${ctx.org.fteCount} FTE`),
      ],
    }),
  },
  {
    framework: "cdp_style",
    key: "c7_9_change",
    tag: "CDP-STYLE C7.9",
    question:
      "How do your gross global emissions for the reporting year compare to those of the previous reporting year?",
    render: (ctx) => ({
      text: `This is our first measured year, so no comparison is possible. ${ctx.period.year} is the base year against which future changes will be reported. We have not restated or estimated a prior year.`,
      refs: [figureRef(`${ctx.period.year} total`, t(ctx.totals.totalMarket))],
    }),
  },
  {
    framework: "cdp_style",
    key: "c8_2_energy",
    tag: "CDP-STYLE C8.2",
    question: "Report your organisation's energy consumption totals for the reporting year.",
    render: (ctx) => ({
      text: `${energyText(ctx)}. ${renewableText(ctx)} Figures are taken from utility invoices and fuel receipts, converted to a common unit — gaseous fuels to kWh on a higher heating value basis, liquid fuels to litres.`,
      refs: [documentRef(ctx), ...factorRefs(ctx, 3)],
    }),
  },
  {
    framework: "cdp_style",
    key: "c10_1_verification",
    tag: "CDP-STYLE C10.1",
    question: "Indicate the verification or assurance status that applies to your reported emissions.",
    render: () => ({
      text: `No third-party verification or assurance. These figures are self-prepared from primary source documents (utility invoices, fuel receipts, general-ledger export) with an internal review step on every reading below our confidence threshold. We are not describing them as verified, and we will say the same thing if asked again.`,
      refs: [],
    }),
  },
  {
    framework: "cdp_style",
    key: "c12_1_engagement",
    tag: "CDP-STYLE C12.1",
    question: "Do you engage with your value chain on climate-related issues?",
    render: (ctx) => ({
      text: `Yes, in the direction that matters for a company of our size: we respond to customer requirements and we have begun asking our own largest suppliers for their emissions data, starting with the ${ctx.scope3Top.length > 0 ? ctx.scope3Top[0].label.toLowerCase() : "highest-spend"} category that dominates our spend-based screen. We do not yet impose contractual climate requirements on suppliers.`,
      refs: ctx.scope3Top.slice(0, 2).map((s) => figureRef(s.label, `${t(s.gco2e)} screening estimate`)),
    }),
  },

  /* ------------------------------------------------------ EcoVadis-style --- */
  {
    framework: "ecovadis_style",
    key: "env_policy",
    tag: "ECOVADIS-STYLE ENV 1.1",
    question: "Do you have a documented environmental or energy-management policy?",
    render: (ctx) => ({
      text: `Yes — a short written environmental policy covering energy use, waste and supplier expectations, owned by ${ctx.org.settings.contactName || "the operations lead"} and reviewed annually. It is a two-page document appropriate to a company of our size, not a management system certified to ISO 14001. We are not claiming certification we do not hold.`,
      refs: [],
    }),
  },
  {
    framework: "ecovadis_style",
    key: "env_ghg_measured",
    tag: "ECOVADIS-STYLE ENV 2.1",
    question: "Do you measure your greenhouse-gas emissions? State the scopes and the reporting year.",
    render: (ctx) => ({
      text: `Yes. For calendar year ${ctx.period.year} we measure Scope 1 (${t(ctx.totals.scope1)}), Scope 2 on both a location basis (${t(ctx.totals.scope2Location)}) and a market basis (${t(ctx.totals.scope2Market)}), and a spend-based screening estimate for Scope 3 (${t(ctx.totals.scope3Spend)}). Total reported, using market-based Scope 2: ${t(ctx.totals.totalMarket)}.`,
      refs: [
        figureRef("Total reported", t(ctx.totals.totalMarket)),
        figureRef("Scope 1", t(ctx.totals.scope1)),
        figureRef("Scope 2 market-based", t(ctx.totals.scope2Market)),
        figureRef("Scope 3 screen", t(ctx.totals.scope3Spend)),
        boundaryRef(ctx),
      ],
    }),
  },
  {
    framework: "ecovadis_style",
    key: "env_energy",
    tag: "ECOVADIS-STYLE ENV 2.2",
    question: "Report your total energy consumption for the reporting year, by energy type.",
    render: (ctx) => ({
      text: `${energyText(ctx)}. All figures come from supplier invoices for the reporting year; none are estimated from floor area or headcount.`,
      refs: [documentRef(ctx)],
    }),
  },
  {
    framework: "ecovadis_style",
    key: "env_renewable",
    tag: "ECOVADIS-STYLE ENV 2.3",
    question: "What share of your purchased electricity comes from renewable sources?",
    render: (ctx) => ({
      text: `${renewableText(ctx)} Where a renewable share is claimed it is backed by the named supply contract or certificate and is reflected only in the market-based Scope 2 figure — the location-based figure is unchanged, because the physical grid we draw from is unchanged.`,
      refs: ctx.siteRows
        .filter((s) => s.renewableSharePct > 0)
        .map((s) => ({
          kind: "document" as const,
          label: `${s.name} contractual instrument`,
          detail: s.contractNote || "Supplier renewable contract",
        })),
    }),
  },
  {
    framework: "ecovadis_style",
    key: "env_site_coverage",
    tag: "ECOVADIS-STYLE ENV 2.4",
    question: "What proportion of your operations is covered by the reported data?",
    render: (ctx) => ({
      text: `All ${ctx.sites.length} site${ctx.sites.length === 1 ? "" : "s"} under our operational control ${ctx.sites.length === 1 ? "is" : "are"} covered: ${ctx.siteRows.map((s) => `${s.name} — ${t(s.gco2e)}`).join("; ")}. Within the year, ${ctx.coverage.monthsComplete} of 12 months have every source we collect present (${ctx.coverage.pct}% of expected source-months). We report the months we hold invoices for and do not extrapolate the rest.`,
      refs: [documentRef(ctx), boundaryRef(ctx)],
    }),
  },
  {
    framework: "ecovadis_style",
    key: "env_factors",
    tag: "ECOVADIS-STYLE ENV 2.5",
    question: "Which emission factors and calculation methodology did you use?",
    render: (ctx) => ({
      text: `${ctx.factorsUsed.map((f) => `${f.label} — ${f.citation}`).join(" · ") || "No factors applied yet."} Global warming potentials: IPCC AR5 100-year. Calculation follows the GHG Protocol Corporate Standard; Scope 2 follows the Scope 2 Guidance dual-reporting requirement.`,
      refs: factorRefs(ctx, 8),
    }),
  },
  {
    framework: "ecovadis_style",
    key: "env_intensity",
    tag: "ECOVADIS-STYLE ENV 2.6",
    question: "Provide an emissions intensity figure with its denominator.",
    render: (ctx) => ({
      text: `${intensityText(ctx)}. Both denominators are for the same boundary and reporting year as the emissions figures.`,
      refs: [
        figureRef("Total reported", t(ctx.totals.totalMarket)),
        figureRef("Revenue denominator", formatCentsCompact(ctx.org.annualRevenueCents, ctx.org.reportingCurrency)),
      ],
    }),
  },
  {
    framework: "ecovadis_style",
    key: "env_actions",
    tag: "ECOVADIS-STYLE ENV 3.1",
    question: "What actions have you taken to reduce your energy use or emissions?",
    render: (ctx) => ({
      text: `Measurement first: ${ctx.period.year} is our first complete inventory, which tells us that ${dominantScope(ctx)} is where reduction effort belongs. We are not going to list actions we have not taken. Concrete steps in progress: monthly meter readings recorded rather than reconstructed at year end, and a review of the ${ctx.scope3Top[0]?.label.toLowerCase() ?? "highest-spend"} category that dominates our screening estimate.`,
      refs: [figureRef(dominantScopeLabel(ctx), t(dominantScopeValue(ctx)))],
    }),
  },
  {
    framework: "ecovadis_style",
    key: "env_verification",
    tag: "ECOVADIS-STYLE ENV 3.2",
    question: "Have your reported emissions been externally verified?",
    render: () => ({
      text: `No. The figures are self-prepared from primary documents with an internal review step, and are not assured by a third party. Each figure can be traced to the invoice and the published factor it came from, which is available on request.`,
      refs: [],
    }),
  },
  {
    framework: "ecovadis_style",
    key: "env_next_year",
    tag: "ECOVADIS-STYLE ENV 3.3",
    question: "What is your plan for the next reporting cycle?",
    render: (ctx) => ({
      text: `Complete ${ctx.period.year + 1} on the same basis so a year-on-year comparison is meaningful, close the ${12 - ctx.coverage.monthsComplete} month${12 - ctx.coverage.monthsComplete === 1 ? "" : "s"} where a source is still missing, and replace the spend-based Scope 3 screen with activity data for the single largest category. A reduction target will be set against ${ctx.period.year} once a second measured year exists.`,
      refs: [documentRef(ctx)],
    }),
  },
];

function dominantScope(ctx: ReportContext): string {
  const s1 = ctx.totals.scope1;
  const s2 = ctx.totals.scope2Market;
  const s3 = ctx.totals.scope3Spend;
  const max = Math.max(s1, s2, s3);
  if (max === 0) return "no scope yet";
  if (max === s3) return "our purchased goods and services";
  if (max === s2) return "purchased electricity";
  return "on-site fuel combustion";
}

function dominantScopeLabel(ctx: ReportContext): string {
  const label = dominantScope(ctx);
  return label === "purchased electricity"
    ? "Scope 2 market-based"
    : label === "on-site fuel combustion"
      ? "Scope 1"
      : "Scope 3 screening estimate";
}

function dominantScopeValue(ctx: ReportContext): number {
  return Math.max(ctx.totals.scope1, ctx.totals.scope2Market, ctx.totals.scope3Spend);
}

/* ---------------------------------------------------------------- rendering --- */

export function templatesFor(framework: Framework): AnswerTemplate[] {
  if (framework === "custom") return TEMPLATES;
  return TEMPLATES.filter((tpl) => tpl.framework === framework);
}

export function frameworkLabel(framework: Framework): string {
  switch (framework) {
    case "cdp_style":
      return "CDP-style";
    case "ecovadis_style":
      return "EcoVadis-style";
    default:
      return "Custom form";
  }
}

/** The tag chip for an answer row, recovered from its template. */
export function tagFor(framework: Framework, key: string): string {
  return TEMPLATES.find((tpl) => tpl.key === key && tpl.framework === framework)?.tag ?? "CUSTOM";
}

/** The stored answer plus the operator's tone note, which is what gets copied. */
export function fullAnswerText(answer: QuestionnaireAnswer): string {
  return answer.toneNote.trim()
    ? `${answer.answerText}\n\n${answer.toneNote.trim()}`
    : answer.answerText;
}

/* -------------------------------------------------------------- generation --- */

export interface GenerateResult {
  created: number;
  updated: number;
  unchanged: number;
}

/**
 * Generate or regenerate the answer bank for one framework.
 *
 * Regeneration is safe by construction: `answerText` is overwritten from the template
 * (so figures always match the current computation), `toneNote` is never touched, and
 * an answer whose generated text changed drops back to `draft` so the operator knows a
 * figure moved under it.
 */
export async function generateAnswers(
  periodId: string,
  framework: Exclude<Framework, "custom">,
): Promise<GenerateResult> {
  const db = getDb();
  const ctx = await buildReportContext(periodId);
  const templates = templatesFor(framework);

  const existing = await db
    .select()
    .from(questionnaireAnswers)
    .where(
      and(
        eq(questionnaireAnswers.periodId, periodId),
        eq(questionnaireAnswers.framework, framework),
      ),
    );
  const byKey = new Map(existing.map((a) => [a.questionKey, a]));

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const tpl of templates) {
    const { text, refs } = tpl.render(ctx);
    const prior = byKey.get(tpl.key);
    if (!prior) {
      await db.insert(questionnaireAnswers).values({
        organizationId: ctx.org.id,
        periodId,
        framework,
        questionKey: tpl.key,
        questionText: tpl.question,
        answerText: text,
        sourceRefs: refs,
        status: "draft",
      });
      created += 1;
      continue;
    }
    if (prior.answerText === text && prior.questionText === tpl.question) {
      unchanged += 1;
      continue;
    }
    await db
      .update(questionnaireAnswers)
      .set({
        questionText: tpl.question,
        answerText: text,
        sourceRefs: refs,
        // The figure moved, so a "ready" answer is no longer known-good.
        status: "draft",
        updatedAt: new Date(),
      })
      .where(eq(questionnaireAnswers.id, prior.id));
    updated += 1;
  }

  await audit({
    organizationId: ctx.org.id,
    actor: SYSTEM,
    action: "answers.generated",
    target: frameworkLabel(framework),
    metadata: { framework: frameworkLabel(framework), count: templates.length, created, updated },
  });

  return { created, updated, unchanged };
}
