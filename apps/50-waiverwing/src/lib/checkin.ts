/**
 * src/lib/checkin.ts
 *
 * Check-in: the staff-side daily loop. A check-in row records that coverage was
 * verified at entry *and which signature proved it* — so "we let them in" and
 * "here is the waiver we let them in on" are the same fact, not two guesses.
 *
 * Day boundaries are the location's, not the server's. A 23:40 signing in
 * Denver belongs to the Denver day, and the morning board must not show it.
 */

import { and, desc, eq, gte, lt } from "drizzle-orm";
import { getDb } from "@/db";
import {
  checkins,
  participants,
  signatures,
  type Location,
  type Participant,
  type Signature,
} from "@/db/schema";
import { deriveCoverage, type Coverage } from "@/lib/search";
import { endOfLocalDay, startOfLocalDay } from "@/lib/time";

export class CoverageError extends Error {
  constructor(
    message: string,
    readonly coverage: Coverage,
  ) {
    super(message);
  }
}

export interface CheckinResult {
  checkinId: string;
  signatureId: string;
}

/**
 * Check a participant in.
 *
 * Refuses when there is no valid waiver, and says which of the two reasons it
 * is — the UI swaps its primary action to "Send re-sign link" on that error
 * rather than letting staff record an unproven entry.
 */
export async function checkIn(
  accountId: string,
  locationId: string,
  participantId: string,
  opts: { byUserId?: string | null; at?: Date; timeZone?: string } = {},
): Promise<CheckinResult> {
  const db = getDb();
  const at = opts.at ?? new Date();
  const tz = opts.timeZone ?? "UTC";

  const [participant] = await db
    .select()
    .from(participants)
    .where(and(eq(participants.id, participantId), eq(participants.accountId, accountId)));
  if (!participant) throw new CoverageError("That participant is not in this account.", "none");

  const sigs = await db
    .select()
    .from(signatures)
    .where(eq(signatures.participantId, participantId))
    .orderBy(desc(signatures.signedAt));

  const state = deriveCoverage(sigs, participant.dob, at, tz);
  if (!state.provingSignature) {
    throw new CoverageError(
      state.reason ?? "No current waiver on file.",
      state.coverage,
    );
  }

  const [row] = await db
    .insert(checkins)
    .values({
      accountId,
      locationId,
      participantId,
      signatureId: state.provingSignature.id,
      checkedInAt: at,
      byUserId: opts.byUserId ?? null,
    })
    .returning();

  return { checkinId: row.id, signatureId: state.provingSignature.id };
}

/* --------------------------------------------------------------- the board */

export interface BoardRow {
  participantId: string;
  displayName: string;
  isMinor: boolean;
  guardianName: string | null;
  coverage: Coverage;
  reason: string | null;
  signedAt: Date | null;
  checkedInAt: Date | null;
  provingSignatureId: string | null;
  channel: Signature["channel"] | null;
  coverageEndsAt: Date | null;
}

export interface TodayBoard {
  rows: BoardRow[];
  signedCount: number;
  checkedInCount: number;
  dayStart: Date;
  dayEnd: Date;
}

/**
 * Today at this location: everyone who signed today plus everyone who checked in
 * today, newest activity first. This is the staff home screen.
 */
export async function todayBoard(
  location: Pick<Location, "id" | "accountId" | "timezone">,
  at: Date = new Date(),
): Promise<TodayBoard> {
  const db = getDb();
  const tz = location.timezone;
  const dayStart = startOfLocalDay(at, tz);
  const dayEnd = endOfLocalDay(at, tz);

  const signedToday = await db
    .select({ sig: signatures, participant: participants })
    .from(signatures)
    .innerJoin(participants, eq(participants.id, signatures.participantId))
    .where(
      and(
        eq(signatures.locationId, location.id),
        gte(signatures.signedAt, dayStart),
        lt(signatures.signedAt, dayEnd),
      ),
    )
    .orderBy(desc(signatures.signedAt));

  const checkedToday = await db
    .select({ checkin: checkins, participant: participants })
    .from(checkins)
    .innerJoin(participants, eq(participants.id, checkins.participantId))
    .where(
      and(
        eq(checkins.locationId, location.id),
        gte(checkins.checkedInAt, dayStart),
        lt(checkins.checkedInAt, dayEnd),
      ),
    )
    .orderBy(desc(checkins.checkedInAt));

  const ids = new Set<string>();
  for (const r of signedToday) ids.add(r.participant.id);
  for (const r of checkedToday) ids.add(r.participant.id);

  // Coverage needs a participant's whole signature history (a returning
  // customer's proving waiver may be from last season), so pull it per person.
  const rows: BoardRow[] = [];
  const guardianCache = new Map<string, Participant | null>();

  for (const id of ids) {
    const participant =
      signedToday.find((r) => r.participant.id === id)?.participant ??
      checkedToday.find((r) => r.participant.id === id)!.participant;

    const history = await db
      .select()
      .from(signatures)
      .where(eq(signatures.participantId, id))
      .orderBy(desc(signatures.signedAt));

    const state = deriveCoverage(history, participant.dob, at, tz);
    const signedTodayRow = signedToday.find((r) => r.participant.id === id)?.sig ?? null;
    const checkinRow = checkedToday.find((r) => r.participant.id === id)?.checkin ?? null;

    let guardianName: string | null = null;
    if (participant.guardianParticipantId) {
      if (!guardianCache.has(participant.guardianParticipantId)) {
        const [g] = await db
          .select()
          .from(participants)
          .where(eq(participants.id, participant.guardianParticipantId));
        guardianCache.set(participant.guardianParticipantId, g ?? null);
      }
      const g = guardianCache.get(participant.guardianParticipantId);
      guardianName = g ? `${g.firstName} ${g.lastName}` : null;
    }

    rows.push({
      participantId: id,
      displayName: `${participant.firstName} ${participant.lastName}`,
      isMinor: participant.isMinor,
      guardianName,
      coverage: state.coverage,
      reason: state.reason,
      signedAt: signedTodayRow?.signedAt ?? null,
      checkedInAt: checkinRow?.checkedInAt ?? null,
      provingSignatureId: state.provingSignature?.id ?? null,
      channel: signedTodayRow?.channel ?? null,
      coverageEndsAt: state.endsAt,
    });
  }

  rows.sort((a, b) => {
    const at2 = Math.max(a.checkedInAt?.getTime() ?? 0, a.signedAt?.getTime() ?? 0);
    const bt = Math.max(b.checkedInAt?.getTime() ?? 0, b.signedAt?.getTime() ?? 0);
    return bt - at2;
  });

  return {
    rows,
    signedCount: signedToday.length,
    checkedInCount: checkedToday.length,
    dayStart,
    dayEnd,
  };
}

/** `214 SIGNED · 186 IN` (DESIGN.md mono day stat). */
export function dayStatLine(board: Pick<TodayBoard, "signedCount" | "checkedInCount">): string {
  return `${board.signedCount} SIGNED · ${board.checkedInCount} IN`;
}
