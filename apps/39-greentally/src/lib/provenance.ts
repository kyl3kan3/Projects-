/**
 * The provenance thread's data.
 *
 * DESIGN.md's signature interaction: tap a figure, a moss thread draws down from the
 * digit and pins a sheet showing the source line, the factor with its vintage, and the
 * arithmetic. This module answers "where did this number come from" for a scope total,
 * for one site, and for one result row.
 *
 * Nothing here is decorative. It is the same chain the report footnotes and the
 * questionnaire source refs use, which is why they can never disagree.
 */

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  activityLines,
  documents,
  emissionFactors,
  emissionResults,
  sites,
  spendLines,
  type ActivityCategory,
  type Scope,
} from "@/db/schema";
import { EEIO_BY_SLUG } from "@/db/factors";
import {
  CATEGORY_LABEL,
  formatCents,
  formatFactorMicro,
  formatQuantityMilli,
  formatTonnes,
} from "@/lib/units";

export interface ProvenanceEntry {
  /** "March electricity — Consolidated Edison" */
  source: string;
  /** "4,182 kWh · MAR 01–31" */
  sourceDetail: string;
  /** "0.383 kgCO2e/kWh · eGRID 2024 · RFCW" */
  factor: string;
  factorCitation: string;
  /** "4,182 kWh × 0.383 kgCO2e/kWh = 1.60 tCO2e" */
  arithmetic: string;
  gco2e: number;
  documentId: string | null;
  documentName: string | null;
}

export interface ProvenanceThread {
  title: string;
  /** "63.9 tCO2e" */
  figure: string;
  entries: ProvenanceEntry[];
  /** Set when the list was truncated. */
  more: number;
  note: string;
}

const SHORT_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function periodLabel(startIso: string, endIso: string): string {
  const [, sm, sd] = startIso.split("-");
  const [, em, ed] = endIso.split("-");
  const start = `${SHORT_MONTHS[Number(sm) - 1]} ${sd}`;
  return sm === em ? `${start}–${ed}` : `${start} – ${SHORT_MONTHS[Number(em) - 1]} ${ed}`;
}

export const SCOPE_TITLE: Record<Scope, string> = {
  "1": "Scope 1 — fuel combustion",
  "2_location": "Scope 2 — electricity (location-based)",
  "2_market": "Scope 2 — electricity (market-based)",
  "3_spend": "Scope 3 — spend-based screen",
};

/**
 * The provenance of one scope's total for a period.
 *
 * Result rows are grouped back to their source line, because a bill that straddles two
 * months produced two rows and the operator is looking for the bill.
 */
