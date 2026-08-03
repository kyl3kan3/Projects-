/**
 * src/server/rent.ts
 *
 * The chair-rent split ledger. ChairFlow takes no cut of rent in v1: the value is that
 * the owner and the renter are finally reading the same row.
 *
 * The weekly rollover is idempotent by `(chair_id, week_start_on)`, so running it twice
 * on a Monday opens nothing extra, and it catches up missed weeks (bounded — see
 * `lib/rent.ts`) rather than silently skipping them.
 */

import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  chairs,
  rentPeriods,
  shops,
  stylists,
  type Chair,
  type RentPeriod,
  type Shop,
  type Stylist,
} from "@/db/schema";
import { audit, type Actor } from "@/server/audit";
import { gateway } from "@/server/payments";
import { addDaysToDay, mondayOfWeek, todayInTimezone } from "@/lib/dates";
import { moneyShort } from "@/lib/format";
import { displayRentStatus, weeksToOpen, type DisplayRentStatus } from "@/lib/rent";

export async function shopChairs(shopId: string): Promise<Array<{ chair: Chair; stylist: Stylist | null }>> {
  const db = getDb();
  const rows = await db
    .select({ chair: chairs, stylist: stylists })
    .from(chairs)
    .leftJoin(stylists, eq(stylists.id, chairs.stylistId))
    .where(eq(chairs.shopId, shopId))
    .orderBy(asc(chairs.label));
  return rows.map((r) => ({ chair: r.chair, stylist: r.stylist ?? null }));
}

/**
 * Open this week's rent rows for every occupied chair.
 *
 * The amount is copied onto the row at rollover rather than read through to the chair,
 * so raising the rent next month does not retroactively rewrite what somebody owed in
 * March.
 */
export async function rolloverShop(input: {
  shopId: string;
  now?: Date;
}): Promise<{ opened: number; weeks: string[] }> {
  const db = getDb();
  const now = input.now ?? new Date();
  const [shop] = await db.select().from(shops).where(eq(shops.id, input.shopId));
  if (!shop) return { opened: 0, weeks: [] };

  const today = todayInTimezone(shop.timezone, now);
  const [latest] = await db
    .select({ weekStartOn: rentPeriods.weekStartOn })
    .from(rentPeriods)
    .where(eq(rentPeriods.shopId, shop.id))
    .orderBy(desc(rentPeriods.weekStartOn))
    .limit(1);

  const weeks = weeksToOpen({ today, lastOpenedWeek: latest?.weekStartOn ?? null });
  if (weeks.length === 0) return { opened: 0, weeks: [] };

  const occupied = await db
    .select()
    .from(chairs)
    .where(and(eq(chairs.shopId, shop.id), eq(chairs.status, "occupied")));

  let opened = 0;
  for (const week of weeks) {
    for (const chair of occupied) {
      if (!chair.stylistId || chair.weeklyRentCents <= 0) continue;
      const inserted = await db
        .insert(rentPeriods)
        .values({
          shopId: shop.id,
          chairId: chair.id,
          stylistId: chair.stylistId,
          weekStartOn: week,
          amountCents: chair.weeklyRentCents,
          status: "due",
        })
        .onConflictDoNothing()
        .returning({ id: rentPeriods.id });
      if (inserted[0]) opened += 1;
    }
  }

  if (opened > 0) {
    await audit({
      actor: { kind: "system" },
      action: "rent.rollover",
      target: shop.id,
      shopId: shop.id,
      metadata: { weeks, opened },
    });
  }
  return { opened, weeks };
}

export interface GridCell {
  period: RentPeriod | null;
  display: DisplayRentStatus | null;
}

export interface OwnerGrid {
  weeks: string[];
  rows: Array<{
    chair: Chair;
    stylist: Stylist | null;
    cells: GridCell[];
  }>;
  today: string;
}

/**
 * The chairs x weeks grid — the crumpled-envelope ledger, replaced.
 *
 * Lateness is computed per cell against today rather than read from a column, so a week
 * from two months ago never reads "Due".
 */
