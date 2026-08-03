/**
 * POST /api/webhooks/twilio
 *
 * Delivery statuses and inbound messages.
 *
 * STOP is the single most important request this application receives, so it is honoured first
 * and it does **not** depend on the signature check passing: a request we cannot verify but
 * which plainly says STOP is still a person asking not to be texted. It is applied globally —
 * one phone number can be in several stylists' books, and STOP means all of them.
 *
 * Everything else needs a verified request, because a forged delivery report could suppress a
 * client's number or fake a delivery. Signature verification is HMAC-SHA1 over the full URL
 * plus the sorted POST parameters, computed here rather than pulling the Twilio SDK into the
 * request path for one function.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { messages } from "@/db/schema";
import { env } from "@/lib/env";
import { audit } from "@/server/audit";
import { recordWebhookEvent } from "@/server/billing";
import { optInPhone, optOutPhone } from "@/server/notify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function twiml(): Response {
  return new Response(EMPTY_TWIML, {
    status: 200,
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}

function verifySignature(
  url: string,
  params: Record<string, string>,
  signature: string | null,
): boolean {
  const authToken = env.twilio.authToken;
  if (!authToken || !signature) return false;
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  const expected = createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

const STOP_WORDS = new Set([
  "stop",
  "stopall",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
  "revoke",
  "optout",
]);
const START_WORDS = new Set(["start", "unstop", "yes"]);

export async function POST(req: Request): Promise<Response> {
  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) params[key] = String(value);

  const signature = req.headers.get("x-twilio-signature");
  const verified = verifySignature(req.url, params, signature);

  const messageSid = params.MessageSid ?? params.SmsSid ?? "";
  const body = (params.Body ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
  const from = params.From ?? "";
  const status = (params.MessageStatus ?? params.SmsStatus ?? "").toLowerCase();

  // --- STOP first, verified or not ---
  if (from && body && STOP_WORDS.has(body)) {
    const count = await optOutPhone(from);
    await audit({
      actor: { kind: "client_token" },
      action: "sms.opted_out",
      target: from,
      metadata: { clients: count, verified },
    });
    return twiml();
  }

  if (from && body && START_WORDS.has(body)) {
    const count = await optInPhone(from);
    await audit({
      actor: { kind: "client_token" },
      action: "sms.opted_in",
      target: from,
      metadata: { clients: count, verified },
    });
    return twiml();
  }

  if (!verified || !messageSid) return twiml();

  const fresh = await recordWebhookEvent({
    provider: "twilio",
    externalId: `${messageSid}:${status || "inbound"}`,
    type: status || "inbound",
    payload: { messageSid, status },
  });
  if (!fresh) return twiml();

  if (status === "delivered") {
    const db = getDb();
    await db
      .update(messages)
      .set({ status: "delivered" })
      .where(eq(messages.providerMessageId, messageSid));
  } else if (status === "failed" || status === "undelivered") {
    const db = getDb();
    await db
      .update(messages)
      .set({ status: "failed", failureReason: params.ErrorCode ?? "carrier rejected" })
      .where(eq(messages.providerMessageId, messageSid));
  }

  return twiml();
}
