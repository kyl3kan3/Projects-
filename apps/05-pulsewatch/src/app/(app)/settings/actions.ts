"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  ChannelError,
  createChannel,
  deleteChannel,
  setRuleNotifyOn,
  verifyChannel,
} from "@/lib/alerts";
import { createCheckoutSession, createPortalSession } from "@/lib/billing";
import type { ChannelKind, NotifyOn, PlanId } from "@/db/schema";

export interface ChannelFormState {
  error?: string;
  ok?: string;
}

export async function addChannelAction(
  _prev: ChannelFormState,
  form: FormData,
): Promise<ChannelFormState> {
  const { team } = await requireUser();
  try {
    const channel = await createChannel({
      teamId: team.id,
      planId: team.plan,
      kind: String(form.get("kind") ?? "email") as ChannelKind,
      name: String(form.get("name") ?? ""),
      destination: String(form.get("destination") ?? ""),
    });
    // Send the test immediately: an unverified alert channel is a liability.
    try {
      await verifyChannel(channel.id, team.id);
    } catch (err) {
      revalidatePath("/settings/alerts");
      return {
        error:
          err instanceof Error
            ? `Channel saved, but the test alert failed: ${err.message}`
            : "Channel saved, but the test alert failed",
      };
    }
    revalidatePath("/settings/alerts");
    return { ok: "Channel added and the test alert landed." };
  } catch (err) {
    if (err instanceof ChannelError) return { error: err.message };
    console.error("[settings] add channel failed", err);
    return { error: "Could not add that channel" };
  }
}

export async function testChannelAction(formData: FormData): Promise<void> {
  const { team } = await requireUser();
  try {
    await verifyChannel(String(formData.get("id")), team.id);
  } catch (err) {
    console.error("[settings] channel test failed", err);
  }
  revalidatePath("/settings/alerts");
}

export async function deleteChannelAction(formData: FormData): Promise<void> {
  const { team } = await requireUser();
  await deleteChannel(String(formData.get("id")), team.id);
  revalidatePath("/settings/alerts");
}

export async function updateRuleAction(formData: FormData): Promise<void> {
  const { team } = await requireUser();
  const ruleId = String(formData.get("ruleId"));
  const notifyOn = (["down", "recovery", "expiry"] as NotifyOn[]).filter(
    (kind) => formData.get(kind) === "on",
  );
  await setRuleNotifyOn(ruleId, team.id, notifyOn);
  revalidatePath("/settings/alerts");
}

export async function upgradeAction(formData: FormData): Promise<void> {
  const { user, team } = await requireUser();
  const target = String(formData.get("plan")) as PlanId;
  if (target !== "solo" && target !== "team") return;
  const url = await createCheckoutSession(team, user.email, target);
  redirect(url);
}

export async function portalAction(): Promise<void> {
  const { user, team } = await requireUser();
  const url = await createPortalSession(team, user.email);
  redirect(url);
}
