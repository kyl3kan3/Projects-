/**
 * Segmented announcements over email and SMS, with per-recipient delivery
 * tracking. Reaching people is the product; proving it reached them is the
 * feature that drives roster hygiene.
 *
 * Consent is enforced in `resolveSegment`, not in the compose UI: a member
 * without `sms_opt_in` is moved to the email list automatically, and the
 * compose screen shows the honest count ("SMS reaches 41 of 63") so nobody
 * believes a text went out that didn't.
 */

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  announcements,
  associations,
  deliveries,
  households,
  members,
  type Announcement,
  type DeliveryChannel,
  type Household,
  type Member,
  type SegmentSpec,
} from "@/db/schema";
import { audit, type Actor } from "@/lib/audit";
import { today } from "@/lib/dates";
import { agingBucket } from "@/lib/dues";
import { associationBalances } from "@/lib/invoicing";
import { sendEmail, sendSms } from "@/lib/notify";
import { firstName, renderTemplate } from "@/lib/text";
import { featureAllowed } from "@/lib/plans";
import { mintPortalToken, portalUrl } from "@/lib/portal";

export interface Recipient {
  member: Member;
  household: Household;
}

export interface SegmentResolution {
  recipients: Recipient[];
  emailReach: number;
  smsReach: number;
  /** People with neither an email nor a phone — a roster-hygiene prompt. */
  unreachable: number;
}

export const SEGMENT_LABELS: Record<string, string> = {
  all: "Every active household",
  delinquent_any: "Households with a balance",
  delinquent_30: "1-30 days past due",
  delinquent_60: "31-60 days past due",
  delinquent_90: "Over 60 days past due",
  units: "Selected units",
};

export function segmentLabel(segment: SegmentSpec): string {
  if (segment.kind === "all") return SEGMENT_LABELS.all;
  if (segment.kind === "units") return `${segment.householdIds.length} selected unit(s)`;
  return SEGMENT_LABELS[`delinquent_${segment.bucket}`] ?? "Households with a balance";
}

export async function resolveSegment(
  associationId: string,
  segment: SegmentSpec,
): Promise<SegmentResolution> {
  const db = getDb();
  const rows = await db
    .select({ member: members, household: households })
    .from(members)
    .innerJoin(households, eq(members.householdId, households.id))
    .where(and(eq(households.associationId, associationId), isNull(households.leftOn)));

  let allowed: Set<string> | null = null;
  if (segment.kind === "units") {
    allowed = new Set(segment.householdIds);
  } else if (segment.kind === "delinquent") {
    const balances = await associationBalances(associationId);
    const asOf = today();
    allowed = new Set(
      [...balances.values()]
        .filter((b) => {
          if (b.balanceCents <= 0) return false;
          if (segment.bucket === "any") return true;
          if (!b.oldestDueOn) return false;
          return agingBucket(b.oldestDueOn, asOf) === segment.bucket;
        })
        .map((b) => b.householdId),
    );
  }

  const recipients = rows.filter((r) => !allowed || allowed.has(r.household.id));
  return {
    recipients,
    emailReach: recipients.filter((r) => r.member.email).length,
    smsReach: recipients.filter((r) => r.member.smsOptIn && r.member.phone).length,
    unreachable: recipients.filter((r) => !r.member.email && !r.member.phone).length,
  };
}

export interface ComposeInput {
  associationId: string;
  subject: string;
  bodyMd: string;
  segment: SegmentSpec;
  channels: DeliveryChannel[];
}

export async function createAnnouncement(
  input: ComposeInput,
  actor: Actor,
): Promise<Announcement> {
  if (!input.subject.trim()) throw new Error("Give the announcement a subject");
  if (!input.bodyMd.trim()) throw new Error("Write something to send");
  if (input.channels.length === 0) throw new Error("Pick at least one channel");
  const [row] = await getDb()
    .insert(announcements)
    .values({
      associationId: input.associationId,
      subject: input.subject.trim(),
      bodyMd: input.bodyMd.trim(),
      segment: input.segment,
      channels: input.channels,
      sentByUserId: actor.kind === "user" ? actor.id : null,
    })
    .returning();
  return row;
}

export interface SendSummary {
  emailsSent: number;
  emailsFailed: number;
  smsSent: number;
  smsSkipped: number;
  recipients: number;
}

/**
 * Fan out an announcement. Safe to retry: `deliveries` is unique on
 * (announcement, member, channel), so a half-finished send resumes rather than
 * re-messaging everyone who already received it.
 */
