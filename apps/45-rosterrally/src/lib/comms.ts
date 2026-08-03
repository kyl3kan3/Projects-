/**
 * Parent communications: audience targeting, fan-out, and the receipt grid.
 *
 * "Sent" is not "seen", so every send is a `deliveries` row and the console shows
 * who actually opened it. The honesty rules are structural:
 *
 *  - Email opens come from a tracking pixel; clicks from a rewritten link.
 *  - SMS cannot report an open. It gets the carrier's delivery receipt and a
 *    tracked link, and following that link records `viewed_link` — labelled
 *    exactly that. An SMS is never shown as "opened".
 *  - SMS goes only to households that ticked consent at registration, and only
 *    while the club is inside its monthly SMS budget. A skipped send is a
 *    `skipped` delivery row with a reason, not a silent absence.
 *
 * Fan-out runs inline with a bounded batch rather than through a queue: Vercel has
 * no always-on process (see DEPLOYING.md), and a 200-household club is a few
 * hundred rows. Anything time-based — game-day reminders, volunteer nudges — is
 * driven by the daily cron sweep instead.
 */

import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  announcements,
  clubs,
  deliveries,
  divisions,
  households,
  players,
  registrations,
  rosterSpots,
  smsUsage,
  teams,
  type Announcement,
  type AudienceSpec,
  type Delivery,
  type DeliveryChannel,
  type DeliveryStatus,
  type Household,
} from "@/db/schema";
import { audit, SYSTEM, type Actor } from "@/lib/audit";
import { env } from "@/lib/env";
import { householdUrl, mintHouseholdToken } from "@/lib/links";
import { isReached } from "@/lib/notices";
import { emailShell, sendEmail, sendSms } from "@/lib/notify";

/* -------------------------------------------------------------- audience --- */

export interface Recipient {
  household: Household;
  /** Why they are in this audience — shown in the preview, not stored. */
  reason: string;
}

/**
 * Resolve an audience to households, deduped.
 *
 * Club-wide means every household with an active registration this season, not
 * every household that ever registered: a family who left two seasons ago does
 * not get this year's rain-out text.
 */
export async function resolveAudience(
  clubId: string,
  seasonId: string,
  audience: AudienceSpec,
): Promise<Recipient[]> {
  const db = getDb();
  const seen = new Map<string, Recipient>();

  if (audience.kind === "club") {
    const rows = await db
      .selectDistinct({ household: households })
      .from(registrations)
      .innerJoin(households, eq(households.id, registrations.householdId))
      .where(
        and(
          eq(registrations.clubId, clubId),
          eq(registrations.seasonId, seasonId),
          or(eq(registrations.status, "active"), eq(registrations.status, "waitlisted")),
        ),
      );
    for (const r of rows) seen.set(r.household.id, { household: r.household, reason: "Club-wide" });
    return [...seen.values()];
  }

  if (audience.kind === "division") {
    if (audience.divisionIds.length === 0) return [];
    const rows = await db
      .selectDistinct({ household: households, divisionName: divisions.name })
      .from(registrations)
      .innerJoin(households, eq(households.id, registrations.householdId))
      .innerJoin(divisions, eq(divisions.id, registrations.divisionId))
      .where(
        and(
          eq(registrations.seasonId, seasonId),
          inArray(registrations.divisionId, audience.divisionIds),
          or(eq(registrations.status, "active"), eq(registrations.status, "waitlisted")),
        ),
      );
    for (const r of rows) {
      seen.set(r.household.id, { household: r.household, reason: r.divisionName });
    }
    return [...seen.values()];
  }

  if (audience.teamIds.length === 0) return [];
  const rows = await db
    .selectDistinct({ household: households, teamName: teams.name })
    .from(rosterSpots)
    .innerJoin(players, eq(players.id, rosterSpots.playerId))
    .innerJoin(households, eq(households.id, players.householdId))
    .innerJoin(teams, eq(teams.id, rosterSpots.teamId))
    .where(inArray(rosterSpots.teamId, audience.teamIds));
  for (const r of rows) seen.set(r.household.id, { household: r.household, reason: r.teamName });
  return [...seen.values()];
}

export interface AudiencePreview {
  total: number;
  emailCount: number;
  smsCount: number;
  /** Households with no consent — counted honestly so nobody expects a text. */
  smsUnconsented: number;
  label: string;
}