export async function scopeProvenance(
  periodId: string,
  scope: Scope,
  limit = 40,
): Promise<ProvenanceThread> {
  const db = getDb();
  const results = await db
    .select()
    .from(emissionResults)
    .where(and(eq(emissionResults.periodId, periodId), eq(emissionResults.scope, scope)));

  const total = results.reduce((a, r) => a + r.gco2e, 0);

  const factorIds = [...new Set(results.map((r) => r.factorId).filter((v): v is string => !!v))];
  const factorRows = factorIds.length
    ? await db.select().from(emissionFactors).where(inArray(emissionFactors.id, factorIds))
    : [];
  const factorById = new Map(factorRows.map((f) => [f.id, f]));

  const activityIds = [
    ...new Set(results.map((r) => r.activityLineId).filter((v): v is string => !!v)),
  ];
  const activityRows = activityIds.length
    ? await db
        .select({
          id: activityLines.id,
          category: activityLines.category,
          quantityMilli: activityLines.quantityMilli,
          unit: activityLines.unit,
          sourceQuantity: activityLines.sourceQuantity,
          sourceUnit: activityLines.sourceUnit,
          serviceStart: activityLines.serviceStart,
          serviceEnd: activityLines.serviceEnd,
          provider: activityLines.provider,
          siteId: activityLines.siteId,
          documentId: activityLines.documentId,
          filename: documents.filename,
        })
        .from(activityLines)
        .innerJoin(documents, eq(activityLines.documentId, documents.id))
        .where(inArray(activityLines.id, activityIds))
    : [];
  const activityById = new Map(activityRows.map((a) => [a.id, a]));

  const spendIds = [...new Set(results.map((r) => r.spendLineId).filter((v): v is string => !!v))];
  const spendRows = spendIds.length
    ? await db
        .select({
          id: spendLines.id,
          description: spendLines.description,
          amountCents: spendLines.amountCents,
          glAccount: spendLines.glAccount,
          eeioCategory: spendLines.eeioCategory,
          documentId: spendLines.documentId,
          filename: documents.filename,
        })
        .from(spendLines)
        .innerJoin(documents, eq(spendLines.documentId, documents.id))
        .where(inArray(spendLines.id, spendIds))
    : [];
  const spendById = new Map(spendRows.map((s) => [s.id, s]));

  const siteRows = await db.select().from(sites);
  const siteName = new Map(siteRows.map((s) => [s.id, s.name]));

  // Group by (source line, factor): the unit an operator recognises.
  const grouped = new Map<string, { gco2e: number; sample: (typeof results)[number] }>();
  for (const r of results) {
    const key = `${r.activityLineId ?? r.spendLineId ?? r.id}|${r.factorId ?? ""}`;
    const cur = grouped.get(key);
    if (cur) cur.gco2e += r.gco2e;
    else grouped.set(key, { gco2e: r.gco2e, sample: r });
  }

  const entries: ProvenanceEntry[] = [...grouped.values()]
    .sort((a, b) => b.gco2e - a.gco2e)
    .slice(0, limit)
    .map(({ gco2e, sample }) => {
      const factor = sample.factorId ? factorById.get(sample.factorId) : undefined;
      const factorText = factor
        ? `${formatFactorMicro(factor.kgco2ePerUnitMicro)} kgCO2e/${factor.unit} · ${factor.label} · ${factor.vintage}`
        : "—";

      if (sample.activityLineId) {
        const a = activityById.get(sample.activityLineId);
        if (a) {
          const shown = sample.quantityMilli || a.quantityMilli;
          return {
            source: `${CATEGORY_LABEL[a.category as ActivityCategory]} — ${a.provider || "provider not read"}`,
            sourceDetail: `${formatQuantityMilli(shown)} ${a.unit} · ${periodLabel(a.serviceStart, a.serviceEnd)} · ${
              siteName.get(a.siteId) ?? "site"
            }${a.sourceUnit && a.sourceUnit !== a.unit ? ` · billed as ${a.sourceQuantity} ${a.sourceUnit}` : ""}`,
            factor: factorText,
            factorCitation: factor?.citation ?? "",
            arithmetic: factor
              ? `${formatQuantityMilli(shown)} ${a.unit} × ${formatFactorMicro(
                  factor.kgco2ePerUnitMicro,
                )} = ${formatTonnes(gco2e, 3)} tCO2e`
              : "",
            gco2e,
            documentId: a.documentId,
            documentName: a.filename,
          };
        }
      }

      if (sample.spendLineId) {
        const s = spendById.get(sample.spendLineId);
        if (s) {
          const label = s.eeioCategory
            ? (EEIO_BY_SLUG.get(s.eeioCategory)?.label ?? s.eeioCategory)
            : "uncategorised";
          return {
            source: `${label} — ${s.description}`,
            sourceDetail: `${formatCents(s.amountCents)}${s.glAccount ? ` · ${s.glAccount}` : ""}`,
            factor: factorText,
            factorCitation: factor?.citation ?? "",
            arithmetic: factor
              ? `${formatCents(s.amountCents)} × ${formatFactorMicro(
                  factor.kgco2ePerUnitMicro,
                )} kgCO2e/USD = ${formatTonnes(gco2e, 3)} tCO2e`
              : "",
            gco2e,
            documentId: s.documentId,
            documentName: s.filename,
          };
        }
      }

      return {
        source: sample.category,
        sourceDetail: "",
        factor: factorText,
        factorCitation: factor?.citation ?? "",
        arithmetic: "",
        gco2e,
        documentId: null,
        documentName: null,
      };
    });

  return {
    title: SCOPE_TITLE[scope],
    figure: `${formatTonnes(total)} tCO2e`,
    entries,
    more: Math.max(0, grouped.size - entries.length),
    note:
      scope === "3_spend"
        ? "A screening estimate. Spend-based factors are accurate to an order of magnitude, not to the tonne."
        : scope === "2_market"
          ? "Market-based Scope 2. Electricity covered by a contractual instrument is credited at zero for the covered volume."
          : "",
  };
}

/** The whole-footprint thread, behind the headline figure. */
export async function totalProvenance(periodId: string): Promise<ProvenanceThread> {
  const scopes: Scope[] = ["1", "2_market", "3_spend"];
  const threads = await Promise.all(scopes.map((s) => scopeProvenance(periodId, s, 12)));
  const total = threads.reduce(
    (a, th) => a + th.entries.reduce((b, e) => b + e.gco2e, 0),
    0,
  );
  return {
    title: "Reported total",
    figure: `${formatTonnes(total)} tCO2e`,
    entries: threads.flatMap((th) => th.entries).sort((a, b) => b.gco2e - a.gco2e).slice(0, 24),
    more: threads.reduce((a, th) => a + th.more, 0),
    note: "Scope 1 + market-based Scope 2 + the Scope 3 spend screen, per GHG Protocol dual reporting.",
  };
}