export async function sendAnnouncement(
  announcementId: string,
  actor: Actor,
): Promise<SendSummary> {
  const db = getDb();
  const [announcement] = await db
    .select()
    .from(announcements)
    .where(eq(announcements.id, announcementId));
  if (!announcement) throw new Error("No such announcement");
  const [association] = await db
    .select()
    .from(associations)
    .where(eq(associations.id, announcement.associationId));
  if (!association) throw new Error("No such association");

  const { recipients } = await resolveSegment(announcement.associationId, announcement.segment);
  const smsAllowed =
    announcement.channels.includes("sms") && featureAllowed(association.plan, "sms");

  const summary: SendSummary = {
    emailsSent: 0,
    emailsFailed: 0,
    smsSent: 0,
    smsSkipped: 0,
    recipients: recipients.length,
  };

  // Which recipients already have a delivery row from an earlier attempt.
  const already = await db
    .select({ memberId: deliveries.memberId, channel: deliveries.channel })
    .from(deliveries)
    .where(eq(deliveries.announcementId, announcementId));
  const done = new Set(already.map((d) => `${d.memberId}:${d.channel}`));

  for (const { member, household } of recipients) {
    const link = portalUrl(await mintPortalToken(member.id));
    const vars: Record<string, string> = {
      name: firstName(member.name),
      unit: household.unitLabel,
      association: association.name,
      portalLink: link,
    };
    const body = renderTemplate(announcement.bodyMd, vars);
    const subject = renderTemplate(announcement.subject, vars);
    const ctx = {
      associationId: announcement.associationId,
      memberId: member.id,
      purpose: "announcement",
      announcementId,
    };

    if (smsAllowed && !done.has(`${member.id}:sms`)) {
      const res = await sendSms(ctx, member, `${association.name}: ${subject}\n\n${body}`);
      if (res.status === "sent" || res.status === "delivered") summary.smsSent += 1;
      else summary.smsSkipped += 1;
    }

    if (announcement.channels.includes("email") && !done.has(`${member.id}:email`)) {
      const res = await sendEmail(ctx, {
        to: member.email ?? "",
        subject,
        text: `${body}\n\n---\n${association.name}\nYour household portal: ${link}`,
      });
      if (res.status === "sent" || res.status === "delivered") summary.emailsSent += 1;
      else summary.emailsFailed += 1;
    }
  }

  await db
    .update(announcements)
    .set({ sentAt: new Date() })
    .where(eq(announcements.id, announcementId));

  await audit(announcement.associationId, actor, "sent_announcement", announcement.subject, {
    announcementId,
    ...summary,
  });
  return summary;
}

/* --------------------------------------------------------- delivery report --- */

export interface DeliveryReport {
  announcement: Announcement;
  counts: Record<string, number>;
  /** Rows the board should act on: bad addresses and failures. */
  problems: {
    memberId: string | null;
    memberName: string;
    unitLabel: string;
    channel: DeliveryChannel;
    destination: string;
    status: string;
    error: string | null;
  }[];
  total: number;
}

export async function deliveryReport(announcementId: string): Promise<DeliveryReport | null> {
  const db = getDb();
  const [announcement] = await db
    .select()
    .from(announcements)
    .where(eq(announcements.id, announcementId));
  if (!announcement) return null;

  const rows = await db
    .select({ delivery: deliveries, member: members, household: households })
    .from(deliveries)
    .leftJoin(members, eq(deliveries.memberId, members.id))
    .leftJoin(households, eq(members.householdId, households.id))
    .where(eq(deliveries.announcementId, announcementId))
    .orderBy(desc(deliveries.occurredAt));

  const counts: Record<string, number> = {};
  const problems: DeliveryReport["problems"] = [];
  for (const { delivery, member, household } of rows) {
    counts[delivery.status] = (counts[delivery.status] ?? 0) + 1;
    if (["bounced", "failed", "skipped", "opted_out"].includes(delivery.status)) {
      problems.push({
        memberId: delivery.memberId,
        memberName: member?.name ?? "Unknown member",
        unitLabel: household?.unitLabel ?? "—",
        channel: delivery.channel,
        destination: delivery.destination,
        status: delivery.status,
        error: delivery.error,
      });
    }
  }
  return { announcement, counts, problems, total: rows.length };
}

export async function listAnnouncements(associationId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(announcements)
    .where(eq(announcements.associationId, associationId))
    .orderBy(desc(announcements.createdAt))
    .limit(50);
  if (rows.length === 0) return [];
  const stats = await db
    .select({ announcementId: deliveries.announcementId, status: deliveries.status })
    .from(deliveries)
    .where(inArray(deliveries.announcementId, rows.map((r) => r.id)));
  return rows.map((announcement) => {
    const mine = stats.filter((s) => s.announcementId === announcement.id);
    return {
      announcement,
      delivered: mine.filter((s) => s.status === "sent" || s.status === "delivered").length,
      problems: mine.filter((s) =>
        ["bounced", "failed", "skipped", "opted_out"].includes(s.status),
      ).length,
    };
  });
}

/** Fix a bounced address inline — the roster-hygiene loop. */
export async function correctMemberEmail(
  memberId: string,
  email: string,
  actor: Actor,
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ member: members, household: households })
    .from(members)
    .innerJoin(households, eq(members.householdId, households.id))
    .where(eq(members.id, memberId));
  if (!row) throw new Error("No such member");
  const clean = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw new Error("That is not a valid email address");
  await db.update(members).set({ email: clean }).where(eq(members.id, memberId));
  await audit(
    row.household.associationId,
    actor,
    "corrected_email",
    `${row.member.name} · unit ${row.household.unitLabel}`,
    { memberId, from: row.member.email, to: clean },
  );
}