export async function previewAudience(
  clubId: string,
  seasonId: string,
  audience: AudienceSpec,
  channels: DeliveryChannel[],
): Promise<AudiencePreview> {
  const recipients = await resolveAudience(clubId, seasonId, audience);
  const withPhone = recipients.filter((r) => r.household.smsConsent && r.household.phone);
  return {
    total: recipients.length,
    emailCount: channels.includes("email") ? recipients.length : 0,
    smsCount: channels.includes("sms") ? withPhone.length : 0,
    smsUnconsented: channels.includes("sms") ? recipients.length - withPhone.length : 0,
    label: await audienceLabel(seasonId, audience),
  };
}

export async function audienceLabel(seasonId: string, audience: AudienceSpec): Promise<string> {
  const db = getDb();
  if (audience.kind === "club") return "Everyone in the club";
  if (audience.kind === "division") {
    if (audience.divisionIds.length === 0) return "No divisions chosen";
    const rows = await db
      .select({ name: divisions.name })
      .from(divisions)
      .where(inArray(divisions.id, audience.divisionIds));
    return rows.map((r) => r.name).join(" · ") || "No divisions chosen";
  }
  if (audience.teamIds.length === 0) return "No teams chosen";
  const rows = await db
    .select({ name: teams.name })
    .from(teams)
    .where(inArray(teams.id, audience.teamIds));
  return rows.map((r) => r.name).join(" · ") || "No teams chosen";
}

/* ------------------------------------------------------------- sending it --- */

export interface SendSummary {
  announcementId: string;
  emailsSent: number;
  smsSent: number;
  skipped: number;
  failed: number;
  simulated: boolean;
}

function trackingPixel(deliveryId: string): string {
  return `${env.appUrl}/api/t/o/${deliveryId}`;
}

function trackedLink(deliveryId: string, target: string): string {
  return `${env.appUrl}/api/t/c/${deliveryId}?to=${encodeURIComponent(target)}`;
}

function monthKey(at: Date = new Date()): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** How much SMS headroom this club has left this month. */
export async function smsHeadroom(clubId: string, budget: number): Promise<number> {
  const [row] = await getDb()
    .select()
    .from(smsUsage)
    .where(and(eq(smsUsage.clubId, clubId), eq(smsUsage.month, monthKey())));
  return Math.max(0, budget - Number(row?.sent ?? 0));
}

async function countSms(clubId: string, n: number): Promise<void> {
  await getDb()
    .insert(smsUsage)
    .values({ clubId, month: monthKey(), sent: n })
    .onConflictDoUpdate({
      target: [smsUsage.clubId, smsUsage.month],
      set: { sent: sql`${smsUsage.sent} + ${n}` },
    });
}

/**
 * Compose and send. One function, because "create then send" leaves a draft that
 * a volunteer thinks went out.
 */
export async function sendAnnouncement(args: {
  clubId: string;
  seasonId: string;
  audience: AudienceSpec;
  subject: string;
  body: string;
  channels: DeliveryChannel[];
  purpose?: string;
  actor: Actor;
  smsBudget: number;
}): Promise<SendSummary> {
  const db = getDb();
  if (!args.subject.trim()) throw new Error("Give the message a subject");
  if (!args.body.trim()) throw new Error("Write something in the message");
  if (args.channels.length === 0) throw new Error("Pick at least one channel");

  const recipients = await resolveAudience(args.clubId, args.seasonId, args.audience);
  if (recipients.length === 0) {
    throw new Error("That audience has nobody in it yet — nothing was sent");
  }

  const [club] = await db.select().from(clubs).where(eq(clubs.id, args.clubId));
  const label = await audienceLabel(args.seasonId, args.audience);

  const [announcement] = await db
    .insert(announcements)
    .values({
      clubId: args.clubId,
      seasonId: args.seasonId,
      audience: args.audience,
      audienceLabel: label,
      subject: args.subject.trim(),
      body: args.body.trim(),
      channels: args.channels,
      purpose: args.purpose ?? "announcement",
      sentByUserId: args.actor.kind === "user" ? args.actor.id : null,
      sentAt: new Date(),
    })
    .returning();

  const summary = await fanOut({
    announcement,
    recipients,
    clubName: club?.name ?? "Your club",
    smsBudget: args.smsBudget,
  });

  await audit(args.clubId, args.actor, "announcement_sent", `announcement:${announcement.id}`, {
    audience: label,
    recipients: recipients.length,
    emails: summary.emailsSent,
    sms: summary.smsSent,
  });
  return summary;
}

