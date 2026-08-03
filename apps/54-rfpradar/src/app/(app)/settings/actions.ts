"use server";

/**
 * Firm settings: the scan hour, the score threshold, the Slack destination, the
 * timezone, the ICS feed token, and seats.
 *
 * Two of these change what the machine does tomorrow morning, so both rescore or
 * re-notify immediately rather than waiting: changing the threshold moves matches
 * between `new` and `suppressed`, and changing the timezone moves 6am.
 */

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { DEFAULT_SCAN_HOUR, DEFAULT_SCORE_THRESHOLD, firmSettings, firms, users } from "@/db/schema";
import { audit, inviteSeat, requireAdmin, requireWrite } from "@/lib/auth";
import { isValidSlackWebhook, postSlack, sendEmail } from "@/lib/notify";
import { inviteEmail } from "@/lib/emails";
import { rotateIcsToken, icsFeedUrl, mintIcsToken } from "@/lib/ics";
import { runRescoreFirm } from "@/lib/jobs";
import { sendScan } from "@/lib/scan";

export interface SettingsState {
  error: string | null;
  notice: string | null;
  /** Set once, right after minting — the only time the token is ever shown. */
  feedUrl?: string | null;
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function saveScanSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { firm, user } = await requireWrite();
  const db = getDb();

  const scanHourRaw = Number(field(formData, "scanHour"));
  const scanHour = Number.isInteger(scanHourRaw) && scanHourRaw >= 0 && scanHourRaw <= 23
    ? scanHourRaw
    : DEFAULT_SCAN_HOUR;

  const thresholdRaw = Number(field(formData, "scoreThreshold"));
  const scoreThreshold =
    Number.isFinite(thresholdRaw) && thresholdRaw >= 0 && thresholdRaw <= 100
      ? Math.round(thresholdRaw)
      : DEFAULT_SCORE_THRESHOLD;

  const timezone = field(formData, "timezone") || firm.timezone;
  try {
    // Reject a timezone Intl cannot resolve rather than storing one that makes
    // every date on every screen silently wrong.
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch {
    return { error: `“${timezone}” is not a timezone this server recognises.`, notice: null };
  }

  const slackRaw = field(formData, "slackWebhookUrl");
  if (slackRaw && !isValidSlackWebhook(slackRaw)) {
    return {
      error: "A Slack incoming webhook URL starts with https://hooks.slack.com/.",
      notice: null,
    };
  }

  const settings = firmSettings(firm);
  const thresholdChanged = (settings.scoreThreshold ?? DEFAULT_SCORE_THRESHOLD) !== scoreThreshold;

  await db
    .update(firms)
    .set({
      timezone,
      slackWebhookUrl: slackRaw || null,
      settings: {
        ...settings,
        scanHour,
        scoreThreshold,
        onboarded: { ...(settings.onboarded ?? {}), notify: true },
      },
      updatedAt: new Date(),
    })
    .where(eq(firms.id, firm.id));

  await audit({
    firmId: firm.id,
    actor: user.id,
    action: "settings.updated",
    target: firm.id,
    metadata: { scanHour, scoreThreshold, timezone, slack: Boolean(slackRaw) },
  });

  let rescored = 0;
  if (thresholdChanged) rescored = await runRescoreFirm(firm.id);

  revalidatePath("/settings");
  revalidatePath("/radar");
  return {
    error: null,
    notice: thresholdChanged
      ? `Saved. Rescored ${rescored} candidate notice${rescored === 1 ? "" : "s"} against the new threshold of ${scoreThreshold}.`
      : "Saved.",
  };
}

/** Post a real message to the configured webhook. A pasted URL proves nothing. */
export async function testSlackAction(
  _prev: SettingsState,
  _formData: FormData,
): Promise<SettingsState> {
  const { firm } = await requireWrite();
  if (!firm.slackWebhookUrl) {
    return { error: "Save a Slack webhook URL first.", notice: null };
  }
  const result = await postSlack(firm.slackWebhookUrl, {
    text: "RFPRadar is wired up. The 6am scan will land here.",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*RFPRadar is wired up.* The 6am scan will land in this channel, with each match's fit score and reasons.",
        },
      },
    ],
  });
  if (!result.ok) return { error: result.error ?? "Slack rejected the post.", notice: null };
  return {
    error: null,
    notice: result.dryRun
      ? "DRY_RUN is on, so the post was logged instead of sent. Unset DRY_RUN to deliver for real."
      : "Posted. Check the channel.",
  };
}

