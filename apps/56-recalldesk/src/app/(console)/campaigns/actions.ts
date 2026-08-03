"use server";

/**
 * Campaign actions. Creating and launching a campaign spends the practice's
 * reputation across a whole segment, so both are office-manager-and-above.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { CHASE_BUCKETS, type OverdueBucket } from "@/lib/recall";
import { createCampaign, launchCampaign, setCampaignStatus } from "@/server/campaigns";

export interface CampaignState {
  error: string | null;
}

export async function createCampaignAction(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  // The role check is inside the try on purpose. A server action is a public
  // endpoint: the UI disables what a front-desk user cannot do, but the POST is
  // still reachable, and a denial has to come back as a sentence rather than as
  // an unhandled server error with a digest in it.
  let ctx: Awaited<ReturnType<typeof requireRole>>;
  try {
    ctx = await requireRole("office_manager");
  } catch (error) {
    return { error: error instanceof Error ? error.message : "You cannot do that." };
  }

  const buckets = String(formData.get("buckets") ?? "")
    .split(",")
    .filter((b): b is OverdueBucket => (CHASE_BUCKETS as string[]).includes(b));

  const steps: { templateId: string; offsetDays: number; channel: "email" | "sms" }[] = [];
  for (let i = 0; i < 6; i++) {
    const templateId = String(formData.get(`step${i}Template`) ?? "");
    if (!templateId) continue;
    const channel = String(formData.get(`step${i}Channel`) ?? "email") === "sms" ? "sms" : "email";
    const offsetDays = Number(formData.get(`step${i}Offset`) ?? 0);
    if (!Number.isFinite(offsetDays) || offsetDays < 0 || offsetDays > 120) {
      return { error: "Step offsets must be between 0 and 120 days." };
    }
    steps.push({ templateId, offsetDays, channel });
  }

  let campaignId: string;
  try {
    const campaign = await createCampaign({
      locationId: ctx.location.id,
      practiceId: ctx.practice.id,
      actorId: ctx.user.id,
      plan: ctx.practice.plan,
      name: String(formData.get("name") ?? ""),
      segment: {
        buckets,
        requiresEmail: formData.get("requiresEmail") === "on",
        requiresSms: formData.get("requiresSms") === "on",
        excludeEnrolled: true,
      },
      maxTouchesPerPatient: Number(formData.get("maxTouches") ?? 3),
      autoEnroll: formData.get("autoEnroll") === "on",
      steps,
    });
    campaignId = campaign.id;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create that campaign." };
  }
  redirect(`/campaigns/${campaignId}`);
}

export async function launchCampaignAction(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  const campaignId = String(formData.get("campaignId") ?? "");
  try {
    const ctx = await requireRole("office_manager");
    await launchCampaign({
      campaignId,
      locationIds: ctx.locations.map((l) => l.id),
      practiceId: ctx.practice.id,
      actorId: ctx.user.id,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not launch that campaign." };
  }
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
  return { error: null };
}

export async function setStatusAction(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  const campaignId = String(formData.get("campaignId") ?? "");
  const raw = String(formData.get("status") ?? "");
  const status = raw === "running" || raw === "paused" || raw === "completed" ? raw : null;
  if (!status) return { error: "Unknown status." };

  try {
    const ctx = await requireRole("office_manager");
    await setCampaignStatus({
      campaignId,
      locationIds: ctx.locations.map((l) => l.id),
      practiceId: ctx.practice.id,
      actorId: ctx.user.id,
      status,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not change that campaign." };
  }
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
  return { error: null };
}