export async function ownerGrid(input: {
  shopId: string;
  weekCount?: number;
  now?: Date;
}): Promise<OwnerGrid> {
  const db = getDb();
  const now = input.now ?? new Date();
  const [shop] = await db.select().from(shops).where(eq(shops.id, input.shopId));
  const timezone = shop?.timezone ?? "America/New_York";
  const today = todayInTimezone(timezone, now);
  const count = input.weekCount ?? 6;
  const currentWeek = mondayOfWeek(today);
  const weeks = Array.from({ length: count }, (_, i) =>
    addDaysToDay(currentWeek, -7 * (count - 1 - i)),
  );

  const chairRows = await shopChairs(input.shopId);
  const periods = await db
    .select()
    .from(rentPeriods)
    .where(and(eq(rentPeriods.shopId, input.shopId), inArray(rentPeriods.weekStartOn, weeks)));

  return {
    weeks,
    today,
    rows: chairRows.map(({ chair, stylist }) => ({
      chair,
      stylist,
      cells: weeks.map((week) => {
        const period = periods.find((p) => p.chairId === chair.id && p.weekStartOn === week) ?? null;
        return {
          period,
          display: period ? displayRentStatus(period, today) : null,
        };
      }),
    })),
  };
}

/** One renter's own rent history — the same rows the owner sees. */
export async function renterPeriods(stylistId: string, limit = 12): Promise<RentPeriod[]> {
  const db = getDb();
  return db
    .select()
    .from(rentPeriods)
    .where(eq(rentPeriods.stylistId, stylistId))
    .orderBy(desc(rentPeriods.weekStartOn))
    .limit(limit);
}

