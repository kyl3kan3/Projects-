"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { announcements, type DeliveryChannel, type SegmentSpec } from "@/db/schema";
import { requireCapability } from "@/lib/auth";
import type { Actor } from "@/lib/audit";
import {
  correctMemberEmail,
  createAnnouncement,
  sendAnnouncement,
} from "@/lib/announcements";
import { featureAllowed, planForFeature } from "@/lib/plans";

export interface AnnounceState {
  error?: string;
  ok?: string;
}

function actorFor(user: { id: string; name: string }): Actor {
  return { kind: "user", id: user.id, name: user.name };
}

function segmentFrom(value: string): SegmentSpec {
  if (value === "all") return { kind: "all" };
  if (value.startsWith("delinquent:")) {
    const bucket = value.split(":")[1];
    if (["any", "30", "60", "90"].includes(bucket)) {
      return { kind: "delinquent", bucket: bucket as "any" | "30" | "60" | "90" };
    }
  }
  return { kind: "all" };
}

export async function sendAnnouncementAction(
  _prev: AnnounceState,
  formData: FormData,
): Promise<AnnounceState> {
  try {
    const { association, user } = await requireCapability("announce");
    const channels: DeliveryChannel[] = ["email"];
    const wantsSms = formData.get("sms") === "on";
    const smsAllowed = featureAllowed(association.plan, "sms");
    if (wantsSms && smsAllowed) channels.push("sms");

    const announcement = await createAnnouncement(
      {
        associationId: association.id,
        subject: String(formData.get("subject") ?? ""),
        bodyMd: String(formData.get("body") ?? ""),
        segment: segmentFrom(String(formData.get("segment") ?? "all")),
        channels,
      },
      actorFor(user),
    );

    const summary = await sendAnnouncement(announcement.id, actorFor(user));
    revalidatePath("/announce");

    const smsNote = wantsSms && !smsAllowed
      ? ` Text messages need ${planForFeature("sms").name}, so this went by email only.`
      : summary.smsSent > 0
        ? ` ${summary.smsSent} text${summary.smsSent === 1 ? "" : "s"} sent to members who opted in.`
        : "";

    return {
      ok:
        `${summary.emailsSent} email${summary.emailsSent === 1 ? "" : "s"} sent` +
        (summary.emailsFailed > 0 ? `, ${summary.emailsFailed} could not be delivered` : "") +
        `.${smsNote} Open the delivery report to fix any bad address.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send that announcement" };
  }
}

export async function resendAnnouncementAction(
  _prev: AnnounceState,
  formData: FormData,
): Promise<AnnounceState> {
  try {
    const { association, user } = await requireCapability("announce");
    const announcementId = String(formData.get("announcementId") ?? "");
    const [row] = await getDb()
      .select()
      .from(announcements)
      .where(
        and(
          eq(announcements.id, announcementId),
          eq(announcements.associationId, association.id),
        ),
      );
    if (!row) return { error: "That announcement is not on this association's record" };

    const summary = await sendAnnouncement(announcementId, actorFor(user));
    revalidatePath(`/announce/${announcementId}`);
    return {
      ok:
        summary.emailsSent === 0 && summary.smsSent === 0
          ? "Everyone in this segment already has it — nothing was sent twice."
          : `Filled the gaps: ${summary.emailsSent} email${summary.emailsSent === 1 ? "" : "s"} and ${summary.smsSent} text${summary.smsSent === 1 ? "" : "s"}.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not retry that send" };
  }
}

export async function fixEmailAction(
  _prev: AnnounceState,
  formData: FormData,
): Promise<AnnounceState> {
  try {
    const { user } = await requireCapability("announce");
    await correctMemberEmail(
      String(formData.get("memberId") ?? ""),
      String(formData.get("email") ?? ""),
      actorFor(user),
    );
    revalidatePath("/roster");
    return { ok: "Address corrected. Retry the send to reach them." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update that address" };
  }
}
