/**
 * Organisation-level helpers: the forwarding address, the global category seed, and
 * the usage counter for the current period.
 */

import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  categories,
  organizations,
  usageCounters,
  type Category,
  type Organization,
  type UsageCounter,
} from "@/db/schema";
import { CATEGORY_SEEDS } from "@/lib/categorize";
import { env } from "@/lib/env";
import { periodOf, today, type Period } from "@/lib/dates";

/** `docs+acme@in.ledgerlens.app` — the one thing an operator has to remember. */
export function forwardingAddress(slug: string): string {
  return `docs+${slug}@${env.inboundEmailDomain}`;
}

/** Parse the slug back out of a recipient address. Returns null for anything else. */
export function slugFromAddress(to: string): string | null {
  const address = extractAddress(to);
  if (!address) return null;
  const [local, domain] = address.split("@");
  if (!local || !domain) return null;
  if (domain.toLowerCase() !== env.inboundEmailDomain.toLowerCase()) return null;
  const m = /^docs\+([a-z0-9-]{2,40})$/i.exec(local);
  return m ? m[1].toLowerCase() : null;
}

/** `"Books <docs+acme@in.ledgerlens.app>"` → `docs+acme@in.ledgerlens.app`. */
export function extractAddress(raw: string): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const angle = /<([^>]+)>/.exec(value);
  const candidate = (angle ? angle[1] : value).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "books"
  );
}

/**
 * A unique forwarding slug. It is public — it appears in an email address anyone
 * could see — so it must not be guessable *and* must be typeable: a readable root
 * plus four hex characters, which is exactly the trade a forwarding address needs.
 */
export async function uniqueForwardingSlug(base: string): Promise<string> {
  const db = getDb();
  const root = slugify(base);
  for (let attempt = 0; attempt < 20; attempt++) {
    const slug = `${root}-${randomBytes(2).toString("hex")}`;
    const [clash] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.forwardingSlug, slug));
    if (!clash) return slug;
  }
  return `${root}-${randomBytes(6).toString("hex")}`;
}

/**
 * Insert the global Schedule-C set if it is not already there. Idempotent, and
 * cheap enough to call on sign-up: a fresh clone that never ran a seed script still
 * gets categories.
 */
export async function ensureGlobalCategories(): Promise<void> {
  const db = getDb();
  await db
    .insert(categories)
    .values(
      CATEGORY_SEEDS.map((seed) => ({
        organizationId: null,
        slug: seed.slug,
        name: seed.name,
        scheduleCLine: seed.scheduleCLine,
        sort: seed.sort,
      })),
    )
    .onConflictDoNothing();
}

export async function listCategories(): Promise<Category[]> {
  return getDb()
    .select()
    .from(categories)
    .where(sql`${categories.organizationId} is null`)
    .orderBy(categories.sort);
}

export async function categoryBySlug(slug: string): Promise<Category | null> {
  const [row] = await getDb()
    .select()
    .from(categories)
    .where(and(eq(categories.slug, slug), sql`${categories.organizationId} is null`));
  return row ?? null;
}

/* ---------------------------------------------------------------- periods --- */

/** The period an organisation is currently in, in *its* timezone. */
export function currentPeriod(org: Pick<Organization, "timeZone">): Period {
  return periodOf(today(org.timeZone));
}

export async function usageFor(organizationId: string, period: Period): Promise<UsageCounter> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(usageCounters)
    .where(and(eq(usageCounters.organizationId, organizationId), eq(usageCounters.period, period)));
  if (existing) return existing;
  const [created] = await db
    .insert(usageCounters)
    .values({ organizationId, period })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [raced] = await db
    .select()
    .from(usageCounters)
    .where(and(eq(usageCounters.organizationId, organizationId), eq(usageCounters.period, period)));
  return raced;
}

export async function bumpUsage(
  organizationId: string,
  period: Period,
  delta: { ingested?: number; extracted?: number; costMicrocents?: number },
): Promise<void> {
  const db = getDb();
  await db
    .insert(usageCounters)
    .values({
      organizationId,
      period,
      documentsIngested: delta.ingested ?? 0,
      documentsExtracted: delta.extracted ?? 0,
      extractionCostMicrocents: delta.costMicrocents ?? 0,
    })
    .onConflictDoUpdate({
      target: [usageCounters.organizationId, usageCounters.period],
      set: {
        documentsIngested: sql`${usageCounters.documentsIngested} + ${delta.ingested ?? 0}`,
        documentsExtracted: sql`${usageCounters.documentsExtracted} + ${delta.extracted ?? 0}`,
        extractionCostMicrocents: sql`${usageCounters.extractionCostMicrocents} + ${delta.costMicrocents ?? 0}`,
        updatedAt: sql`now()`,
      },
    });
}
