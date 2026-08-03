/**
 * Jurisdiction lookup, coverage, watching, and the address -> authority guess.
 *
 * City limits are not intuition — a Mesa mailing address can sit in unincorporated
 * county — so the product never silently decides which authority a job belongs to.
 * It suggests, shows why it suggested, and makes the office confirm.
 *
 * Geocoding is behind a narrow interface with two implementations: Mapbox when
 * MAPBOX_TOKEN is set, and a text match against the covered corpus when it is not.
 * The UI says which one answered.
 */

import { and, asc, count, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  jurisdictionSources,
  jurisdictionWatches,
  jurisdictions,
  requirementRecords,
  type CoverageStatus,
  type Jurisdiction,
  type JurisdictionSource,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { appError } from "@/lib/errors";
import { has } from "@/lib/env";
import { checkWatches } from "@/lib/plans";
import type { Plan } from "@/db/schema";

export interface JurisdictionListItem {
  jurisdiction: Jurisdiction;
  recordCount: number;
  watched: boolean;
}

/**
 * The jurisdiction index. Record counts come from a grouped query rather than a
 * correlated subquery in the select list: an unqualified column inside a
 * select-list fragment binds to the subquery's own alias and returns zeros
 * forever, which is a silent and very convincing bug.
 */
export async function listJurisdictions(input: {
  organizationId: string;
  search?: string | null;
  coverage?: CoverageStatus | null;
  limit?: number;
}): Promise<JurisdictionListItem[]> {
  const db = getDb();
  const term = input.search?.trim();

  const filters = [
    term ? or(ilike(jurisdictions.name, `%${term}%`), ilike(jurisdictions.county, `%${term}%`)) : undefined,
    input.coverage ? eq(jurisdictions.coverageStatus, input.coverage) : undefined,
  ].filter(Boolean);

  const rows = await db
    .select()
    .from(jurisdictions)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(jurisdictions.name))
    .limit(input.limit ?? 200);

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const counts = await db
    .select({ jurisdictionId: requirementRecords.jurisdictionId, total: count() })
    .from(requirementRecords)
    .where(
      and(
        inArray(requirementRecords.jurisdictionId, ids),
        isNull(requirementRecords.supersededBy),
      ),
    )
    .groupBy(requirementRecords.jurisdictionId);

  const watched = await db
    .select({ jurisdictionId: jurisdictionWatches.jurisdictionId })
    .from(jurisdictionWatches)
    .where(
      and(
        eq(jurisdictionWatches.organizationId, input.organizationId),
        inArray(jurisdictionWatches.jurisdictionId, ids),
      ),
    );
  const watchedSet = new Set(watched.map((w) => w.jurisdictionId));

  return rows.map((jurisdiction) => ({
    jurisdiction,
    recordCount: Number(counts.find((c) => c.jurisdictionId === jurisdiction.id)?.total ?? 0),
    watched: watchedSet.has(jurisdiction.id),
  }));
}

export async function getJurisdictionBySlug(slug: string): Promise<Jurisdiction | null> {
  const db = getDb();
  const [row] = await db.select().from(jurisdictions).where(eq(jurisdictions.slug, slug));
  return row ?? null;
}

export async function getJurisdictionById(id: string): Promise<Jurisdiction | null> {
  const db = getDb();
  const [row] = await db.select().from(jurisdictions).where(eq(jurisdictions.id, id));
  return row ?? null;
}

export async function listSources(jurisdictionId: string): Promise<JurisdictionSource[]> {
  const db = getDb();
  return db
    .select()
    .from(jurisdictionSources)
    .where(eq(jurisdictionSources.jurisdictionId, jurisdictionId))
    .orderBy(asc(jurisdictionSources.label));
}

export async function isWatched(organizationId: string, jurisdictionId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: jurisdictionWatches.id })
    .from(jurisdictionWatches)
    .where(
      and(
        eq(jurisdictionWatches.organizationId, organizationId),
        eq(jurisdictionWatches.jurisdictionId, jurisdictionId),
      ),
    );
  return Boolean(row);
}

export async function countWatches(organizationId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ total: count() })
    .from(jurisdictionWatches)
    .where(eq(jurisdictionWatches.organizationId, organizationId));
  return Number(row?.total ?? 0);
}

/** Watch a jurisdiction, metered by plan. */
export async function watchJurisdiction(input: {
  organizationId: string;
  jurisdictionId: string;
  plan: Plan;
  actorUserId: string;
}): Promise<void> {
  const used = await countWatches(input.organizationId);
  const gate = checkWatches(input.plan, used);
  if (!gate.allowed) throw appError(gate.message ?? "Watch limit reached on this plan");

  const db = getDb();
  await db
    .insert(jurisdictionWatches)
    .values({ organizationId: input.organizationId, jurisdictionId: input.jurisdictionId })
    .onConflictDoNothing({
      target: [jurisdictionWatches.organizationId, jurisdictionWatches.jurisdictionId],
    });
  await recordAudit({
    action: "jurisdiction.watched",
    target: `jurisdiction:${input.jurisdictionId}`,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });
}

export async function unwatchJurisdiction(input: {
  organizationId: string;
  jurisdictionId: string;
}): Promise<void> {
  const db = getDb();
  await db
    .delete(jurisdictionWatches)
    .where(
      and(
        eq(jurisdictionWatches.organizationId, input.organizationId),
        eq(jurisdictionWatches.jurisdictionId, input.jurisdictionId),
      ),
    );
}

