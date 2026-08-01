/**
 * IRS 990-PF ingestion — the funder database's source of proposals.
 *
 * The IRS publishes machine-readable 990 filings for free, which is the only
 * reason a $59/mo product can have a funder database at all. This module is the
 * parsing and derivation half: filing XML in, proposed funder records and giving
 * history out.
 *
 * **What is and is not exercised here.** Fetching the IRS bulk indexes needs
 * outbound HTTP to apps.irs.gov, which this environment does not have, so the
 * fetch is behind a narrow `FilingSource` interface with two implementations: the
 * real HTTP one, and a fixture-backed one used by the tests and selected
 * automatically when no index URL is reachable. Everything that actually goes
 * wrong — the XML shapes, the money parsing, the derived signals, the idempotent
 * upsert — is pure and tested against a real 990-PF fragment.
 *
 * **Proposals only.** Nothing this file produces is ever visible to a member.
 * Records land at `curation_status = "proposed"`; a human flips them to
 * `approved`. Automate proposals, never approvals.
 */

import { XMLParser } from "fast-xml-parser";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { funderAwards, funders } from "@/db/schema";
import { civil, type CivilDate } from "@/lib/dates";

/* ------------------------------------------------------------------ types --- */

export interface ParsedGrant {
  recipientName: string;
  recipientState: string | null;
  amountCents: number;
  purposeExcerpt: string | null;
}

export interface ParsedFiling {
  ein: string;
  name: string;
  city: string | null;
  state: string | null;
  taxYear: number;
  grants: ParsedGrant[];
}

export interface DerivedSignals {
  /** p25 and p75 of grant amounts — the band a fit score compares an ask to. */
  grantSizeMinCents: number | null;
  grantSizeMaxCents: number | null;
  /** Share of this year's grantees that do not appear in the prior years. */
  newGranteeShare: number | null;
  statesFunded: string[];
  /** The filing's tax year expressed as a date, NOT the ingest run date. */
  dataFreshnessAt: CivilDate;
}

/* ---------------------------------------------------------------- parsing --- */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
});

/** An XML element as fast-xml-parser hands it back. */
type Node = Record<string, unknown>;

/**
 * fast-xml-parser gives a single object for one occurrence and an array for several,
 * so every accessor has to cope with both. Getting this wrong is how a parser works
 * on the filing you tested and silently drops rows on the next one.
 */
function firstNode(value: unknown): Node | undefined {
  if (value === undefined || value === null) return undefined;
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "object" && candidate !== null ? (candidate as Node) : undefined;
}

function nodeArray(value: unknown): Node[] {
  if (value === undefined || value === null) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.filter((v): v is Node => typeof v === "object" && v !== null);
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const inner = (value as Record<string, unknown>)["#text"];
    if (typeof inner === "string") return inner.trim() || null;
  }
  return null;
}

/**
 * Dollars in a 990 are whole dollars written as text: "25000", "25,000",
 * sometimes "25000.00". Converted to integer cents here, once, and never touched
 * as a float again.
 */
export function parse990Amount(raw: unknown): number | null {
  const value = text(raw);
  if (!value) return null;
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const dollars = Number(cleaned);
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  return Math.round(dollars * 100);
}

/** "12-3456789" — the canonical display and dedupe form. */
export function normalizeEin(raw: unknown): string | null {
  const value = text(raw);
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 9) return null;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

/**
 * Pull one 990-PF filing into a shape the upsert understands.
 *
 * Returns null rather than throwing on anything unrecognisable — a malformed
 * filing in a batch of thousands must skip, not abort the batch — and the caller
 * counts skips so a parser that silently stops working is visible.
 */
