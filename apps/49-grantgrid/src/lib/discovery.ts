/**
 * Discovery: filtering the curated funder database and scoring what comes back.
 *
 * Only `approved` records are ever visible to a member — `proposed` records are
 * machine-generated from 990 filings and have not been read by a human, which is
 * exactly the difference between a curated database and a scrape.
 *
 * Every record also carries `isSample`. The funders shipped with this build are
 * illustrative, and the UI marks them so on every card. Presenting invented
 * foundations as live opportunities would waste the scarcest thing a small
 * nonprofit has, which is the hours of the one person who writes the grants.
 */

import { and, asc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { funderAwards, funders, grants, type Funder } from "@/db/schema";
import { NATIONAL, scoreFunder, type FitScore, type ScoringProfile } from "@/lib/fit-score";
import { formatMonthYearUpper } from "@/lib/dates";
import { formatCentsCompact } from "@/lib/money";

export interface DiscoveryFilters {
  state: string | null;
  cause: string | null;
  /** Minimum top-of-range grant size, in cents. */
  minSizeCents: number | null;
  query: string | null;
}

export const SIZE_FILTERS = [
  { code: "any", label: "Any size", minCents: null },
  { code: "5k", label: "$5k+", minCents: 500_000 },
  { code: "25k", label: "$25k+", minCents: 2_500_000 },
  { code: "100k", label: "$100k+", minCents: 10_000_000 },
] as const;

export function sizeFilterFor(code: string | null): number | null {
  return SIZE_FILTERS.find((s) => s.code === code)?.minCents ?? null;
}

export interface DiscoveryResult {
  funder: Funder;
  score: FitScore | null;
  /** True when this funder is already in the org's pipeline. */
  inPipeline: boolean;
  /** "Youth programs · OH/MI · typically $5–25k" */
  profileLine: string;
  freshnessLine: string;
  recentAwards: { recipientName: string; recipientState: string | null; amountCents: number; taxYear: number }[];
}

/** "Youth development, education · OH/MI · typically $5k–$25k" */
export function profileLine(funder: Funder, causeLabels: (code: string) => string): string {
  const causes = funder.causeCodes.slice(0, 2).map(causeLabels).join(", ");
  const geo = funder.statesFunded.includes(NATIONAL)
    ? "national"
    : funder.statesFunded.slice(0, 3).join("/");
  const size =
    funder.grantSizeMinCents && funder.grantSizeMaxCents
      ? `typically ${formatCentsCompact(funder.grantSizeMinCents)}–${formatCentsCompact(funder.grantSizeMaxCents)}`
      : funder.grantSizeMaxCents
        ? `up to ${formatCentsCompact(funder.grantSizeMaxCents)}`
        : "grant size not published";
  return [causes || "cause areas not recorded", geo || "geography not recorded", size]
    .filter(Boolean)
    .join(" · ");
}

/** "DATA REVIEWED MAY 2026" — or an honest admission that it has not been. */
export function freshnessLine(funder: Funder): string {
  if (!funder.dataFreshnessAt) return "FRESHNESS NOT RECORDED";
  return `DATA REVIEWED ${formatMonthYearUpper(funder.dataFreshnessAt)}`;
}

export async function searchFunders(
  organizationId: string,
  profile: ScoringProfile,
  profileVersion: number,
  filters: DiscoveryFilters,
  causeLabels: (code: string) => string,
  limit = 30,
): Promise<DiscoveryResult[]> {
  const db = getDb();

  const conditions = [eq(funders.curationStatus, "approved")];
  if (filters.state) {
    // A funder that gives nationally matches every state filter.
    conditions.push(
      or(
        sql`${funders.statesFunded} @> ARRAY[${filters.state}]::text[]`,
        sql`${funders.statesFunded} @> ARRAY[${NATIONAL}]::text[]`,
      )!,
    );
  }
  if (filters.cause) {
    conditions.push(sql`${funders.causeCodes} @> ARRAY[${filters.cause}]::text[]`);
  }
  if (filters.minSizeCents) {
    conditions.push(gte(funders.grantSizeMaxCents, filters.minSizeCents));
  }
  if (filters.query) {
    conditions.push(ilike(funders.name, `%${filters.query}%`));
  }

  const rows = await db
    .select()
    .from(funders)
    .where(and(...conditions))
    .orderBy(asc(funders.name))
    .limit(limit);

  if (!rows.length) return [];

  const pipelineFunderIds = new Set(
    (
      await db
        .select({ funderId: grants.funderId })
        .from(grants)
        .where(eq(grants.organizationId, organizationId))
    )
      .map((r) => r.funderId)
      .filter((id): id is string => !!id),
  );

  const awards = await db
    .select()
    .from(funderAwards)
    .where(inArray(funderAwards.funderId, rows.map((f) => f.id)))
    .orderBy(asc(funderAwards.recipientName));

  const results = rows.map((funder) => ({
    funder,
    score: scoreFunder(profile, funder, {
      profileVersion,
      funderVersion: funder.version,
    }),
    inPipeline: pipelineFunderIds.has(funder.id),
    profileLine: profileLine(funder, causeLabels),
    freshnessLine: freshnessLine(funder),
    recentAwards: awards
      .filter((a) => a.funderId === funder.id)
      .slice(0, 4)
      .map((a) => ({
        recipientName: a.recipientName,
        recipientState: a.recipientState,
        amountCents: a.amountCents,
        taxYear: a.taxYear,
      })),
  }));

  // Best fit first when scoring is possible; alphabetical when it is not, since
  // an arbitrary order would imply a ranking the app cannot justify.
  if (results.every((r) => r.score === null)) return results;
  return results.sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));
}

export async function getFunder(funderId: string): Promise<Funder | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(funders)
    .where(and(eq(funders.id, funderId), eq(funders.curationStatus, "approved")));
  return row ?? null;
}

/** Counts for the discovery header, so the coverage claim is never inflated. */
export async function coverage(): Promise<{ approved: number; states: string[] }> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(funders)
    .where(eq(funders.curationStatus, "approved"));
  const stateRows = await db
    .select({ state: sql<string>`unnest(${funders.statesFunded})` })
    .from(funders)
    .where(eq(funders.curationStatus, "approved"));
  const states = Array.from(new Set(stateRows.map((r) => r.state))).sort();
  return { approved: row?.count ?? 0, states };
}

/** The states an org can filter by, from the data that actually exists. */
export async function fundedStates(): Promise<string[]> {
  return (await coverage()).states.filter((s) => s !== NATIONAL);
}
