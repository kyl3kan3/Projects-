/**
 * Lists: creation, lookup, and the read models the hosted page and the builder
 * preview both use.
 */

import { and, asc, count as countRows, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb } from "@/db";
import {
  events,
  lists,
  rewards,
  signups,
  type List,
  type ListTheme,
  type Reward,
  type TemplateId,
  type User,
} from "@/db/schema";
import { isReservedSlug, slugify } from "@/lib/format";
import { DEFAULT_REWARD_TIERS, type RewardTier } from "@/lib/referrals";
import { DEFAULT_THEME, sanitizeTheme, starterContent } from "@/lib/templates";
import { env } from "@/lib/env";
import { listCapacity, plan } from "@/lib/plans";

export async function uniqueSlug(base: string): Promise<string> {
  const db = getDb();
  const root = slugify(base);
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = attempt === 0 ? root : `${root}-${randomBytes(2).toString("hex")}`;
    if (isReservedSlug(candidate)) continue;
    const [clash] = await db.select({ id: lists.id }).from(lists).where(eq(lists.slug, candidate));
    if (!clash) return candidate;
  }
  return `${root}-${randomBytes(4).toString("hex")}`;
}

export async function countLists(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: countRows() })
    .from(lists)
    .where(and(eq(lists.userId, userId), ne(lists.status, "archived")));
  return Number(row?.n ?? 0);
}

export async function createList(
  user: User,
  input: { name: string; slug?: string; template?: TemplateId },
): Promise<List> {
  const name = input.name.trim();
  if (name.length < 2) throw new Error("Give the list a product name");

  const capacity = listCapacity(user.plan, await countLists(user.id));
  if (!capacity.allowed) throw new Error(capacity.reason);

  const db = getDb();
  const slug = await uniqueSlug(input.slug?.trim() || name);
  const content = starterContent(name);

  const [list] = await db
    .insert(lists)
    .values({
      userId: user.id,
      name,
      slug,
      template: input.template ?? "marquee",
      headline: content.headline,
      subhead: content.subhead,
      ctaLabel: content.ctaLabel,
      proofLine: content.proofLine,
      theme: DEFAULT_THEME,
      // Free pages keep the badge; the toggle is gated, not hidden.
      badgeHidden: false,
    })
    .returning();

  // A referral engine with no rewards is just a form, so every list ships with
  // the default ladder. The founder can edit or delete them.
  await db.insert(rewards).values(
    DEFAULT_REWARD_TIERS.map((tier) => ({
      listId: list.id,
      threshold: tier.threshold,
      label: tier.label,
      description: tier.description ?? "",
    })),
  );

  return list;
}

export async function listsFor(userId: string): Promise<List[]> {
  const db = getDb();
  return db
    .select()
    .from(lists)
    .where(eq(lists.userId, userId))
    .orderBy(desc(lists.createdAt));
}

export async function listById(id: string): Promise<List | null> {
  const db = getDb();
  const [row] = await db.select().from(lists).where(eq(lists.id, id));
  return row ?? null;
}

/** Load a list the signed-in founder owns, or null — never leak someone else's. */
export async function ownedList(userId: string, id: string): Promise<List | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(lists)
    .where(and(eq(lists.id, id), eq(lists.userId, userId)));
  return row ?? null;
}

export async function listBySlug(slug: string): Promise<List | null> {
  const db = getDb();
  const [row] = await db.select().from(lists).where(eq(lists.slug, slug));
  return row ?? null;
}

/** Resolve a verified custom domain to its list (middleware's job). */
export async function listByDomain(domain: string): Promise<List | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(lists)
    .where(and(eq(lists.customDomain, domain.toLowerCase()), eq(lists.customDomainVerified, true)));
  return row ?? null;
}

export async function rewardsFor(listId: string): Promise<Reward[]> {
  const db = getDb();
  return db.select().from(rewards).where(eq(rewards.listId, listId)).orderBy(asc(rewards.threshold));
}

export function toRewardTiers(rows: Reward[]): RewardTier[] {
  return rows.map((r) => ({
    id: r.id,
    threshold: r.threshold,
    label: r.label,
    description: r.description,
  }));
}

