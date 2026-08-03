"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/ActionForm";
import { composeAnnouncement, fanOut, resolveAudience } from "@/lib/announcements";
import { requireCan } from "@/lib/auth";

function fail(err: unknown): FormState {
  return { error: err instanceof Error ? err.message : "That did not work" };
}

export async function sendAnnouncementAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { school, user } = await requireCan("send_announcement");
  const scope = String(formData.get("scope") ?? "all");
  const programIds = formData.getAll("programIds").map(String).filter(Boolean);
  const audience = scope === "programs" ? { all: false, programIds } : { all: true };

  try {
    if (scope === "programs" && programIds.length === 0) {
      throw new Error("Pick at least one program, or send to the whole school");
    }
    const recipients = await resolveAudience({ schoolId: school.id, audience });
    if (recipients.length === 0) {
      throw new Error("Nobody would receive this — there are no households in that audience yet");
    }

    const announcement = await composeAnnouncement({
      schoolId: school.id,
      subject: String(formData.get("subject") ?? ""),
      bodyMd: String(formData.get("body") ?? ""),
      audience,
      sentBy: user.id,
    });
    const result = await fanOut({
      announcementId: announcement.id,
      schoolId: school.id,
      schoolName: school.name,
    });

    revalidatePath("/announce");
    const parts = [`${result.sent} sent`];
    if (result.failed > 0) parts.push(`${result.failed} bounced`);
    if (result.noAddress > 0) {
      parts.push(`${result.noAddress} household${result.noAddress === 1 ? "" : "s"} with no address`);
    }
    return { ok: `${parts.join(" · ")}. Open the announcement for the per-household list.` };
  } catch (err) {
    return fail(err);
  }
}

export async function resendAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireCan("send_announcement");
  const announcementId = String(formData.get("announcementId") ?? "");
  try {
    const result = await fanOut({ announcementId, schoolId: school.id, schoolName: school.name });
    revalidatePath(`/announce/${announcementId}`);
    return {
      ok:
        result.queued === 0
          ? "Nothing left to retry — every household already has an outcome."
          : `${result.sent} retried, ${result.failed} still failing.`,
    };
  } catch (err) {
    return fail(err);
  }
}