/** Send this firm's scan right now — the honest way to preview it. */
export async function sendScanNowAction(
  _prev: SettingsState,
  _formData: FormData,
): Promise<SettingsState> {
  const { firm } = await requireWrite();
  const result = await sendScan(firm.id, new Date());
  revalidatePath("/radar");
  if (result.skipped) {
    return {
      error: null,
      notice: "Today's scan has already been sent to this firm. Tomorrow's will carry anything new.",
    };
  }
  if (result.errors.length > 0) {
    return { error: result.errors.join(" · "), notice: null };
  }
  return {
    error: null,
    notice: result.quiet
      ? "Sent the quiet line: no new matches, and the notice count scanned."
      : `Sent, carrying ${result.matchCount} new match${result.matchCount === 1 ? "" : "es"}.`,
  };
}

/**
 * Mint or rotate the ICS feed token — one action, because there is only ever one
 * live feed URL per firm and two independent buttons meant the page could show a
 * freshly-revoked URL next to the working one. Caught driving the real screen.
 *
 * Either operation replaces any previous token immediately, and both are
 * audit-logged. Rotation is hold-to-confirm in the UI.
 */
export async function icsFeedAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { firm, user } = await requireAdmin();
  const rotate = field(formData, "mode") === "rotate";

  const token = rotate
    ? await rotateIcsToken({ firmId: firm.id, actorUserId: user.id })
    : await mintIcsToken(firm.id);

  if (!rotate) {
    await audit({
      firmId: firm.id,
      actor: user.id,
      action: "ics.token_created",
      target: firm.id,
      metadata: {},
    });
  }

  revalidatePath("/settings");
  return {
    error: null,
    notice: rotate
      ? "Rotated. The previous URL stopped working just now — re-subscribe in Google or Outlook with the one below."
      : "Subscribe to this URL in Google Calendar or Outlook. It is the only time it is shown.",
    feedUrl: icsFeedUrl(token),
  };
}

export async function inviteSeatAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { firm, user } = await requireAdmin();
  const email = field(formData, "email");
  const name = field(formData, "name");
  const role = field(formData, "role") === "admin" ? "admin" : "member";

  const result = await inviteSeat({
    firm,
    actorUserId: user.id,
    email,
    name,
    role,
  });
  if (!result.ok) {
    return {
      error: result.upgradeTo
        ? `${result.reason} Upgrade on the billing page.`
        : result.reason,
      notice: null,
    };
  }

  const message = inviteEmail({
    firmName: firm.name,
    inviterName: user.name,
    acceptUrl: result.acceptUrl,
  });
  const sent = await sendEmail({ to: [result.email], ...message });

  revalidatePath("/settings");
  return {
    error: null,
    notice: sent.dryRun
      ? `Seat reserved. DRY_RUN is on, so no email went out — send them this link yourself: ${result.acceptUrl}`
      : sent.ok
        ? `Invitation sent to ${result.email}.`
        : `Seat reserved, but the email failed (${sent.error}). Send them this link: ${result.acceptUrl}`,
  };
}

export async function removeSeatAction(formData: FormData): Promise<void> {
  const { firm, user } = await requireAdmin();
  const db = getDb();
  const seatId = field(formData, "userId");
  if (seatId === user.id) throw new Error("You cannot remove your own seat.");

  const [seat] = await db.select().from(users).where(eq(users.id, seatId));
  if (!seat || seat.firmId !== firm.id) throw new Error("That seat does not belong to this firm.");
  if (seat.passwordHash) {
    throw new Error(
      "That seat has been accepted and may own pursuits or checklist items. Change their role instead of deleting the record.",
    );
  }

  await db.delete(users).where(eq(users.id, seatId));
  await audit({
    firmId: firm.id,
    actor: user.id,
    action: "seat.invitation_revoked",
    target: seatId,
    metadata: { email: seat.email },
  });
  revalidatePath("/settings");
}

export async function setSeatRoleAction(formData: FormData): Promise<void> {
  const { firm, user } = await requireAdmin();
  const db = getDb();
  const seatId = field(formData, "userId");
  const role = field(formData, "role") === "admin" ? "admin" : "member";

  const [seat] = await db.select().from(users).where(eq(users.id, seatId));
  if (!seat || seat.firmId !== firm.id) throw new Error("That seat does not belong to this firm.");

  if (seat.id === user.id && role === "member") {
    const admins = await db.select().from(users).where(eq(users.firmId, firm.id));
    const otherAdmins = admins.filter((row) => row.role === "admin" && row.id !== user.id);
    if (otherAdmins.length === 0) {
      throw new Error("Promote someone else to admin first — a firm cannot have zero admins.");
    }
  }

  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, seatId));
  await audit({
    firmId: firm.id,
    actor: user.id,
    action: "seat.role_changed",
    target: seatId,
    metadata: { role },
  });
  revalidatePath("/settings");
}
