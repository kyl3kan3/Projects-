/**
 * Alert channels and dispatch.
 *
 * Two guarantees the product is sold on:
 *   1. One alert per incident per channel per edge. Enforced by a unique index
 *      on `notifications(incident_id, alert_channel_id, edge)` — the row is
 *      claimed before the send, so a retried job can never double-page.
 *   2. A failing channel never blocks the others. Each send is isolated and
 *      recorded on its own row.
 */

import { and, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  alertChannels,
  alertRules,
  incidents,
  monitors,
  notifications,
  teams,
  users,
  type AlertChannel,
  type ChannelKind,
  type Incident,
  type Monitor,
  type NotifyOn,
  type PlanId,
} from "@/db/schema";
import { channelAllowed, plan } from "@/lib/plans";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { durationBetween } from "@/lib/format";

export class ChannelError extends Error {}

/* -------------------------------------------------------------- channels --- */

export interface CreateChannelInput {
  teamId: string;
  planId: PlanId;
  kind: ChannelKind;
  name: string;
  /** Email address for `email`, webhook URL for the rest. */
  destination: string;
}

export async function createChannel(input: CreateChannelInput): Promise<AlertChannel> {
  if (!channelAllowed(input.planId, input.kind)) {
    throw new ChannelError(`${input.kind} alerts need the Solo plan or above.`);
  }
  const destination = input.destination.trim();
  if (input.kind === "email") {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destination)) {
      throw new ChannelError("Enter a valid email address");
    }
  } else {
    let url: URL;
    try {
      url = new URL(destination);
    } catch {
      throw new ChannelError("Enter a valid https:// webhook URL");
    }
    if (url.protocol !== "https:") throw new ChannelError("Webhook URLs must be https://");
    if (input.kind === "slack" && !url.hostname.endsWith("slack.com")) {
      throw new ChannelError("That isn't a Slack webhook URL");
    }
    if (input.kind === "discord" && !/(^|\.)discord(app)?\.com$/.test(url.hostname)) {
      throw new ChannelError("That isn't a Discord webhook URL");
    }
  }

  const db = getDb();
  const [row] = await db
    .insert(alertChannels)
    .values({
      teamId: input.teamId,
      kind: input.kind,
      name: input.name.trim() || destination,
      config: input.kind === "email" ? { address: destination } : { webhookUrl: destination },
    })
    .returning();

  // Every new channel gets a team-wide default rule; otherwise adding a channel
  // silently does nothing, which is the worst failure mode in a monitoring tool.
  await db.insert(alertRules).values({
    teamId: input.teamId,
    monitorId: null,
    alertChannelId: row.id,
    notifyOn: ["down", "recovery", "expiry"],
  });

  return row;
}

export async function listChannels(teamId: string): Promise<AlertChannel[]> {
  const db = getDb();
  return db
    .select()
    .from(alertChannels)
    .where(eq(alertChannels.teamId, teamId))
    .orderBy(alertChannels.createdAt);
}

export async function deleteChannel(id: string, teamId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(alertChannels)
    .where(and(eq(alertChannels.id, id), eq(alertChannels.teamId, teamId)));
}

/** Send a test payload and mark the channel verified if it lands. */
export async function verifyChannel(id: string, teamId: string): Promise<void> {
  const db = getDb();
  const [channel] = await db
    .select()
    .from(alertChannels)
    .where(and(eq(alertChannels.id, id), eq(alertChannels.teamId, teamId)));
  if (!channel) throw new ChannelError("Channel not found");

  await deliver(channel, {
    subject: "PulseWatch test alert",
    title: "PulseWatch is wired up",
    body: "This is a test alert. If you can read this, real outages will reach you here too.",
    url: `${env.appUrl}/settings/alerts`,
    severity: "info",
  });

  await db.update(alertChannels).set({ verified: true }).where(eq(alertChannels.id, id));
}

/* -------------------------------------------------------------- dispatch --- */

