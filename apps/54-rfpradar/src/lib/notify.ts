/**
 * src/lib/notify.ts
 *
 * Outbound email (Resend) and Slack (per-firm incoming webhook), plus the
 * `notifications` ledger that makes a scheduled send exactly-once.
 *
 * The claim/send/settle shape matters: a send is **claimed** by inserting its
 * dedupe key first (unique index), then performed, then settled to `sent` or
 * `failed`. An overlapping cron tick or a worker retry loses the race on the
 * insert and stops, so nobody gets the same 6am scan twice.
 *
 * `DRY_RUN=1` (the default when there is no Resend key) logs instead of
 * sending and still writes the ledger row, marked `sent` with a `dry-run`
 * message id — so local development exercises the whole path honestly rather
 * than pretending delivery it never attempted.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { env } from "@/lib/env";

export type Channel = "email" | "slack";
export type NotificationKind = "morning_scan" | "deadline" | "match" | "pursuit_event";

export interface ClaimInput {
  firmId: string;
  userId?: string | null;
  channel: Channel;
  kind: NotificationKind;
  /** Unique across all time; null skips deduplication (ad-hoc sends). */
  dedupeKey: string | null;
}

/**
 * Reserve the right to send. Returns the notification row id, or null when this
 * exact send has already been claimed.
 */
export async function claimNotification(input: ClaimInput): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .insert(notifications)
    .values({
      firmId: input.firmId,
      userId: input.userId ?? null,
      channel: input.channel,
      kind: input.kind,
      dedupeKey: input.dedupeKey,
      status: "queued",
    })
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning({ id: notifications.id });
  return rows[0]?.id ?? null;
}

export async function settleNotification(
  id: string,
  status: "sent" | "failed",
  providerMessageId?: string | null,
): Promise<void> {
  await getDb()
    .update(notifications)
    .set({ status, providerMessageId: providerMessageId ?? null })
    .where(eq(notifications.id, id));
}

export interface SendResult {
  ok: boolean;
  providerMessageId: string | null;
  error: string | null;
  /** True when DRY_RUN logged instead of sending. */
  dryRun: boolean;
}

export interface EmailMessage {
  to: string[];
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  if (message.to.length === 0) {
    return { ok: false, providerMessageId: null, error: "No recipients.", dryRun: false };
  }
  if (env.dryRun || !env.resendApiKey) {
    console.info(
      `[notify] DRY_RUN email -> ${message.to.join(", ")} :: ${message.subject} (${message.text.length} chars)`,
    );
    return { ok: true, providerMessageId: "dry-run", error: null, dryRun: true };
  }
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(env.resendApiKey);
    const { data, error } = await resend.emails.send({
      from: env.emailFrom,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    if (error) {
      return { ok: false, providerMessageId: null, error: error.message, dryRun: false };
    }
    return { ok: true, providerMessageId: data?.id ?? null, error: null, dryRun: false };
  } catch (error) {
    return {
      ok: false,
      providerMessageId: null,
      error: error instanceof Error ? error.message : String(error),
      dryRun: false,
    };
  }
}

/**
 * Slack incoming webhook. The firm pastes the URL; we post JSON to it. A 404 or
 * 410 from Slack means the webhook was revoked — worth surfacing rather than
 * retrying forever, so the error text is returned verbatim to the caller.
 */
export async function postSlack(
  webhookUrl: string,
  payload: Record<string, unknown>,
): Promise<SendResult> {
  if (env.dryRun) {
    console.info(`[notify] DRY_RUN slack -> ${webhookUrl.slice(0, 40)}… ${JSON.stringify(payload).slice(0, 160)}…`);
    return { ok: true, providerMessageId: "dry-run", error: null, dryRun: true };
  }
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        providerMessageId: null,
        error: `Slack returned ${response.status}: ${body.slice(0, 120)}`,
        dryRun: false,
      };
    }
    return { ok: true, providerMessageId: "slack-ok", error: null, dryRun: false };
  } catch (error) {
    return {
      ok: false,
      providerMessageId: null,
      error: error instanceof Error ? error.message : String(error),
      dryRun: false,
    };
  }
}

export function isValidSlackWebhook(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.host === "hooks.slack.com";
  } catch {
    return false;
  }
}