export function parse990PF(xml: string): ParsedFiling | null {
  let doc: Node;
  try {
    doc = parser.parse(xml) as Node;
  } catch {
    return null;
  }

  const returnNode = firstNode(doc.Return ?? doc.return);
  if (!returnNode) return null;

  const header = firstNode(returnNode.ReturnHeader);
  const data = firstNode(returnNode.ReturnData);
  if (!header || !data) return null;

  const filer = firstNode(header.Filer);
  const resolvedEin = normalizeEin(header.EIN) ?? (filer ? normalizeEin(filer.EIN) : null);
  if (!resolvedEin) return null;

  const businessName = firstNode(filer?.BusinessName);
  const name =
    text(businessName?.BusinessNameLine1Txt) ??
    text(businessName?.BusinessNameLine1) ??
    text(filer?.Name) ??
    null;
  if (!name) return null;

  const address = firstNode(filer?.USAddress);

  const taxYearRaw =
    text(header.TaxYr) ?? text(header.TaxPeriodEndDt)?.slice(0, 4) ?? null;
  const taxYear = taxYearRaw ? Number(taxYearRaw.slice(0, 4)) : NaN;
  if (!Number.isFinite(taxYear)) return null;

  const pf = firstNode(data.IRS990PF);
  const supplementary = firstNode(pf?.SupplementaryInformationGrp);
  const grantSchedule = nodeArray(
    supplementary?.GrantOrContributionPdDurYrGrp ?? pf?.GrantOrContributionPdDurYrGrp,
  );

  const grants: ParsedGrant[] = [];
  for (const entry of grantSchedule) {
    const recipientBusiness = firstNode(entry.RecipientBusinessName);
    const recipientName =
      text(recipientBusiness?.BusinessNameLine1Txt) ??
      text(recipientBusiness?.BusinessNameLine1) ??
      text(entry.RecipientPersonNm) ??
      text(entry.RecipientNameBusiness) ??
      null;
    const amountCents = parse990Amount(entry.Amt ?? entry.AmountOfGrant);
    if (!recipientName || amountCents === null) continue;

    const recipientAddress = firstNode(entry.RecipientUSAddress);
    grants.push({
      recipientName,
      recipientState: text(recipientAddress?.StateAbbreviationCd),
      amountCents,
      purposeExcerpt: text(entry.GrantOrContributionPurposeTxt)?.slice(0, 240) ?? null,
    });
  }

  return {
    ein: resolvedEin,
    name,
    city: text(address?.CityNm),
    state: text(address?.StateAbbreviationCd),
    taxYear,
    grants,
  };
}

/* --------------------------------------------------------------- derivation --- */

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low];
  return Math.round(sorted[low] + (sorted[high] - sorted[low]) * (index - low));
}

/**
 * The signals a fit score depends on.
 *
 * The size band is p25-p75 rather than min-max because a foundation's smallest
 * grant is usually a $250 table sponsorship and its largest is a one-off capital
 * gift; neither tells a small nonprofit what to ask for.
 *
 * `newGranteeShare` needs prior-year names to mean anything. With no history it
 * returns null — "we don't know" — and the fit score renders that as unknown
 * rather than scoring it as bad.
 */
export function deriveSignals(
  filing: ParsedFiling,
  priorRecipients: readonly string[],
): DerivedSignals {
  const amounts = filing.grants.map((g) => g.amountCents).sort((a, b) => a - b);
  const states = Array.from(
    new Set(
      filing.grants
        .map((g) => g.recipientState)
        .filter((s): s is string => !!s && /^[A-Z]{2}$/.test(s)),
    ),
  ).sort();

  let newGranteeShare: number | null = null;
  if (priorRecipients.length && filing.grants.length) {
    const prior = new Set(priorRecipients.map(normalizeRecipient));
    const names = Array.from(new Set(filing.grants.map((g) => normalizeRecipient(g.recipientName))));
    const fresh = names.filter((n) => !prior.has(n)).length;
    newGranteeShare = Math.round((fresh / names.length) * 100) / 100;
  }

  return {
    grantSizeMinCents: amounts.length ? percentile(amounts, 0.25) : null,
    grantSizeMaxCents: amounts.length ? percentile(amounts, 0.75) : null,
    newGranteeShare,
    statesFunded: states,
    // The filing's own year, so a 2023 filing ingested today reads as 2023 data.
    dataFreshnessAt: civil(filing.taxYear, 12, 31),
  };
}

/** Recipient names vary in punctuation and case between filings. */
export function normalizeRecipient(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|incorporated|llc|the|a)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/* -------------------------------------------------------------- filing source --- */

export interface FilingSource {
  /** Filing XML documents for a tax year, as strings. */
  filings(taxYear: number, states: string[]): AsyncIterable<string>;
  readonly kind: "http" | "fixture";
}

/**
 * The real source. Unexercised here: there is no outbound route to apps.irs.gov
 * in this environment, and pretending otherwise would mean shipping an untested
 * code path that looks tested.
 */
export function httpFilingSource(indexUrl: string): FilingSource {
  return {
    kind: "http",
    async *filings(taxYear: number, states: string[]): AsyncIterable<string> {
      const indexResponse = await fetch(`${indexUrl}/${taxYear}/index.json`, {
        headers: { accept: "application/json" },
      });
      if (!indexResponse.ok) {
        throw new Error(`IRS index ${taxYear} returned ${indexResponse.status}`);
      }
      const index = (await indexResponse.json()) as {
        Filings?: { ObjectId: string; ReturnType?: string; State?: string }[];
      };
      const wanted = (index.Filings ?? []).filter(
        (f) =>
          (f.ReturnType ?? "").includes("990PF") &&
          (!states.length || !f.State || states.includes(f.State)),
      );
      for (const filing of wanted) {
        const res = await fetch(`${indexUrl}/${taxYear}/${filing.ObjectId}_public.xml`);
        if (!res.ok) continue;
        yield await res.text();
      }
    },
  };
}

export function fixtureFilingSource(documents: string[]): FilingSource {
  return {
    kind: "fixture",
    async *filings(): AsyncIterable<string> {
      for (const doc of documents) yield doc;
    },
  };
}