/**
 * Deliver one announcement to a set of recipients.
 *
 * A delivery row is inserted *before* the send and updated after, so a crash
 * mid-fan-out leaves evidence rather than a mystery. The unique index on
 * (announcement, household, channel, resend_of) makes re-running a half-finished
 * fan-out skip everyone who already has a row.
 */
async function fanOut(args: {
  announcement: Announcement;
  recipients: Recipient[];
  clubName: string;
  smsBudget: number;
  resendOfId?: string | null;
}): Promise<SendSummary> {
  const db = getDb();
  const announcement = args.announcement;
  let emailsSent = 0;
  let smsSent = 0;
  let skipped = 0;
  let failed = 0;
  let simulated = false;

  let smsLeft = announcement.channels.includes("sms")
    ? await smsHeadroom(announcement.clubId, args.smsBudget)
    : 0;

  for (const recipient of args.recipients) {
    const household = recipient.household;
    const token = await mintHouseholdToken(household.id);
    const link = householdUrl(token);

    if (announcement.channels.includes("email")) {
      const [row] = await db
        .insert(deliveries)
        .values({
          clubId: announcement.clubId,
          announcementId: announcement.id,
          householdId: household.id,
          channel: "email",
          destination: household.email,
          status: "queued",
          resendOfId: args.resendOfId ?? null,
        })
        .onConflictDoNothing({
          target: [
            deliveries.announcementId,
            deliveries.householdId,
            deliveries.channel,
            deliveries.resendOfId,
          ],
        })
        .returning();

      if (row) {
        const { html, text } = emailShell({
          clubName: args.clubName,
          heading: announcement.subject,
          paragraphs: announcement.body.split(/\n{2,}/),
          action: { label: "Open your family page", url: trackedLink(row.id, link) },
          footer: `Sent to ${household.email} because a child in your family is registered with ${args.clubName}.`,
          trackingPixelUrl: trackingPixel(row.id),
        });
        const result = await sendEmail({
          to: household.email,
          subject: announcement.subject,
          html,
          text,
        });
        simulated = simulated || result.simulated;
        await db
          .update(deliveries)
          .set({
            status: result.ok ? "sent" : "failed",
            providerMessageId: result.providerMessageId,
            error: result.error,
            sentAt: result.ok ? new Date() : null,
            // A simulated send has no carrier to report back, so record the
            // delivery ourselves rather than leaving every row stuck at "sent".
            deliveredAt: result.ok && result.simulated ? new Date() : null,
          })
          .where(eq(deliveries.id, row.id));
        if (result.ok) emailsSent += 1;
        else failed += 1;
      }
    }

    if (announcement.channels.includes("sms")) {
      const consented = household.smsConsent && household.phone;
      const withinBudget = smsLeft > 0;
      const [row] = await db
        .insert(deliveries)
        .values({
          clubId: announcement.clubId,
          announcementId: announcement.id,
          householdId: household.id,
          channel: "sms",
          destination: household.phone ?? "(no number)",
          status: "queued",
          resendOfId: args.resendOfId ?? null,
        })
        .onConflictDoNothing({
          target: [
            deliveries.announcementId,
            deliveries.householdId,
            deliveries.channel,
            deliveries.resendOfId,
          ],
        })
        .returning();

      if (row) {
        if (!consented || !withinBudget) {
          await db
            .update(deliveries)
            .set({
              status: "skipped",
              error: !consented
                ? "No SMS consent on file for this family"
                : "The club's monthly SMS budget is used up",
            })
            .where(eq(deliveries.id, row.id));
          skipped += 1;
        } else {
          const result = await sendSms({
            to: household.phone!,
            body: `${args.clubName}: ${announcement.subject}. ${trackedLink(row.id, link)} Reply STOP to opt out.`,
          });
          simulated = simulated || result.simulated;
          await db
            .update(deliveries)
            .set({
              status: result.ok ? "sent" : "failed",
              providerMessageId: result.providerMessageId,
              error: result.error,
              sentAt: result.ok ? new Date() : null,
              deliveredAt: result.ok && result.simulated ? new Date() : null,
            })
            .where(eq(deliveries.id, row.id));
          if (result.ok) {
            smsSent += 1;
            smsLeft -= 1;
          } else {
            failed += 1;
          }
        }
      }
    }
  }

  if (smsSent > 0) await countSms(announcement.clubId, smsSent);
  return { announcementId: announcement.id, emailsSent, smsSent, skipped, failed, simulated };
}