export interface AlertPayload {
  subject: string;
  title: string;
  body: string;
  url: string;
  severity: "down" | "recovery" | "info";
}

/** Which edge maps to which `notify_on` category. */
function categoryFor(edge: string): NotifyOn {
  if (edge === "recovery") return "recovery";
  if (edge.startsWith("ssl:") || edge.startsWith("domain:")) return "expiry";
  return "down";
}

/**
 * Dispatch one incident edge to every channel a matching rule points at.
 * Idempotent: already-sent (incident, channel, edge) triples are skipped.
 */
export async function dispatchAlert(incidentId: string, edge: string): Promise<void> {
  const db = getDb();
  const [incident] = await db.select().from(incidents).where(eq(incidents.id, incidentId));
  if (!incident) return;

  const monitor = incident.monitorId
    ? ((await db.select().from(monitors).where(eq(monitors.id, incident.monitorId)))[0] ?? null)
    : null;

  const category = categoryFor(edge);
  const rules = await db
    .select({ rule: alertRules, channel: alertChannels })
    .from(alertRules)
    .innerJoin(alertChannels, eq(alertChannels.id, alertRules.alertChannelId))
    .where(
      and(
        eq(alertRules.teamId, incident.teamId),
        // Team-wide default, or a rule aimed at this specific monitor.
        incident.monitorId
          ? or(isNull(alertRules.monitorId), eq(alertRules.monitorId, incident.monitorId))
          : isNull(alertRules.monitorId),
      ),
    );

  const payload = renderPayload(incident, monitor, edge);

  for (const { rule, channel } of rules) {
    if (!rule.notifyOn.includes(category)) continue;

    // Claim the send. If the row already exists, someone already sent it.
    const claimed = await db
      .insert(notifications)
      .values({ incidentId, alertChannelId: channel.id, edge, status: "queued" })
      .onConflictDoNothing()
      .returning();
    if (!claimed.length) continue;

    try {
      const result = await deliver(channel, payload);
      await db
        .update(notifications)
        .set({
          status: "sent",
          sentAt: new Date(),
          attempt: 1,
          providerMessageId: result.id ?? null,
        })
        .where(eq(notifications.id, claimed[0].id));
    } catch (err) {
      // Record and move on: one dead webhook must not silence email.
      await db
        .update(notifications)
        .set({
          status: "failed",
          attempt: 1,
          error: err instanceof Error ? err.message.slice(0, 400) : String(err),
        })
        .where(eq(notifications.id, claimed[0].id));
      console.error(`[alerts] ${channel.kind} channel ${channel.id} failed`, err);
    }
  }
}

function renderPayload(
  incident: Incident,
  monitor: Monitor | null,
  edge: string,
): AlertPayload {
  const name = monitor?.name ?? incident.title ?? "Service";
  const target = monitor?.target ? ` (${monitor.target})` : "";
  const link = `${env.appUrl}/incidents/${incident.id}`;

  if (edge === "recovery") {
    const downFor = incident.resolvedAt
      ? durationBetween(incident.startedAt, incident.resolvedAt)
      : durationBetween(incident.startedAt);
    return {
      subject: `Recovered: ${name}`,
      title: `${name} is back up`,
      body: `Recovered after ${downFor}.${target ? `\nTarget: ${monitor?.target}` : ""}`,
      url: link,
      severity: "recovery",
    };
  }

  if (edge.startsWith("ssl:") || edge.startsWith("domain:")) {
    return {
      subject: `Expiring soon: ${name}`,
      title: incident.title || `${name} is expiring`,
      body: incident.triggerSummary,
      url: link,
      severity: "info",
    };
  }

  const regions = incident.confirmingRegions.length
    ? `\nConfirmed from: ${incident.confirmingRegions.join(", ")}`
    : "";
  return {
    subject: `DOWN: ${name}`,
    title: `${name} is down`,
    body: `${incident.triggerSummary}${target ? `\nTarget: ${monitor?.target}` : ""}${regions}\nStarted: ${incident.startedAt.toISOString()}`,
    url: link,
    severity: "down",
  };
}