/* ------------------------------------------------------------------ upsert --- */

export interface IngestSummary {
  filingsRead: number;
  filingsSkipped: number;
  fundersProposed: number;
  fundersUpdated: number;
  fundersLeftAlone: number;
  awardsInserted: number;
}

/**
 * Upsert one filing.
 *
 * Idempotent in both directions the ROADMAP asks about: the funder is keyed on
 * EIN, and each award line is keyed on (funder, year, recipient, amount), so
 * re-running the same filing inserts nothing. And an **approved** record's
 * member-facing fields are never overwritten by a machine — the whole value of
 * curation is that a human's edit sticks.
 */
export async function upsertFiling(
  filing: ParsedFiling,
  signals: DerivedSignals,
): Promise<{ status: "proposed" | "updated" | "left_alone"; awardsInserted: number }> {
  const db = getDb();

  const [existing] = await db.select().from(funders).where(eq(funders.ein, filing.ein));

  let funderId: string;
  let status: "proposed" | "updated" | "left_alone";

  if (!existing) {
    const [row] = await db
      .insert(funders)
      .values({
        name: filing.name,
        ein: filing.ein,
        kind: "private_foundation",
        city: filing.city,
        state: filing.state,
        statesFunded: signals.statesFunded,
        causeCodes: [], // a human assigns these; 990 NTEE codes are too coarse
        grantSizeMinCents: signals.grantSizeMinCents,
        grantSizeMaxCents: signals.grantSizeMaxCents,
        acceptsUnsolicited: null,
        newGranteeShare: signals.newGranteeShare,
        dataFreshnessAt: signals.dataFreshnessAt,
        curationStatus: "proposed",
        isSample: false,
      })
      .returning();
    funderId = row.id;
    status = "proposed";
  } else if (existing.curationStatus === "approved") {
    // Approved records keep their curated fields. Only the giving history grows.
    funderId = existing.id;
    status = "left_alone";
  } else {
    await db
      .update(funders)
      .set({
        name: filing.name,
        city: filing.city,
        state: filing.state,
        statesFunded: signals.statesFunded,
        grantSizeMinCents: signals.grantSizeMinCents,
        grantSizeMaxCents: signals.grantSizeMaxCents,
        newGranteeShare: signals.newGranteeShare,
        dataFreshnessAt: signals.dataFreshnessAt,
        version: sql`${funders.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(funders.id, existing.id));
    funderId = existing.id;
    status = "updated";
  }

  let awardsInserted = 0;
  if (filing.grants.length) {
    const inserted = await db
      .insert(funderAwards)
      .values(
        filing.grants.map((g) => ({
          funderId,
          taxYear: filing.taxYear,
          recipientName: g.recipientName,
          recipientState: g.recipientState,
          amountCents: g.amountCents,
          purposeExcerpt: g.purposeExcerpt,
        })),
      )
      .onConflictDoNothing({
        target: [
          funderAwards.funderId,
          funderAwards.taxYear,
          funderAwards.recipientName,
          funderAwards.amountCents,
        ],
      })
      .returning({ id: funderAwards.id });
    awardsInserted = inserted.length;
  }

  return { status, awardsInserted };
}

/** Prior-year recipient names for a funder, used to derive newGranteeShare. */
export async function priorRecipients(ein: string, beforeYear: number): Promise<string[]> {
  const db = getDb();
  const [funder] = await db.select({ id: funders.id }).from(funders).where(eq(funders.ein, ein));
  if (!funder) return [];
  const rows = await db
    .select({ recipientName: funderAwards.recipientName })
    .from(funderAwards)
    .where(and(eq(funderAwards.funderId, funder.id), sql`${funderAwards.taxYear} < ${beforeYear}`));
  return rows.map((r) => r.recipientName);
}

/** Run a batch. `source` decides whether this touches the network at all. */
export async function ingestFilings(
  source: FilingSource,
  taxYear: number,
  states: string[],
): Promise<IngestSummary> {
  const summary: IngestSummary = {
    filingsRead: 0,
    filingsSkipped: 0,
    fundersProposed: 0,
    fundersUpdated: 0,
    fundersLeftAlone: 0,
    awardsInserted: 0,
  };

  for await (const xml of source.filings(taxYear, states)) {
    const filing = parse990PF(xml);
    if (!filing) {
      summary.filingsSkipped++;
      continue;
    }
    summary.filingsRead++;
    const prior = await priorRecipients(filing.ein, filing.taxYear);
    const signals = deriveSignals(filing, prior);
    const result = await upsertFiling(filing, signals);
    if (result.status === "proposed") summary.fundersProposed++;
    else if (result.status === "updated") summary.fundersUpdated++;
    else summary.fundersLeftAlone++;
    summary.awardsInserted += result.awardsInserted;
  }

  return summary;
}