/* -------------------------------------------------------------- receipts --- */

export interface ReceiptRow {
  householdId: string;
  contactName: string;
  email: string;
  channels: {
    channel: DeliveryChannel;
    status: DeliveryStatus;
    destination: string;
    openedAt: Date | null;
    clickedAt: Date | null;
    deliveredAt: Date | null;
    error: string | null;
  }[];
  /** True when this family demonstrably saw it on some channel. */
  reached: boolean;
}

export interface ReceiptGrid {
  announcement: Announcement;
  rows: ReceiptRow[];
  counts: {
    sent: number;
    delivered: number;
    opened: number;
    viewedLink: number;
    failed: number;
    skipped: number;
    unreached: number;
  };
}

export async function getReceipts(announcementId: string): Promise<ReceiptGrid | null> {
  const db = getDb();
  const [announcement] = await db
    .select()
    .from(announcements)
    .where(eq(announcements.id, announcementId));
  if (!announcement) return null;

  const rows = await db
    .select({ delivery: deliveries, household: households })
    .from(deliveries)
    .innerJoin(households, eq(households.id, deliveries.householdId))
    .where(eq(deliveries.announcementId, announcementId))
    .orderBy(asc(households.contactName), asc(deliveries.channel));

  const byHousehold = new Map<string, ReceiptRow>();
  for (const r of rows) {
    const entry =
      byHousehold.get(r.household.id) ??
      ({
        householdId: r.household.id,
        contactName: r.household.contactName,
        email: r.household.email,
        channels: [],
        reached: false,
      } satisfies ReceiptRow);
    entry.channels.push({
      channel: r.delivery.channel,
      status: r.delivery.status,
      destination: r.delivery.destination,
      openedAt: r.delivery.openedAt,
      clickedAt: r.delivery.clickedAt,
      deliveredAt: r.delivery.deliveredAt,
      error: r.delivery.error,
    });
    entry.reached =
      entry.reached || isReached(r.delivery.status, r.delivery.openedAt, r.delivery.clickedAt);
    byHousehold.set(r.household.id, entry);
  }

  const all = rows.map((r) => r.delivery);
  const grid = [...byHousehold.values()];
  return {
    announcement,
    rows: grid,
    counts: {
      sent: all.filter((d) => d.sentAt).length,
      delivered: all.filter((d) => d.deliveredAt).length,
      opened: all.filter((d) => d.channel === "email" && d.openedAt).length,
      viewedLink: all.filter((d) => d.channel === "sms" && d.clickedAt).length,
      failed: all.filter((d) => d.status === "failed" || d.status === "bounced").length,
      skipped: all.filter((d) => d.status === "skipped").length,
      unreached: grid.filter((g) => !g.reached).length,
    },
  };
}

/** Record an email open. Idempotent: the first open is the one that counts. */
export async function recordOpen(deliveryId: string): Promise<void> {
  const db = getDb();
  await db
    .update(deliveries)
    .set({ status: "opened", openedAt: new Date(), deliveredAt: sql`coalesce(${deliveries.deliveredAt}, now())` })
    .where(and(eq(deliveries.id, deliveryId), isNull(deliveries.openedAt)));
}

/**
 * Record a click (email) or a link view (SMS).
 *
 * The SMS case sets `clicked_at` and the `viewed_link` status, never `opened`:
 * following a link proves the message was seen, and that is a different, weaker
 * claim than an open, so it gets a different word in the UI.
 */
export async function recordClick(deliveryId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db.select().from(deliveries).where(eq(deliveries.id, deliveryId));
  if (!row) return null;
  await db
    .update(deliveries)
    .set({
      status: row.channel === "sms" ? "viewed_link" : "clicked",
      clickedAt: row.clickedAt ?? new Date(),
      openedAt: row.channel === "email" ? (row.openedAt ?? new Date()) : row.openedAt,
      deliveredAt: row.deliveredAt ?? new Date(),
    })
    .where(eq(deliveries.id, deliveryId));
  return row.id;
}

/** Provider delivery receipt (Resend/Twilio webhooks). */
export async function recordDelivered(providerMessageId: string): Promise<void> {
  await getDb()
    .update(deliveries)
    .set({ status: "delivered", deliveredAt: new Date() })
    .where(
      and(
        eq(deliveries.providerMessageId, providerMessageId),
        inArray(deliveries.status, ["queued", "sent"]),
      ),
    );
}

