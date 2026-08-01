/**
 * Volunteer slots: roles with capacity, claimed from a link with no login.
 *
 * The one hard technical requirement is that capacity holds under a race. Two
 * parents tapping "Claim" on the last snack-bar seat at the same moment is not a
 * hypothetical — a schedule announcement goes out and everyone opens it at once.
 * So the claim runs inside a transaction that locks the slot row (`for update`)
 * before counting, and the partial unique index on (slot, household) where
 * `released_at is null` stops a family claiming the same seat twice.
 */

import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clubs,
  games,
  households,
  teams,
  venues,
  volunteerClaims,
  volunteerSlots,
  type VolunteerSlot,
} from "@/db/schema";
import { audit, type Actor } from "@/lib/audit";
import { formatWhen } from "@/lib/time";

export interface SlotView {
  slot: VolunteerSlot;
  label: string;
  /** "Miller Park · Field 2" or the event's own note. */
  where: string | null;
  when: string;
  claimed: { claimId: string; householdId: string; contactName: string }[];
  spotsLeft: number;
}

export const DEFAULT_ROLES = [
  { role: "Snack bar", capacity: 2 },
  { role: "Field lines", capacity: 1 },
  { role: "Scorekeeper", capacity: 1 },
];

export async function createSlot(args: {
  clubId: string;
  seasonId: string;
  gameId: string | null;
  eventLabel: string | null;
  startsAt: Date;
  role: string;
  capacity: number;
}): Promise<VolunteerSlot> {
  if (!args.role.trim()) throw new Error("Name the role");
  if (args.capacity < 1) throw new Error("A slot needs at least one spot");
  const [slot] = await getDb()
    .insert(volunteerSlots)
    .values({
      clubId: args.clubId,
      seasonId: args.seasonId,
      gameId: args.gameId,
      eventLabel: args.eventLabel,
      startsAt: args.startsAt,
      role: args.role.trim(),
      capacity: args.capacity,
    })
    .returning();
  return slot;
}

/** Attach the standard roles to a game in one tap. */
export async function createStandardSlots(
  clubId: string,
  seasonId: string,
  gameId: string,
  startsAt: Date,
): Promise<number> {
  let n = 0;
  for (const role of DEFAULT_ROLES) {
    await createSlot({
      clubId,
      seasonId,
      gameId,
      eventLabel: null,
      startsAt,
      role: role.role,
      capacity: role.capacity,
    });
    n += 1;
  }
  return n;
}

export async function deleteSlot(slotId: string): Promise<void> {
  await getDb().delete(volunteerSlots).where(eq(volunteerSlots.id, slotId));
}

/* --------------------------------------------------------------- reading --- */

export async function listSlots(
  seasonId: string,
  options: { fromNow?: boolean } = {},
): Promise<SlotView[]> {
  const db = getDb();
  const [club] = await db
    .select({ club: clubs })
    .from(volunteerSlots)
    .innerJoin(clubs, eq(clubs.id, volunteerSlots.clubId))
    .where(eq(volunteerSlots.seasonId, seasonId))
    .limit(1);
  const timezone = club?.club.timezone ?? "America/New_York";

  const rows = await db
    .select({
      slot: volunteerSlots,
      game: games,
      homeTeamName: teams.name,
      venueName: venues.name,
    })
    .from(volunteerSlots)
    .leftJoin(games, eq(games.id, volunteerSlots.gameId))
    .leftJoin(teams, eq(teams.id, games.homeTeamId))
    .leftJoin(venues, eq(venues.id, games.venueId))
    .where(
      and(
        eq(volunteerSlots.seasonId, seasonId),
        options.fromNow ? gte(volunteerSlots.startsAt, new Date(Date.now() - 3 * 3600_000)) : undefined,
      ),
    )
    .orderBy(asc(volunteerSlots.startsAt), asc(volunteerSlots.role));
  if (rows.length === 0) return [];

  const claims = await db
    .select({
      claim: volunteerClaims,
      contactName: households.contactName,
    })
    .from(volunteerClaims)
    .innerJoin(households, eq(households.id, volunteerClaims.householdId))
    .where(
      and(
        inArray(
          volunteerClaims.slotId,
          rows.map((r) => r.slot.id),
        ),
        isNull(volunteerClaims.releasedAt),
      ),
    );

  return rows.map((r) => {
    const mine = claims.filter((c) => c.claim.slotId === r.slot.id);
    return {
      slot: r.slot,
      label: r.slot.eventLabel ?? (r.homeTeamName ? `${r.homeTeamName} — ${r.slot.role}` : r.slot.role),
      where: r.venueName ? `${r.venueName} · ${r.game?.field ?? ""}`.trim() : null,
      when: formatWhen(r.slot.startsAt, timezone),
      claimed: mine.map((c) => ({
        claimId: c.claim.id,
        householdId: c.claim.householdId,
        contactName: c.contactName,
      })),
      spotsLeft: Math.max(0, r.slot.capacity - mine.length),
    };
  });
}

