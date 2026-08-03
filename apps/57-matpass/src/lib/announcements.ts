/**
 * School announcements, with per-household delivery status.
 *
 * "42 delivered · 1 bounced — fix this address" is the whole feature: a school
 * that mails 60 families and cannot tell which one never got it has not sent an
 * announcement, it has hoped. So the fan-out writes one `deliveries` row per
 * household and records the outcome per row, and a household with no guardian
 * address is a visible failure rather than a silent skip.
 *
 * Audience is either the whole school or a set of programs; program targeting
 * resolves through enrollments to households, deduplicated — a family with three
 * kids in two programs gets one email.
 */

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  announcements,
  deliveries,
  enrollments,
  families,
  programs,
  students,
  type Announcement,
  type DeliveryStatus,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";

export interface AudienceTarget {
  all: boolean;
  programIds?: string[];
}

/** Households that should receive an announcement, deduplicated. */
export async function resolveAudience(input: {
  schoolId: string;
  audience: AudienceTarget;
}): Promise<{ id: string; name: string; email: string | null }[]> {
  const db = getDb();
  if (input.audience.all || !input.audience.programIds?.length) {
    return db
      .select({ id: families.id, name: families.name, email: families.email })
      .from(families)
      .where(eq(families.schoolId, input.schoolId))
      .orderBy(asc(families.name));
  }
  const rows = await db
    .selectDistinct({ id: families.id, name: families.name, email: families.email })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(families, eq(families.id, students.familyId))
    .innerJoin(programs, eq(programs.id, enrollments.programId))
    .where(
      and(
        eq(families.schoolId, input.schoolId),
        inArray(enrollments.programId, input.audience.programIds),
        eq(enrollments.status, "active"),
      ),
    )
    .orderBy(asc(families.name));
  return rows;
}

export async function composeAnnouncement(input: {
  schoolId: string;
  subject: string;
  bodyMd: string;
  audience: AudienceTarget;
  sentBy: string;
}): Promise<Announcement> {
  const subject = input.subject.trim();
  const body = input.bodyMd.trim();
  if (subject.length < 3) throw new Error("Give the announcement a subject");
  if (body.length < 10) throw new Error("Write the announcement body");
  const db = getDb();
  const [announcement] = await db
    .insert(announcements)
    .values({
      schoolId: input.schoolId,
      subject,
      bodyMd: body,
      audience: input.audience,
      sentBy: input.sentBy,
    })
    .returning();
  return announcement;
}

export interface FanoutResult {
  queued: number;
  sent: number;
  failed: number;
  noAddress: number;
}

/**
 * Send it. Rows are written before the send so a crash mid-fan-out leaves a
 * queued row rather than an invisible gap, and the unique index on
 * (announcement, family) makes a re-run resume instead of double-mailing.
 */
export async function fanOut(input: {
  announcementId: string;
  schoolId: string;
  schoolName: string;
}): Promise<FanoutResult> {
  const db = getDb();
  const [announcement] = await db
    .select()
    .from(announcements)
    .where(
      and(eq(announcements.id, input.announcementId), eq(announcements.schoolId, input.schoolId)),
    );
  if (!announcement) throw new Error("Announcement not found");

  const audience = await resolveAudience({ schoolId: input.schoolId, audience: announcement.audience });
  const existing = await db
    .select({ familyId: deliveries.familyId, status: deliveries.status })
    .from(deliveries)
    .where(eq(deliveries.announcementId, announcement.id));
  const done = new Set(
    existing.filter((d) => d.status !== "queued").map((d) => d.familyId),
  );

  const result: FanoutResult = { queued: 0, sent: 0, failed: 0, noAddress: 0 };

  for (const family of audience) {
    if (done.has(family.id)) continue;
    await db
      .insert(deliveries)
      .values({ announcementId: announcement.id, familyId: family.id, status: "queued" })
      .onConflictDoNothing({ target: [deliveries.announcementId, deliveries.familyId] });
    result.queued += 1;

    if (!family.email) {
      await markDelivery(announcement.id, family.id, "failed", null);
      result.noAddress += 1;
      continue;
    }
    const send = await sendEmail({
      to: family.email,
      subject: announcement.subject,
      text: `${announcement.bodyMd}\n\n— ${input.schoolName}`,
    });
    if (send.ok) {
      // Resend reports acceptance; a later provider webhook can promote this to
      // "delivered" or knock it down to "bounced".
      await markDelivery(announcement.id, family.id, "sent", send.messageId);
      result.sent += 1;
    } else {
      await markDelivery(announcement.id, family.id, "bounced", null);
      result.failed += 1;
    }
  }

  if (!announcement.sentAt) {
    await db
      .update(announcements)
      .set({ sentAt: new Date() })
      .where(eq(announcements.id, announcement.id));
  }

  await audit({
    schoolId: input.schoolId,
    actorId: announcement.sentBy,
    action: "announcement.sent",
    target: announcement.id,
    metadata: { ...result, subject: announcement.subject },
  });

  return result;
}

async function markDelivery(
  announcementId: string,
  familyId: string,
  status: DeliveryStatus,
  providerMessageId: string | null,
): Promise<void> {
  const db = getDb();
  await db
    .update(deliveries)
    .set({ status, providerMessageId, occurredAt: new Date() })
    .where(and(eq(deliveries.announcementId, announcementId), eq(deliveries.familyId, familyId)));
}

export interface AnnouncementSummary extends Announcement {
  counts: Record<DeliveryStatus, number>;
  audienceLabel: string;
}

export async function listAnnouncements(schoolId: string): Promise<AnnouncementSummary[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(announcements)
    .where(eq(announcements.schoolId, schoolId))
    .orderBy(desc(announcements.createdAt));
  if (rows.length === 0) return [];

  const deliveryRows = await db
    .select({ announcementId: deliveries.announcementId, status: deliveries.status })
    .from(deliveries)
    .where(inArray(deliveries.announcementId, rows.map((r) => r.id)));

  const programRows = await db
    .select({ id: programs.id, name: programs.name })
    .from(programs)
    .where(eq(programs.schoolId, schoolId));
  const programName = new Map(programRows.map((p) => [p.id, p.name]));

  return rows.map((row) => {
    const counts: Record<DeliveryStatus, number> = {
      queued: 0,
      sent: 0,
      delivered: 0,
      bounced: 0,
      failed: 0,
    };
    for (const d of deliveryRows) {
      if (d.announcementId === row.id) counts[d.status] += 1;
    }
    return {
      ...row,
      counts,
      audienceLabel: row.audience.all
        ? "Whole school"
        : (row.audience.programIds ?? []).map((id) => programName.get(id) ?? "Program").join(", ") ||
          "Whole school",
    };
  });
}

export interface DeliveryRow {
  familyName: string;
  email: string | null;
  status: DeliveryStatus;
  occurredAt: Date;
  providerMessageId: string | null;
}

export async function deliveryDetail(input: {
  announcementId: string;
  schoolId: string;
}): Promise<DeliveryRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      familyName: families.name,
      email: families.email,
      status: deliveries.status,
      occurredAt: deliveries.occurredAt,
      providerMessageId: deliveries.providerMessageId,
    })
    .from(deliveries)
    .innerJoin(families, eq(families.id, deliveries.familyId))
    .innerJoin(announcements, eq(announcements.id, deliveries.announcementId))
    .where(
      and(eq(deliveries.announcementId, input.announcementId), eq(announcements.schoolId, input.schoolId)),
    )
    .orderBy(asc(families.name));
  return rows;
}
