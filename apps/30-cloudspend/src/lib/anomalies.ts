/**
 * Anomaly reads and state transitions for the app screens.
 *
 * The state machine is open → acked → resolved, and `resolved_at` is what the
 * partial unique index uses to allow exactly one live anomaly per
 * (account, service, region). Ack does not resolve: an acknowledged anomaly is
 * still costing money, and DESIGN.md keeps it on the rail in `text-2` rather than
 * filing it away.
 *
 * Every duration and running total shown is derived from `started_at` as of now,
 * never read from a stored column — an anomaly card that says "9h" because that
 * is what a cron wrote last night is the stale-status bug.
 */

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  anomalies,
  awsAccounts,
  deploys,
  type Anomaly,
  type AwsAccount,
  type Deploy,
  type Org,
  type User,
} from "@/db/schema";
import { addHours, floorHour } from "@/lib/dates";
import { hourlyTotals } from "@/lib/facts";
import { leadTimeLabel } from "@/lib/anomaly";
import { ackedBlocks, anomalyNotificationText } from "@/lib/slack-blocks";
import { updateBlocks } from "@/lib/slack";
import { anomalyCardInput } from "@/lib/tick";

export interface AnomalyWithContext {
  anomaly: Anomaly;
  account: AwsAccount;
  deploy: Deploy | null;
}

export async function listAnomalies(
  orgId: string,
  opts: { accountId?: string; includeResolved?: boolean } = {},
): Promise<AnomalyWithContext[]> {
  const db = getDb();
  const filters = [eq(anomalies.orgId, orgId)];
  if (opts.accountId) filters.push(eq(anomalies.accountId, opts.accountId));
  if (!opts.includeResolved) filters.push(isNull(anomalies.resolvedAt));

  const rows = await db
    .select()
    .from(anomalies)
    .where(and(...filters))
    .orderBy(desc(anomalies.deltaPerDayMicros));
  if (rows.length === 0) return [];

  const accountIds = [...new Set(rows.map((r) => r.accountId))];
  const accountRows = await db
    .select()
    .from(awsAccounts)
    .where(inArray(awsAccounts.id, accountIds));
  const accountsById = new Map(accountRows.map((a) => [a.id, a]));

  const deployIds = rows.map((r) => r.correlatedDeployId).filter((id): id is string => Boolean(id));
  const deployRows = deployIds.length
    ? await db.select().from(deploys).where(inArray(deploys.id, deployIds))
    : [];
  const deploysById = new Map(deployRows.map((d) => [d.id, d]));

  return rows
    .filter((row) => accountsById.has(row.accountId))
    .map((row) => ({
      anomaly: row,
      account: accountsById.get(row.accountId) as AwsAccount,
      deploy: row.correlatedDeployId ? deploysById.get(row.correlatedDeployId) ?? null : null,
    }));
}

export async function getAnomaly(orgId: string, id: string): Promise<AnomalyWithContext | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(anomalies)
    .where(and(eq(anomalies.orgId, orgId), eq(anomalies.id, id)));
  if (!row) return null;
  const [account] = await db.select().from(awsAccounts).where(eq(awsAccounts.id, row.accountId));
  if (!account) return null;
  const deploy = row.correlatedDeployId
    ? (await db.select().from(deploys).where(eq(deploys.id, row.correlatedDeployId)))[0] ?? null
    : null;
  return { anomaly: row, account, deploy };
}

export function countOpen(rows: AnomalyWithContext[]): number {
  return rows.filter((r) => r.anomaly.status !== "resolved").length;
}

/** The 48×16 card thumbnail: hourly values over the last 24 hours. */
export async function thumbnailValues(
  accountId: string,
  opts: { service: string; region: string; asOf: Date; hours?: number },
): Promise<number[]> {
  const to = floorHour(opts.asOf);
  const from = addHours(to, -(opts.hours ?? 24));
  const rows = await hourlyTotals(accountId, { from, to });
  // Restricting to one service means going back to the fact table; the card only
  // needs a shape, so the account-wide hourly series is what it draws.
  return rows.map((r) => r.micros);
}

export interface AckResult {
  ok: boolean;
  error?: string;
}

/**
 * Ack. Updates the Slack message in place when we have its coordinates: header
 * prefixed `Acked —`, actions replaced by a context line. Never posts a second
 * message.
 */
export async function ackAnomaly(
  org: Org,
  user: Pick<User, "email" | "name">,
  anomalyId: string,
  actorLabel?: string,
): Promise<AckResult> {
  const db = getDb();
  const context = await getAnomaly(org.id, anomalyId);
  if (!context) return { ok: false, error: "That anomaly is no longer here" };
  if (context.anomaly.status !== "open") return { ok: true };

  const by = actorLabel ?? user.name ?? user.email;
  const at = new Date();
  const [updated] = await db
    .update(anomalies)
    .set({ status: "acked", ackedBy: by, ackedAt: at })
    // Only an open anomaly can be acked, so two people pressing Ack at once
    // results in one write and one no-op rather than a clobber.
    .where(and(eq(anomalies.id, anomalyId), eq(anomalies.status, "open")))
    .returning();
  if (!updated) return { ok: true };

  if (updated.slackChannelId && updated.slackMessageTs && org.slackBotToken) {
    const card = anomalyCardInput({
      org,
      account: context.account,
      anomaly: updated,
      deploy: context.deploy
        ? {
            sha: context.deploy.sha,
            serviceName: context.deploy.serviceName,
            commitUrl: context.deploy.commitUrl,
            deployedAt: context.deploy.deployedAt,
          }
        : null,
      asOf: at,
    });
    await updateBlocks(
      { botToken: org.slackBotToken, channelId: updated.slackChannelId },
      { channel: updated.slackChannelId, ts: updated.slackMessageTs },
      ackedBlocks(card, { by, at }),
      anomalyNotificationText(card),
    );
  }
  return { ok: true };
}

/** Resolve. Files the card to history and frees the live-anomaly slot. */
export async function resolveAnomaly(org: Org, anomalyId: string): Promise<AckResult> {
  const db = getDb();
  const [updated] = await db
    .update(anomalies)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(and(eq(anomalies.orgId, org.id), eq(anomalies.id, anomalyId), isNull(anomalies.resolvedAt)))
    .returning();
  if (!updated) return { ok: false, error: "That anomaly is already resolved" };
  return { ok: true };
}

/** The probable-cause sentence, shared by the card, the detail screen and Slack. */
export function causeSentence(context: AnomalyWithContext): string {
  if (context.deploy) {
    return `Deploy ${context.deploy.sha} of ${context.deploy.serviceName}, ${leadTimeLabel(
      context.deploy.deployedAt,
      context.anomaly.startedAt,
    )}`;
  }
  const top = context.anomaly.probableResources[0];
  if (top) return `No deploy in the 6h before onset. Largest contributor: ${top.label}`;
  return "No deploy in the 6h before onset, and no single resource dominates";
}