export async function markRentPaid(input: {
  rentPeriodId: string;
  shopId: string;
  actor: Actor;
  via: "link" | "manual";
  note?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = getDb();
  const [period] = await db
    .select()
    .from(rentPeriods)
    .where(and(eq(rentPeriods.id, input.rentPeriodId), eq(rentPeriods.shopId, input.shopId)));
  if (!period) return { ok: false, message: "That rent week is not in this shop's ledger." };
  if (period.status === "paid") return { ok: true };

  await db
    .update(rentPeriods)
    .set({
      status: "paid",
      paidAt: new Date(),
      paidVia: input.via,
      note: input.note ?? period.note,
      updatedAt: new Date(),
    })
    .where(eq(rentPeriods.id, period.id));

  await audit({
    actor: input.actor,
    action: "rent.paid",
    target: period.id,
    shopId: input.shopId,
    stylistId: period.stylistId,
    metadata: { amountCents: period.amountCents, via: input.via, weekStartOn: period.weekStartOn },
  });
  return { ok: true };
}

export async function waiveRent(input: {
  rentPeriodId: string;
  shopId: string;
  actor: Actor;
  note?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = getDb();
  const [period] = await db
    .select()
    .from(rentPeriods)
    .where(and(eq(rentPeriods.id, input.rentPeriodId), eq(rentPeriods.shopId, input.shopId)));
  if (!period) return { ok: false, message: "That rent week is not in this shop's ledger." };

  await db
    .update(rentPeriods)
    .set({ status: "waived", note: input.note ?? period.note, updatedAt: new Date() })
    .where(eq(rentPeriods.id, period.id));
  await audit({
    actor: input.actor,
    action: "rent.waived",
    target: period.id,
    shopId: input.shopId,
    stylistId: period.stylistId,
    metadata: { amountCents: period.amountCents, weekStartOn: period.weekStartOn },
  });
  return { ok: true };
}

/**
 * A payment link on the owner's own Stripe account.
 *
 * Returns null when Stripe is not configured, and the screen then offers mark-paid
 * (cash is how most chair rent is actually paid) instead of pretending a link exists.
 */
export async function createRentLink(input: {
  rentPeriodId: string;
  shopId: string;
  ownerAccountId: string | null;
}): Promise<{ url: string } | { url: null; reason: string }> {
  const db = getDb();
  const [period] = await db
    .select()
    .from(rentPeriods)
    .where(and(eq(rentPeriods.id, input.rentPeriodId), eq(rentPeriods.shopId, input.shopId)));
  if (!period) return { url: null, reason: "That rent week is not in this shop's ledger." };
  if (period.stripePaymentLinkUrl) return { url: period.stripePaymentLinkUrl };

  const link = await gateway().createRentPaymentLink({
    accountId: input.ownerAccountId,
    amountCents: period.amountCents,
    description: `Chair rent, week of ${period.weekStartOn} (${moneyShort(period.amountCents)})`,
    metadata: { chairflow_rent_period_id: period.id, chairflow_shop_id: input.shopId },
  });
  if (!link) {
    return {
      url: null,
      reason: "Stripe is not connected for this shop, so mark the week paid when the cash lands.",
    };
  }
  await db
    .update(rentPeriods)
    .set({ stripePaymentLinkId: link.id, stripePaymentLinkUrl: link.url, updatedAt: new Date() })
    .where(eq(rentPeriods.id, period.id));
  return { url: link.url };
}

export async function createShop(input: {
  ownerUserId: string;
  name: string;
  slug: string;
  address?: string | null;
  timezone: string;
}): Promise<Shop> {
  const db = getDb();
  const [shop] = await db
    .insert(shops)
    .values({
      ownerUserId: input.ownerUserId,
      name: input.name,
      slug: input.slug,
      address: input.address ?? null,
      timezone: input.timezone,
      trialEndsAt: new Date(Date.now() + 14 * 86_400_000),
    })
    .returning();
  return shop;
}

export async function addChair(input: {
  shopId: string;
  label: string;
  weeklyRentCents: number;
  stylistId?: string | null;
}): Promise<Chair> {
  const db = getDb();
  const [chair] = await db
    .insert(chairs)
    .values({
      shopId: input.shopId,
      label: input.label,
      weeklyRentCents: input.weeklyRentCents,
      stylistId: input.stylistId ?? null,
      status: input.stylistId ? "occupied" : "vacant",
    })
    .returning();
  return chair;
}

/** Assign or vacate a chair. Assigning also joins the stylist to the shop. */
export async function assignChair(input: {
  chairId: string;
  shopId: string;
  stylistHandle: string | null;
  actor: Actor;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = getDb();
  const [chair] = await db
    .select()
    .from(chairs)
    .where(and(eq(chairs.id, input.chairId), eq(chairs.shopId, input.shopId)));
  if (!chair) return { ok: false, message: "That chair is not in this shop." };

  if (!input.stylistHandle) {
    await db
      .update(chairs)
      .set({ stylistId: null, status: "vacant", updatedAt: new Date() })
      .where(eq(chairs.id, chair.id));
    return { ok: true };
  }

  const [stylist] = await db
    .select()
    .from(stylists)
    .where(eq(stylists.handle, input.stylistHandle.toLowerCase().replace(/^@/, "")));
  if (!stylist) {
    return { ok: false, message: `No ChairFlow stylist with the handle @${input.stylistHandle}.` };
  }

  await db
    .update(chairs)
    .set({ stylistId: stylist.id, status: "occupied", updatedAt: new Date() })
    .where(eq(chairs.id, chair.id));
  await db
    .update(stylists)
    .set({ shopId: input.shopId, updatedAt: new Date() })
    .where(eq(stylists.id, stylist.id));

  await audit({
    actor: input.actor,
    action: "chair.assigned",
    target: chair.id,
    shopId: input.shopId,
    stylistId: stylist.id,
    metadata: { label: chair.label },
  });
  return { ok: true };
}

export async function updateChairRent(input: {
  chairId: string;
  shopId: string;
  weeklyRentCents: number;
  actor: Actor;
}): Promise<void> {
  const db = getDb();
  await db
    .update(chairs)
    .set({ weeklyRentCents: input.weeklyRentCents, updatedAt: new Date() })
    .where(and(eq(chairs.id, input.chairId), eq(chairs.shopId, input.shopId)));
  await audit({
    actor: input.actor,
    action: "chair.rent_changed",
    target: input.chairId,
    shopId: input.shopId,
    metadata: { weeklyRentCents: input.weeklyRentCents },
  });
}

/** Shops that have had a rent row in the last 90 days — the rollover's bounded set. */
export async function activeShops(since: string, limit = 100): Promise<Shop[]> {
  const db = getDb();
  const recent = await db
    .selectDistinct({ shopId: rentPeriods.shopId })
    .from(rentPeriods)
    .where(gte(rentPeriods.weekStartOn, since))
    .limit(limit);
  const withChairs = await db.selectDistinct({ shopId: chairs.shopId }).from(chairs).limit(limit);
  const ids = [...new Set([...recent.map((r) => r.shopId), ...withChairs.map((r) => r.shopId)])];
  if (ids.length === 0) return [];
  return db.select().from(shops).where(inArray(shops.id, ids));
}
