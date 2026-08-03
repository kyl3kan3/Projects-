/**
 * Slack delivery.
 *
 * The blocks themselves are built in `slack-blocks.ts` (pure, tested); this module
 * only moves them. Three things it is responsible for:
 *
 * - **Working without a token.** With no Slack workspace connected the send
 *   returns `logged` and the alert is recorded in `alert_log` with its full text,
 *   so the product is never silently unable to tell anyone anything.
 * - **Updating in place.** Ack edits the original message rather than posting a
 *   second one (`chat.update` needs the channel + ts we stored on the anomaly).
 * - **Verifying inbound requests.** Slack's interactivity POST is signed; an
 *   unsigned or stale request is rejected, because acking an anomaly is a state
 *   change.
 *
 * The SDK is imported lazily so it stays out of any page's module graph.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { containsEmoji, type SlackBlock } from "@/lib/slack-blocks";

export interface SlackDelivery {
  status: "sent" | "logged" | "failed";
  channel?: string;
  ts?: string;
  error?: string;
}

export interface SlackDestination {
  botToken: string | null;
  channelId: string | null;
}

export async function postBlocks(
  destination: SlackDestination,
  blocks: SlackBlock[],
  fallbackText: string,
): Promise<SlackDelivery> {
  // DESIGN.md: no emoji anywhere, including Slack. Interpolated content is the
  // way one would get in, so the send refuses rather than shipping it.
  if (containsEmoji(blocks)) {
    return { status: "failed", error: "Refusing to send: the message contains an emoji" };
  }
  if (!destination.botToken || !destination.channelId) {
    return { status: "logged" };
  }
  try {
    const { WebClient } = await import("@slack/web-api");
    const client = new WebClient(destination.botToken);
    const result = await client.chat.postMessage({
      channel: destination.channelId,
      text: fallbackText,
      blocks: blocks as never,
    });
    return { status: "sent", channel: result.channel ?? destination.channelId, ts: result.ts };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateBlocks(
  destination: SlackDestination,
  coordinates: { channel: string; ts: string },
  blocks: SlackBlock[],
  fallbackText: string,
): Promise<SlackDelivery> {
  if (containsEmoji(blocks)) {
    return { status: "failed", error: "Refusing to send: the message contains an emoji" };
  }
  if (!destination.botToken) return { status: "logged" };
  try {
    const { WebClient } = await import("@slack/web-api");
    const client = new WebClient(destination.botToken);
    await client.chat.update({
      channel: coordinates.channel,
      ts: coordinates.ts,
      text: fallbackText,
      blocks: blocks as never,
    });
    return { status: "sent", channel: coordinates.channel, ts: coordinates.ts };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

/** Five minutes, per Slack's own guidance on replay windows. */
export const SLACK_MAX_SKEW_SECONDS = 300;

/**
 * Verify `x-slack-signature`. Fails closed on a missing secret, a missing header
 * or a stale timestamp — this request acks an anomaly on someone's behalf.
 */
export function verifySlackRequest(opts: {
  signingSecret: string;
  timestamp: string | null;
  rawBody: string;
  signature: string | null;
  nowSeconds: number;
}): boolean {
  const { signingSecret, timestamp, rawBody, signature, nowSeconds } = opts;
  if (!signingSecret || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(nowSeconds - ts) > SLACK_MAX_SKEW_SECONDS) return false;
  const expected = `v0=${createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${rawBody}`, "utf8")
    .digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
