"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { checkIn, CoverageError } from "@/lib/checkin";
import { participantCoverage } from "@/lib/search";
import { issueLinkToken, signUrl } from "@/lib/qr";
import { send, signLinkEmail } from "@/lib/email";
import { featureAllowed } from "@/lib/plans";
import { getDb } from "@/db";
import { locations } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface CheckinState {
  error?: string;
  ok?: string;
  /** Set when the failure is a coverage problem, so the UI can offer re-sign. */
  needsResign?: boolean;
  participantId?: string;
}

export async function checkInAction(
  _prev: CheckinState,
  form: FormData,
): Promise<CheckinState> {
  const { account, location, user } = await requireUser();
  const participantId = String(form.get("participantId") ?? "");
  if (!participantId) return { error: "Pick a row first." };

  if (!featureAllowed(account, "checkinBoard")) {
    return {
      error: "Check-in is part of Front Desk. Your waivers and participant search keep working.",
    };
  }

  try {
    await checkIn(account.id, location.id, participantId, {
      byUserId: user.id,
      timeZone: location.timezone,
    });
  } catch (err) {
    if (err instanceof CoverageError) {
      return { error: err.message, needsResign: true, participantId };
    }
    return { error: err instanceof Error ? err.message : "Could not check them in" };
  }

  revalidatePath("/checkin");
  return { ok: "Checked in", participantId };
}

/**
 * One tap from an amber row: issue a fresh, short-lived sign link and email it.
 * With DRY_RUN=1 (or no Resend key) the link is logged and also returned here so
 * staff can read it out — a re-sign that silently goes nowhere is worse than none.
 */
export async function sendResignLinkAction(
  _prev: CheckinState,
  form: FormData,
): Promise<CheckinState> {
  const { account, location } = await requireUser();
  const participantId = String(form.get("participantId") ?? "");
  const found = await participantCoverage(account.id, participantId, {
    timeZone: location.timezone,
  });
  if (!found) return { error: "That participant is not in this account." };

  const waiverId = found.state.latestSignature?.waiverId;
  const token = issueLinkToken(
    { locationId: location.id, waiverId, participantId },
    60 * 60 * 24 * 7,
  );
  const url = signUrl(token);

  // A minor's own record holds no contact details, so the link goes to the
  // guardian on file. That is the only address we have a right to use.
  const to = found.participant.email ?? found.guardian?.email ?? null;
  if (!to) {
    return {
      ok: `No email on file. Open this on their phone: ${url}`,
      participantId,
    };
  }

  const result = await send(
    signLinkEmail({
      to,
      venueName: location.name,
      waiverTitle: found.state.latestSignature?.waiverTitle ?? "Waiver",
      url,
      resign: true,
      reason: found.state.reason,
    }),
  );

  return {
    ok: result.sent ? `Re-sign link sent to ${to}` : `Email is off (${result.reason}). Link: ${url}`,
    participantId,
  };
}

/** Switch the location the dashboard is showing (Operator plan, 3 locations). */
export async function switchLocationAction(form: FormData): Promise<void> {
  const { account } = await requireUser();
  const locationId = String(form.get("locationId") ?? "");
  const db = getDb();
  const [row] = await db.select().from(locations).where(eq(locations.id, locationId));
  if (row && row.accountId === account.id) {
    const jar = await cookies();
    jar.set("waiverwing_location", locationId, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  revalidatePath("/checkin");
}