/* -------------------------------------------------------- channel senders --- */

async function deliver(
  channel: AlertChannel,
  payload: AlertPayload,
): Promise<{ id: string | null }> {
  switch (channel.kind) {
    case "email": {
      const config = channel.config as { address: string };
      const sent = await sendEmail({
        to: config.address,
        subject: payload.subject,
        text: `${payload.title}\n\n${payload.body}\n\n${payload.url}\n`,
      });
      return { id: sent.id };
    }
    case "slack":
      return postJson(webhookUrl(channel), slackBody(payload));
    case "discord":
      return postJson(webhookUrl(channel), discordBody(payload));
    case "webhook":
      return postJson(webhookUrl(channel), {
        event: payload.severity,
        title: payload.title,
        body: payload.body,
        url: payload.url,
        sentAt: new Date().toISOString(),
      });
    default:
      throw new ChannelError(`Unsupported channel kind: ${channel.kind}`);
  }
}

function webhookUrl(channel: AlertChannel): string {
  const config = channel.config as { webhookUrl?: string };
  if (!config.webhookUrl) throw new ChannelError("Channel has no webhook URL");
  return config.webhookUrl;
}

/** Plain text plus a context line — no Slack emoji, per DESIGN_LANGUAGE.md. */
function slackBody(payload: AlertPayload) {
  const marker = payload.severity === "down" ? "DOWN" : payload.severity === "recovery" ? "UP" : "NOTICE";
  return {
    text: `${marker} — ${payload.title}`,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `*${marker} — ${payload.title}*\n${payload.body}` },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `<${payload.url}|Open in PulseWatch>` }],
      },
    ],
  };
}

function discordBody(payload: AlertPayload) {
  const color =
    payload.severity === "down" ? 0xff4d5e : payload.severity === "recovery" ? 0x48b784 : 0xffc24d;
  return {
    embeds: [
      {
        title: payload.title,
        description: `${payload.body}\n\n[Open in PulseWatch](${payload.url})`,
        color,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

async function postJson(url: string, body: unknown): Promise<{ id: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "PulseWatch/1.0" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new ChannelError(`Webhook responded ${res.status}`);
    }
    return { id: res.headers.get("x-message-id") };
  } finally {
    clearTimeout(timer);
  }
}

/* ----------------------------------------------------------------- rules --- */

export async function listRules(teamId: string) {
  const db = getDb();
  return db
    .select({ rule: alertRules, channel: alertChannels })
    .from(alertRules)
    .innerJoin(alertChannels, eq(alertChannels.id, alertRules.alertChannelId))
    .where(eq(alertRules.teamId, teamId));
}

export async function setRuleNotifyOn(
  ruleId: string,
  teamId: string,
  notifyOn: NotifyOn[],
): Promise<void> {
  const db = getDb();
  await db
    .update(alertRules)
    .set({ notifyOn })
    .where(and(eq(alertRules.id, ruleId), eq(alertRules.teamId, teamId)));
}

/** Which channel kinds this team may add, for the settings UI. */
export function availableChannelKinds(planId: PlanId): ChannelKind[] {
  const kinds: ChannelKind[] = ["email", "webhook", "slack", "discord"];
  return kinds.filter((k) => plan(planId).channels.includes(k));
}

/** Seed the owner's email as the first channel, so signup leaves you covered. */
export async function ensureDefaultEmailChannel(teamId: string): Promise<void> {
  const db = getDb();
  const existing = await db
    .select({ id: alertChannels.id })
    .from(alertChannels)
    .where(eq(alertChannels.teamId, teamId));
  if (existing.length) return;

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return;
  const [owner] = await db.select().from(users).where(eq(users.id, team.ownerUserId));
  if (!owner) return;

  await createChannel({
    teamId,
    planId: team.plan,
    kind: "email",
    name: owner.email,
    destination: owner.email,
  });
}