export async function watchedJurisdictions(organizationId: string): Promise<Jurisdiction[]> {
  const db = getDb();
  const rows = await db
    .select({ jurisdiction: jurisdictions })
    .from(jurisdictionWatches)
    .innerJoin(jurisdictions, eq(jurisdictions.id, jurisdictionWatches.jurisdictionId))
    .where(eq(jurisdictionWatches.organizationId, organizationId))
    .orderBy(asc(jurisdictions.name));
  return rows.map((r) => r.jurisdiction);
}

export interface CoverageSummary {
  jurisdictions: number;
  curated: number;
  records: number;
  /** Records verified within the last 90 days — the corpus freshness promise. */
  freshRecords: number;
}

export async function coverageSummary(): Promise<CoverageSummary> {
  const db = getDb();
  const [totals] = await db
    .select({
      jurisdictions: count(),
      curated: sql<number>`count(*) filter (where ${jurisdictions.coverageStatus} = 'curated')`,
    })
    .from(jurisdictions);
  const [records] = await db
    .select({
      total: count(),
      fresh: sql<number>`count(*) filter (where ${requirementRecords.verifiedAt} > now() - interval '90 days')`,
    })
    .from(requirementRecords)
    .where(isNull(requirementRecords.supersededBy));

  return {
    jurisdictions: Number(totals?.jurisdictions ?? 0),
    curated: Number(totals?.curated ?? 0),
    records: Number(records?.total ?? 0),
    freshRecords: Number(records?.fresh ?? 0),
  };
}

/* ------------------------------------------------------------------ *
 * Address -> authority
 * ------------------------------------------------------------------ */

export interface JurisdictionSuggestion {
  jurisdiction: Jurisdiction;
  /** Why this one came up, shown to the user verbatim. */
  reason: string;
  confidence: "high" | "medium" | "low";
}

export interface Geocoder {
  /** Place names, most specific first, for a free-text address. */
  placeNames(address: string): Promise<string[]>;
  name: "mapbox" | "text-match";
}

/** Mapbox forward geocoding, used only when a token is configured. */
export function mapboxGeocoder(token: string): Geocoder {
  return {
    name: "mapbox",
    async placeNames(address: string): Promise<string[]> {
      const url = new URL(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`,
      );
      url.searchParams.set("access_token", token);
      url.searchParams.set("country", "us");
      url.searchParams.set("types", "address,place,locality,district");
      url.searchParams.set("limit", "1");
      const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!response.ok) throw new Error(`Mapbox returned HTTP ${response.status}`);
      const body = (await response.json()) as {
        features?: { context?: { text?: string }[]; text?: string }[];
      };
      const feature = body.features?.[0];
      if (!feature) return [];
      return [feature.text, ...(feature.context ?? []).map((c) => c.text)].filter(
        (v): v is string => Boolean(v),
      );
    },
  };
}

/**
 * The no-token implementation: read the place name out of the address text. It is
 * weaker than geocoding and says so — the suggestion carries "matched from the
 * address text" and the user still confirms.
 */
export function textMatchGeocoder(): Geocoder {
  return {
    name: "text-match",
    async placeNames(address: string): Promise<string[]> {
      return address
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .reverse();
    },
  };
}

export function defaultGeocoder(): Geocoder {
  const token = process.env.MAPBOX_TOKEN;
  return has("MAPBOX_TOKEN") && token ? mapboxGeocoder(token) : textMatchGeocoder();
}

/**
 * Suggest the authority for a job site. Never returns a single answer as a
 * decision: the caller shows candidates, and an unmatched address gets the
 * county's card and a coverage request rather than a guess.
 */
export async function suggestJurisdictions(
  address: string,
  geocoder: Geocoder = defaultGeocoder(),
): Promise<JurisdictionSuggestion[]> {
  const trimmed = address.trim();
  if (trimmed.length < 4) return [];

  let names: string[] = [];
  let reasonPrefix = "";
  try {
    names = await geocoder.placeNames(trimmed);
    reasonPrefix = geocoder.name === "mapbox" ? "Geocoded to" : "Matched from the address text:";
  } catch {
    names = await textMatchGeocoder().placeNames(trimmed);
    reasonPrefix = "Geocoding was unavailable — matched from the address text:";
  }

  const db = getDb();
  const all = await db.select().from(jurisdictions).orderBy(asc(jurisdictions.name));
  const suggestions: JurisdictionSuggestion[] = [];

  for (const name of names) {
    const needle = name.toLowerCase();
    if (needle.length < 3) continue;
    for (const jurisdiction of all) {
      if (suggestions.some((s) => s.jurisdiction.id === jurisdiction.id)) continue;
      const core = jurisdiction.name
        .replace(/^(city|town) of /i, "")
        .replace(/ \(unincorporated\)$/i, "")
        .toLowerCase();
      if (core === needle) {
        suggestions.push({
          jurisdiction,
          reason: `${reasonPrefix} ${name}`,
          confidence: geocoder.name === "mapbox" ? "high" : "medium",
        });
      }
    }
  }

  // Always offer the county as the fallback authority: an address inside a city's
  // mailing area but outside its limits is permitted by the county, and that
  // mistake is one of the most expensive in the business.
  for (const name of names) {
    const county = all.find(
      (j) =>
        j.kind === "county" &&
        (j.county ?? "").toLowerCase() === name.toLowerCase().replace(" county", ""),
    );
    if (county && !suggestions.some((s) => s.jurisdiction.id === county.id)) {
      suggestions.push({
        jurisdiction: county,
        reason: "Unincorporated parcels in this area are permitted by the county",
        confidence: "low",
      });
    }
  }

  return suggestions.slice(0, 4);
}