/** Open slots a family can still claim, for their own page. */
export async function openSlotsForHousehold(
  seasonId: string,
  householdId: string,
): Promise<SlotView[]> {
  const all = await listSlots(seasonId, { fromNow: true });
  return all.filter(
    (s) => s.spotsLeft > 0 && !s.claimed.some((c) => c.householdId === householdId),
  );
}

export async function claimsForHousehold(seasonId: string, householdId: string) {
  const all = await listSlots(seasonId);
  return all.filter((s) => s.claimed.some((c) => c.householdId === householdId));
}

/* --------------------------------------------------------------- claiming --- */

export type ClaimOutcome =
  | { ok: true; claimId: string; role: string; when: string }
  | { ok: false; reason: "full" | "already" | "gone" | "past"; message: string };

/**
 * Claim a slot for a household.
 *
 * The caller must already have resolved the household from its signed link — this
 * function never takes a household id from a request. Capacity is counted inside
 * a transaction that holds a row lock on the slot, so two simultaneous claims on
 * one seat cannot both win.
 */
export async function claimSlot(slotId: string, householdId: string): Promise<ClaimOutcome> {
  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      // `.for("update")` through the query builder, not raw SQL: a raw `execute`
      // skips Drizzle's column decoders and hands back `starts_at` as a string,
      // which is exactly the kind of quiet type mismatch that turns a working
      // claim into "that slot is full".
      const [slot] = await tx
        .select()
        .from(volunteerSlots)
        .where(eq(volunteerSlots.id, slotId))
        .for("update");
      if (!slot) {
        return { ok: false, reason: "gone", message: "That slot no longer exists" } as ClaimOutcome;
      }
      if (slot.startsAt.getTime() < Date.now()) {
        return {
          ok: false,
          reason: "past",
          message: "That slot has already happened",
        } as ClaimOutcome;
      }

      const [{ taken }] = await tx
        .select({ taken: sql<number>`count(*)::int` })
        .from(volunteerClaims)
        .where(and(eq(volunteerClaims.slotId, slotId), isNull(volunteerClaims.releasedAt)));

      const existing = await tx
        .select()
        .from(volunteerClaims)
        .where(
          and(
            eq(volunteerClaims.slotId, slotId),
            eq(volunteerClaims.householdId, householdId),
            isNull(volunteerClaims.releasedAt),
          ),
        );
      if (existing.length > 0) {
        return {
          ok: false,
          reason: "already",
          message: "You have already claimed this one",
        } as ClaimOutcome;
      }

      if (Number(taken) >= slot.capacity) {
        return {
          ok: false,
          reason: "full",
          message: "Somebody just took the last spot for that role",
        } as ClaimOutcome;
      }

      const [claim] = await tx
        .insert(volunteerClaims)
        .values({ slotId, householdId })
        .returning();

      return {
        ok: true,
        claimId: claim.id,
        role: slot.role,
        when: slot.startsAt.toISOString(),
      } as ClaimOutcome;
    });
  } catch (err) {
    // A unique violation means the partial index caught a race the count could
    // not see — that genuinely is "somebody just took it". Anything else is a
    // fault, and must not be dressed up as a full slot: a claim that silently
    // reports "full" for a bug is unfixable from a support email.
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      return {
        ok: false,
        reason: "full",
        message: "Somebody just took the last spot for that role",
      };
    }
    console.error("[volunteers] claim failed", err);
    return {
      ok: false,
      reason: "gone",
      message: "Something went wrong claiming that. Try again, and tell the club if it persists.",
    };
  }
}