export async function updateListContent(
  listId: string,
  patch: {
    name?: string;
    headline?: string;
    subhead?: string;
    ctaLabel?: string;
    proofLine?: string;
    template?: TemplateId;
    theme?: Partial<ListTheme>;
  },
): Promise<void> {
  const db = getDb();
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.headline !== undefined) set.headline = patch.headline.trim().slice(0, 140);
  if (patch.subhead !== undefined) set.subhead = patch.subhead.trim().slice(0, 400);
  if (patch.ctaLabel !== undefined) set.ctaLabel = patch.ctaLabel.trim().slice(0, 40) || "Join the waitlist";
  if (patch.proofLine !== undefined) set.proofLine = patch.proofLine.trim().slice(0, 160);
  if (patch.template !== undefined) set.template = patch.template;
  if (patch.theme !== undefined) set.theme = sanitizeTheme(patch.theme);
  if (!Object.keys(set).length) return;
  await db.update(lists).set(set).where(eq(lists.id, listId));
}

/* ------------------------------------------------------------------- URLs --- */

/**
 * The canonical public URL for a list.
 *
 * Order of preference: verified custom domain, then the wildcard subdomain when
 * one is configured, then the always-available path form. The path form has to
 * keep working — locally there are no wildcard DNS records, and a founder who
 * has not set up a domain still needs a link to paste.
 */
export function pageUrl(list: Pick<List, "slug" | "customDomain" | "customDomainVerified">): string {
  if (list.customDomain && list.customDomainVerified) return `https://${list.customDomain}`;
  const appUrl = env.appUrl.replace(/\/+$/, "");
  const domain = env.pagesDomain;
  // Only claim a subdomain when the app is actually deployed under that apex.
  if (domain && appUrl.includes(domain)) return `https://${list.slug}.${domain}`;
  return `${appUrl}/l/${list.slug}`;
}

export function positionUrl(
  list: Pick<List, "slug" | "customDomain" | "customDomainVerified">,
  code: string,
): string {
  return `${pageUrl(list)}/joined/${code}`;
}

/* --------------------------------------------------------------- counters --- */

export interface ListCounters {
  active: number;
  pending: number;
  review: number;
  blocked: number;
  unsubscribed: number;
  /** Everything that occupies a queue position. */
  inQueue: number;
  creditedReferrals: number;
  pageViews: number;
  today: number;
}

export async function listCounters(listId: string): Promise<ListCounters> {
  const db = getDb();
  const [row] = await db
    .select({
      active: sql<number>`count(*) filter (where ${signups.status} = 'active')`,
      pending: sql<number>`count(*) filter (where ${signups.status} = 'pending')`,
      review: sql<number>`count(*) filter (where ${signups.status} = 'review')`,
      blocked: sql<number>`count(*) filter (where ${signups.status} = 'blocked')`,
      unsubscribed: sql<number>`count(*) filter (where ${signups.status} = 'unsubscribed')`,
      inQueue: sql<number>`count(*) filter (where ${signups.status} in ('active','review','unsubscribed'))`,
      credited: sql<number>`count(*) filter (where ${signups.referralCredited} = true)`,
      today: sql<number>`count(*) filter (where ${signups.createdAt} > now() - interval '24 hours' and ${signups.status} <> 'blocked')`,
    })
    .from(signups)
    .where(eq(signups.listId, listId));

  const [views] = await db
    .select({ n: countRows() })
    .from(events)
    .where(and(eq(events.listId, listId), eq(events.kind, "page_view")));

  return {
    active: Number(row?.active ?? 0),
    pending: Number(row?.pending ?? 0),
    review: Number(row?.review ?? 0),
    blocked: Number(row?.blocked ?? 0),
    unsubscribed: Number(row?.unsubscribed ?? 0),
    inQueue: Number(row?.inQueue ?? 0),
    creditedReferrals: Number(row?.credited ?? 0),
    pageViews: Number(views?.n ?? 0),
    today: Number(row?.today ?? 0),
  };
}

/** Signups that count against the plan cap: everything except hard-blocked rows. */
export async function billableSignupCount(listId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: countRows() })
    .from(signups)
    .where(and(eq(signups.listId, listId), ne(signups.status, "blocked")));
  return Number(row?.n ?? 0);
}

export async function recordPageView(listId: string): Promise<void> {
  const db = getDb();
  await db.insert(events).values({ listId, kind: "page_view" });
}

/** Does this founder have any verified custom domain? Used by the settings copy. */
export async function hasCustomDomain(userId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ n: countRows() })
    .from(lists)
    .where(and(eq(lists.userId, userId), isNotNull(lists.customDomain)));
  return Number(row?.n ?? 0) > 0;
}

/** Plan limits for a founder, resolved once for a screen. */
export function limitsFor(user: User) {
  return plan(user.plan);
}
