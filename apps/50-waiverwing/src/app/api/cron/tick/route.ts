/**
 * The one scheduled job (ARCHITECTURE.md: no worker, no queue at MVP).
 *
 * Two pieces of work, both cheap and both idempotent:
 *
 *  - **Expiry roll:** find coverage that has lapsed or is about to, and email the
 *    re-sign link before the customer arrives rather than after they are stood at
 *    the counter. Runs through the same coverage rules the check-in screen uses,
 *    which is how a minor who turned 18 gets prompted at all.
 *  - **Daily digest:** what happened today, per location.
 *
 * Vercel Hobby runs cron once a day, so this is written to be correct at any
 * frequency: it never assumes it ran yesterday, and it works from current state
 * rather than from a cursor. Bounded by a time budget so a large account cannot
 * make the function time out — the next run picks up where it stopped, because
 * "who is expired" is a fact about the database, not about progress.
 */

import { NextResponse } from "next/server";
import { and, eq, gte, isNotNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, incidents, locations, participants, signatures, users } from "@/db/schema";
import { env } from "@/lib/env";
import { digestEmail, send, signLinkEmail } from "@/lib/email";
import { issueLinkToken, signUrl } from "@/lib/qr";
import { deriveCoverage } from "@/lib/search";
import { todayBoard } from "@/lib/checkin";
import { localDateString } from "@/lib/time";

const BUDGET_MS = 50_000;
/** How far ahead to warn about coverage running out. */
const HORIZON_DAYS = 30;

export async function GET(req: Request): Promise<Response> {
  // A cron route usually does the most expensive thing in the app. Refuse when
  // the secret is unset rather than defaulting to open.
  if (!env.cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const now = new Date();
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);
  const db = getDb();

  let resignEmails = 0;
  let digests = 0;
  let expiringSeen = 0;
  let budgetHit = false;

  const allAccounts = await db.select().from(accounts);

  for (const account of allAccounts) {
    if (Date.now() - startedAt > BUDGET_MS) {
      budgetHit = true;
      break;
    }

    const accountLocations = await db
      .select()
      .from(locations)
      .where(eq(locations.accountId, account.id));
    if (!accountLocations.length) continue;
    const primary = accountLocations[0];

    /* ---- expiry roll ---- */
    const soon = await db
      .select({ signature: signatures, participant: participants })
      .from(signatures)
      .innerJoin(participants, eq(participants.id, signatures.participantId))
      .where(
        and(
          eq(signatures.accountId, account.id),
          isNotNull(signatures.expiresAt),
          gte(signatures.expiresAt, new Date(now.getTime() - 90 * 86_400_000)),
          lte(signatures.expiresAt, horizon),
        ),
      );

    // One notice per participant, and only when their *current* coverage is
    // genuinely running out — a lapsed signature next to a valid re-sign is not
    // a reason to email anyone.
    const byParticipant = new Map<string, { dob: string | null; email: string | null }>();
    for (const row of soon) {
      byParticipant.set(row.participant.id, {
        dob: row.participant.dob,
        email: row.participant.email,
      });
    }

    for (const [participantId, info] of byParticipant) {
      if (Date.now() - startedAt > BUDGET_MS) {
        budgetHit = true;
        break;
      }
      const history = await db
        .select()
        .from(signatures)
        .where(eq(signatures.participantId, participantId));
      const state = deriveCoverage(history, info.dob, now, primary.timezone);
      const endsAt = state.endsAt;
      const running = endsAt !== null && endsAt.getTime() <= horizon.getTime();
      if (!running && state.coverage !== "expired") continue;

      expiringSeen += 1;

      // A minor's own record holds no email; the guardian's does.
      let to = info.email;
      if (!to) {
        const [p] = await db.select().from(participants).where(eq(participants.id, participantId));
        if (p?.guardianParticipantId) {
          const [g] = await db
            .select()
            .from(participants)
            .where(eq(participants.id, p.guardianParticipantId));
          to = g?.email ?? null;
        }
      }
      if (!to) continue;

      const token = issueLinkToken(
        {
          locationId: primary.id,
          waiverId: state.latestSignature?.waiverId,
          participantId,
        },
        60 * 60 * 24 * 30,
      );
      const result = await send(
        signLinkEmail({
          to,
          venueName: primary.name,
          waiverTitle: state.latestSignature?.waiverTitle ?? "Waiver",
          url: signUrl(token),
          resign: true,
          reason: state.reason,
        }),
      );
      if (result.sent) resignEmails += 1;
    }

    /* ---- daily digest ---- */
    const owner = (
      await db.select().from(users).where(eq(users.accountId, account.id))
    ).find((u) => u.role === "owner");
    if (!owner) continue;

    for (const location of accountLocations) {
      const board = await todayBoard(location, now);
      const guardianSignings = board.rows.filter((r) => r.isMinor).length;
      const open = (
        await db
          .select({ id: incidents.id })
          .from(incidents)
          .where(and(eq(incidents.accountId, account.id), eq(incidents.status, "open")))
      ).length;

      // Nothing happened and nothing is wrong: do not send mail for that.
      if (board.signedCount === 0 && board.checkedInCount === 0 && open === 0) continue;

      const result = await send(
        digestEmail({
          to: owner.email,
          venueName: location.name,
          dateLabel: localDateString(now, location.timezone),
          signedCount: board.signedCount,
          checkedInCount: board.checkedInCount,
          guardianSignings,
          expiringSoon: expiringSeen,
          openIncidents: open,
        }),
      );
      if (result.sent) digests += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    ms: Date.now() - startedAt,
    accounts: allAccounts.length,
    expiringSeen,
    resignEmails,
    digests,
    budgetHit,
    dryRun: env.dryRun,
  });
}