export async function releaseClaim(claimId: string, householdId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .update(volunteerClaims)
    .set({ releasedAt: new Date() })
    .where(
      and(
        eq(volunteerClaims.id, claimId),
        eq(volunteerClaims.householdId, householdId),
        isNull(volunteerClaims.releasedAt),
      ),
    )
    .returning();
  return rows.length > 0;
}

export async function markNoShow(claimId: string, actor: Actor, clubId: string): Promise<void> {
  await getDb().update(volunteerClaims).set({ noShow: true }).where(eq(volunteerClaims.id, claimId));
  await audit(clubId, actor, "volunteer_no_show", `claim:${claimId}`);
}

/* --------------------------------------------------------------- reminders --- */

/**
 * Claims that need their T-24h reminder.
 *
 * Bounded to a window rather than "anything in the future that is unreminded":
 * `reminded_at` is the dedupe, and the window keeps a sweep that has not run for a
 * week from texting about tomorrow's game at 3am on Tuesday.
 */
export async function dueClaimReminders(limit = 200) {
  return getDb()
    .select({ claim: volunteerClaims, slot: volunteerSlots })
    .from(volunteerClaims)
    .innerJoin(volunteerSlots, eq(volunteerSlots.id, volunteerClaims.slotId))
    .where(
      and(
        isNull(volunteerClaims.releasedAt),
        isNull(volunteerClaims.remindedAt),
        sql`${volunteerSlots.startsAt} between now() and now() + interval '24 hours'`,
      ),
    )
    .orderBy(asc(volunteerSlots.startsAt))
    .limit(limit);
}

export async function markClaimReminded(claimId: string): Promise<void> {
  await getDb()
    .update(volunteerClaims)
    .set({ remindedAt: new Date() })
    .where(eq(volunteerClaims.id, claimId));
}

/** Unfilled slots inside the next week — what the nudge is about. */
export async function unfilledSlots(seasonId: string): Promise<SlotView[]> {
  const slots = await listSlots(seasonId, { fromNow: true });
  const weekOut = Date.now() + 7 * 86_400_000;
  return slots.filter((s) => s.spotsLeft > 0 && s.slot.startsAt.getTime() <= weekOut);
}

/**
 * Households with no claim at all this season — the only people the unclaimed-slot
 * nudge goes to. Fairness rotation proper is deferred (ROADMAP phase 3); not
 * nagging the family who already did three shifts is the part worth having now.
 */
export async function householdsWithNoClaims(
  seasonId: string,
  clubId: string,
): Promise<string[]> {
  const db = getDb();
  const claimed = await db
    .selectDistinct({ householdId: volunteerClaims.householdId })
    .from(volunteerClaims)
    .innerJoin(volunteerSlots, eq(volunteerSlots.id, volunteerClaims.slotId))
    .where(and(eq(volunteerSlots.seasonId, seasonId), isNull(volunteerClaims.releasedAt)));
  const claimedIds = new Set(claimed.map((c) => c.householdId));
  const all = await db
    .select({ id: households.id })
    .from(households)
    .where(eq(households.clubId, clubId));
  return all.map((h) => h.id).filter((id) => !claimedIds.has(id));
}
