"use server";

/**
 * Settings endpoints. Slack connection, digest cadence, the alert email, rotating
 * the deploy webhook secret, and sign-out. Each is called from exactly one form on
 * the settings screen.
 */

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { alertChannels, orgs } from "@/db/schema";
import { requireOrg } from "@/lib/auth";

/**
 * React 19 resets an uncontrolled form once its action completes, so a rejected
 * submit is echoed back with what was typed.
 */
export interface SettingsState {
  error?: string;
  notice?: string;
  values?: { email?: string; slackChannelId?: string; slackChannelName?: string };
}

/**
 * Slack: this deployment has no Slack app credentials, so the token is pasted
 * rather than obtained by OAuth. The stored shape is identical either way — a bot
 * token plus a channel id — so adding the OAuth redirect later changes nothing
 * downstream.
 */
export async function saveSlackAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { org } = await requireOrg();
  const token = String(formData.get("slackBotToken") ?? "").trim();
  const channelId = String(formData.get("slackChannelId") ?? "").trim();
  const channelName = String(formData.get("slackChannelName") ?? "").trim();

  const values = { slackChannelId: channelId, slackChannelName: channelName };
  if (token && !/^xox[bp]-/.test(token)) {
    return { error: "A Slack bot token starts with xoxb- (or xoxp- for a user token)", values };
  }
  if (token && !channelId) return { error: "Which channel should alerts go to?", values };
  if (channelId && !/^[CGD][A-Z0-9]{6,}$/i.test(channelId)) {
    return {
      error: "A Slack channel id looks like C09ABCDE123 — copy it from the channel details",
      values,
    };
  }

  const db = getDb();
  await db
    .update(orgs)
    .set({
      slackBotToken: token || null,
      slackChannelId: channelId || null,
      slackChannelName: channelName || null,
    })
    .where(eq(orgs.id, org.id));
  revalidatePath("/settings");
  return {
    notice: token
      ? `Alerts will go to ${channelName || channelId}.`
      : "Slack disconnected. Alerts fall back to email.",
  };
}

export async function saveDigestAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { org } = await requireOrg();
  const frequency = String(formData.get("digestFrequency") ?? "daily");
  if (frequency !== "daily" && frequency !== "weekly") {
    return { error: "Pick daily or weekly" };
  }
  const db = getDb();
  await db.update(orgs).set({ digestFrequency: frequency }).where(eq(orgs.id, org.id));
  revalidatePath("/settings");
  return { notice: `Digest set to ${frequency}.` };
}

export async function saveAlertEmailAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { org } = await requireOrg();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "Enter a valid email address", values: { email } };
  }
  const db = getDb();
  await db
    .insert(alertChannels)
    .values({ orgId: org.id, kind: "email", target: email })
    .onConflictDoNothing();
  revalidatePath("/settings");
  return { notice: `${email} will receive alerts when Slack is not connected.` };
}

export async function removeAlertEmailAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { org } = await requireOrg();
  const id = String(formData.get("channelId") ?? "");
  const db = getDb();
  const remaining = await db
    .select()
    .from(alertChannels)
    .where(and(eq(alertChannels.orgId, org.id), eq(alertChannels.kind, "email")));
  if (remaining.length <= 1) {
    return { error: "Keep at least one email address, or an anomaly has nowhere to go." };
  }
  await db
    .delete(alertChannels)
    .where(and(eq(alertChannels.orgId, org.id), eq(alertChannels.id, id)));
  revalidatePath("/settings");
  return { notice: "Address removed." };
}

/** Rotate the deploy webhook credentials. The old URL stops working at once. */
export async function rotateWebhookAction(): Promise<SettingsState> {
  const { org } = await requireOrg();
  const db = getDb();
  await db
    .update(orgs)
    .set({
      deployWebhookToken: randomBytes(16).toString("hex"),
      deployWebhookSecret: randomBytes(24).toString("hex"),
    })
    .where(eq(orgs.id, org.id));
  revalidatePath("/settings");
  return { notice: "Webhook rotated. Update your deploy script or GitHub webhook." };
}
