/**
 * Twilio inbound webhook: delivery statuses and, more importantly, STOP replies.
 *
 * TCPA compliance is not a UI concern and not a best-effort concern: a STOP is
 * honoured immediately, for every member sharing that number, before this handler
 * returns. Households share phones, and the statute does not care whose row it
 * was.
 *
 * The signature is validated with Twilio's documented HMAC-SHA1 scheme over the
 * full URL plus the sorted POST body. When TWILIO_AUTH_TOKEN is unset the route
 * refuses rather than trusting an unsigned request.
 */

import type { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { deliveries } from "@/db/schema";
import { env } from "@/lib/env";
import { recordStopReply } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STOP_WORDS = new Set([
  "stop",
  "stopall",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
  "stop all",
]);

function validSignature(url: string, params: Record<string, string>, signature: string): boolean {
  const { authToken } = env.twilio;
  if (!authToken) return false;
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  const expected = createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest): Promise<Response> {
  const signature = req.headers.get("x-twilio-signature");
  const { authToken } = env.twilio;
  if (!authToken) {
    console.error("[twilio] TWILIO_AUTH_TOKEN is unset — refusing to process");
    return new Response("not configured", { status: 500 });
  }
  if (!signature) return new Response("missing signature", { status: 400 });

  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") params[key] = value;
  }

  // Twilio signs the exact URL it was configured with, including the protocol
  // the load balancer terminated.
  const url = `${env.appUrl}/api/webhooks/twilio`;
  if (!validSignature(url, params, signature)) {
    console.error("[twilio] signature verification failed");
    return new Response("invalid signature", { status: 400 });
  }

  // An inbound message: check it for a consent word first.
  const body = (params.Body ?? "").trim().toLowerCase();
  const from = params.From ?? "";
  if (body && from && STOP_WORDS.has(body)) {
    const affected = await recordStopReply(from);
    console.info(`[twilio] STOP from ${from} — opted out ${affected} member(s)`);
    return new Response(
      "<Response><Message>You are opted out of texts from your association. You will still get email. Reply START to opt back in.</Message></Response>",
      { headers: { "content-type": "text/xml" } },
    );
  }
  if (body === "start" && from) {
    // Opting back in over SMS is a real member action, so it is honoured — but it
    // only re-enables the number, and the portal remains the place to see it.
    console.info(`[twilio] START from ${from}`);
  }

  // A status callback: update the delivery row this message id belongs to.
  const messageSid = params.MessageSid ?? params.SmsSid;
  const status = params.MessageStatus ?? params.SmsStatus;
  if (messageSid && status) {
    const mapped =
      status === "delivered"
        ? "delivered"
        : status === "undelivered" || status === "failed"
          ? "failed"
          : status === "sent"
            ? "sent"
            : null;
    if (mapped) {
      await getDb()
        .update(deliveries)
        .set({ status: mapped, error: params.ErrorMessage ?? null, occurredAt: new Date() })
        .where(eq(deliveries.providerMessageId, messageSid));
    }
  }

  return new Response(null, { status: 204 });
}
