"use server";

/**
 * Trust-screen actions: change the retention window, and purge now.
 *
 * Both are record-heavy and both are audit-logged by the functions they call.
 * "Purge now" runs the same sweep the schedule runs — there is no second deletion
 * path, so what the button does is exactly what the nightly job does.
 */

import { revalidatePath } from "next/cache";
import { requirePractice } from "@/lib/auth";
import { purgeExpiredArtifacts, rescheduleRetention } from "@/lib/retention";

export interface TrustState {
  error?: string;
  message?: string;
}

export async function setRetentionAction(
  _prev: TrustState,
  form: FormData,
): Promise<TrustState> {
  const { practice, user } = await requirePractice();
  const days = Number(form.get("retentionDays"));
  if (!Number.isFinite(days) || days < 1 || days > 365) {
    return { error: "Choose a window between 1 and 365 days." };
  }
  const result = await rescheduleRetention(practice.id, days, user.id);
  revalidatePath("/trust");
  return {
    message: `Retention is now ${Math.floor(days)} days. ${result.audio} audio file${
      result.audio === 1 ? "" : "s"
    } and ${result.transcripts} transcript${
      result.transcripts === 1 ? "" : "s"
    } rescheduled. Already-purged media cannot come back.`,
  };
}

export async function purgeNowAction(): Promise<TrustState> {
  const { practice } = await requirePractice();
  const result = await purgeExpiredArtifacts({ practiceId: practice.id });
  revalidatePath("/trust");
  if (result.audioPurged === 0 && result.transcriptsPurged === 0) {
    return { message: "Nothing is past its retention window right now." };
  }
  return {
    message: `Purged ${result.audioPurged} audio file${
      result.audioPurged === 1 ? "" : "s"
    } and ${result.transcriptsPurged} transcript${
      result.transcriptsPurged === 1 ? "" : "s"
    }. Every deletion is in the log below.`,
  };
}
