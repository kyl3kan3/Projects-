/**
 * Alert dispatch, with send-once semantics.
 *
 * The dedupe is a **database claim**, not a check-then-send: the row in
 * `alert_log` is inserted first with `on conflict do nothing`, and an empty
 * `returning()` means somebody else already sent this alert. Two ticks racing —
 * the Vercel cron and a locally-running worker, say — therefore cannot both post,
 * which a `select` followed by an `insert` would allow.
 *
 * Retries are bounded. A failed delivery frees its dedupe key up to
 * `MAX_ATTEMPTS` times by renaming the failed row; after that the key stays
 * claimed and the alert is abandoned rather than retried forever. An alert that
 * retries for eternity is the same bug as a notification that never stops.
 */

import { and, eq, like } from "drizzle-orm";
import { getDb } from "@/db";
import { alertChannels, alertLog, type AlertKind, type Org } from "@/db/schema";
import { postBlocks } from "@/lib/slack";
import { sendEmail } from "@/lib/email";
import type { SlackBlock } from "@/lib/slack-blocks";

export const MAX_ATTEMPTS = 3;

export interface DispatchTarget {
  kind: "slack" | "email";
  target: string;
}

export interface DispatchResult {
  target: DispatchTarget;
  /** false when this alert had already been sent to this target. */
  attempted: boolean;
  status: "sent" | "logged" | "failed" | "duplicate" | "abandoned";
  slack?: { channel: string; ts: string };
  error?: string;
}

/** Where an org's alerts go. Slack first; email is the fallback, not a copy. */
export async function targetsFor(org: Org): Promise<DispatchTarget[]> {
  if (org.slackBotToken && org.slackChannelId) {
    return [{ kind: "slack", target: org.slackChannelId }];
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(alertChannels)
    .where(and(eq(alertChannels.orgId, org.id), eq(alertChannels.active, true)));
  return rows
    .filter((r) => r.kind === "email")
    .map((r) => ({ kind: "email" as const, target: r.target }));
}

async function attemptCount(orgId: string, dedupeKey: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: alertLog.id })
    .from(alertLog)
    .where(and(eq(alertLog.orgId, orgId), like(alertLog.dedupeKey, `${dedupeKey}#f%`)));
  return rows.length;
}

export interface DispatchInput {
  org: Org;
  kind: AlertKind;
  /** Stable per logical alert: `anomaly:<id>`, `budget:<id>:<month>:<rung>`, … */
  dedupeKey: string;
  /** Slack Block Kit payload; also the source of the emailed text. */
  blocks: SlackBlock[];
  /** Notification fallback text and email subject. */
  subject: string;
  /** Plain-text body for the email route. */
  text: string;
  /** One line stored on the log row. */
  summary: string;
}

export async function dispatch(input: DispatchInput): Promise<DispatchResult[]> {
  const db = getDb();
  const targets = await targetsFor(input.org);
  const results: DispatchResult[] = [];

  for (const target of targets) {
    // Claim the (org, key, target) triple. An empty result means it is taken.
    const claimed = await db
      .insert(alertLog)
      .values({
        orgId: input.org.id,
        kind: input.kind,
        dedupeKey: input.dedupeKey,
        channelKind: target.kind,
        channelTarget: target.target,
        status: "pending",
        summary: input.summary,
      })
      .onConflictDoNothing()
      .returning();

    if (claimed.length === 0) {
      results.push({ target, attempted: false, status: "duplicate" });
      continue;
    }
    const row = claimed[0];

    const delivery =
      target.kind === "slack"
        ? await postBlocks(
            { botToken: input.org.slackBotToken, channelId: target.target },
            input.blocks,
            input.subject,
          )
        : await sendEmail({ to: target.target, subject: input.subject, text: input.text });

    if (delivery.status === "failed") {
      const attempts = await attemptCount(input.org.id, input.dedupeKey);
      const giveUp = attempts + 1 >= MAX_ATTEMPTS;
      await db
        .update(alertLog)
        .set({
          status: "failed",
          error: delivery.error?.slice(0, 500) ?? "unknown error",
          // Renaming the row frees the dedupe key for one more attempt. Once the
          // attempt budget is spent the key stays claimed and we stop.
          dedupeKey: giveUp ? input.dedupeKey : `${input.dedupeKey}#f${attempts + 1}`,
        })
        .where(eq(alertLog.id, row.id));
      results.push({
        target,
        attempted: true,
        status: giveUp ? "abandoned" : "failed",
        error: delivery.error,
      });
      continue;
    }

    const slack = target.kind === "slack" ? (delivery as { ts?: string; channel?: string }) : null;
    await db
      .update(alertLog)
      .set({
        status: delivery.status,
        externalId: slack?.ts ?? ("id" in delivery ? (delivery.id as string | undefined) : undefined),
      })
      .where(eq(alertLog.id, row.id));

    results.push({
      target,
      attempted: true,
      status: delivery.status,
      slack: slack?.ts && slack.channel ? { channel: slack.channel, ts: slack.ts } : undefined,
    });
  }

  return results;
}

/** Was this alert delivered (or logged) to at least one target? */
export function delivered(results: DispatchResult[]): boolean {
  return results.some((r) => r.status === "sent" || r.status === "logged");
}

/** The Slack coordinates to store on the anomaly, if a Slack post happened. */
export function slackCoordinates(
  results: DispatchResult[],
): { channel: string; ts: string } | null {
  for (const result of results) {
    if (result.slack) return result.slack;
  }
  return null;
}