export async function recordBounce(providerMessageId: string, error: string): Promise<void> {
  await getDb()
    .update(deliveries)
    .set({ status: "bounced", error })
    .where(eq(deliveries.providerMessageId, providerMessageId));
}

/**
 * Re-send to exactly the households that have not demonstrably seen it.
 *
 * "Not seen" means no open, no click, no link view on any channel. A household
 * whose email bounced is included; a household who opened it is not, no matter
 * how many channels it went out on.
 */
export async function resendToUnreached(
  announcementId: string,
  actor: Actor,
  smsBudget: number,
): Promise<SendSummary> {
  const db = getDb();
  const grid = await getReceipts(announcementId);
  if (!grid) throw new Error("No such announcement");
  const unreachedIds = grid.rows.filter((r) => !r.reached).map((r) => r.householdId);
  if (unreachedIds.length === 0) {
    throw new Error("Every household has already opened this one");
  }

  const [club] = await db.select().from(clubs).where(eq(clubs.id, grid.announcement.clubId));
  const rows = await db.select().from(households).where(inArray(households.id, unreachedIds));

  const summary = await fanOut({
    announcement: grid.announcement,
    recipients: rows.map((h) => ({ household: h, reason: "Re-send" })),
    clubName: club?.name ?? "Your club",
    smsBudget,
    // A distinct attempt id, so the unique index treats this as a new send
    // rather than swallowing it as a duplicate of the original.
    resendOfId: announcementId,
  });

  await audit(grid.announcement.clubId, actor, "announcement_resent", `announcement:${announcementId}`, {
    households: unreachedIds.length,
  });
  return summary;
}

/* --------------------------------------------------------------- archives --- */

export async function listAnnouncements(clubId: string, limit = 30) {
  const db = getDb();
  const rows = await db
    .select({ announcement: announcements })
    .from(announcements)
    .where(eq(announcements.clubId, clubId))
    .orderBy(desc(announcements.createdAt))
    .limit(limit);
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.announcement.id);
  const counts = await db
    .select({
      announcementId: deliveries.announcementId,
      total: sql<number>`count(*)::int`,
      reached: sql<number>`count(*) filter (where ${deliveries.openedAt} is not null or ${deliveries.clickedAt} is not null)::int`,
    })
    .from(deliveries)
    .where(inArray(deliveries.announcementId, ids))
    .groupBy(deliveries.announcementId);

  return rows.map((r) => ({
    announcement: r.announcement,
    total: Number(counts.find((c) => c.announcementId === r.announcement.id)?.total ?? 0),
    reached: Number(counts.find((c) => c.announcementId === r.announcement.id)?.reached ?? 0),
  }));
}

/**
 * Every message this family was sent, for their own page. This is the answer to
 * "I never got it": the archive is theirs, permanently, with the timestamps.
 */
export async function householdInbox(householdId: string): Promise<
  { announcement: Announcement; delivery: Delivery }[]
> {
  return getDb()
    .select({ announcement: announcements, delivery: deliveries })
    .from(deliveries)
    .innerJoin(announcements, eq(announcements.id, deliveries.announcementId))
    .where(eq(deliveries.householdId, householdId))
    .orderBy(desc(deliveries.createdAt));
}

/**
 * Send one message to one household outside an announcement audience — a payment
 * reminder, a waitlist promotion, a volunteer confirmation.
 */
export async function notifyHousehold(args: {
  clubId: string;
  seasonId: string;
  householdId: string;
  subject: string;
  body: string;
  channels: DeliveryChannel[];
  purpose: string;
  smsBudget: number;
}): Promise<SendSummary> {
  const db = getDb();
  const [household] = await db.select().from(households).where(eq(households.id, args.householdId));
  if (!household) throw new Error("No such household");
  const [club] = await db.select().from(clubs).where(eq(clubs.id, args.clubId));

  const [announcement] = await db
    .insert(announcements)
    .values({
      clubId: args.clubId,
      seasonId: args.seasonId,
      audience: { kind: "team", teamIds: [] },
      audienceLabel: household.contactName,
      subject: args.subject,
      body: args.body,
      channels: args.channels,
      purpose: args.purpose,
      sentAt: new Date(),
    })
    .returning();

  return fanOut({
    announcement,
    recipients: [{ household, reason: "Direct" }],
    clubName: club?.name ?? "Your club",
    smsBudget: args.smsBudget,
  });
}

export { SYSTEM };
