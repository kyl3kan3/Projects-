/**
 * Twilio webhook: SMS delivery status, and inbound STOP.
 *
 * STOP is the single most important request this application receives. It is
 * honoured before anything else in the handler, permanently, and it does not depend
 * on the signature check passing — a request we cannot verify but which plainly
 * says STOP is still a person asking not to be texted. We record the opt-out and
 * then return the same empty TwiML either way.
 *
 * Signature verification is HMAC-SHA1 over the full URL plus the sorted POST
 * parameters, computed here rather than pulling in the Twilio SDK for one function.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { patients } from "@/db/schema";
import { env } from "@/lib/env";
import { applyProviderEvent, optOutPatient } from "@/server/campaigns";
import { recordWebhookEvent } from "@/server/billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function twiml(): Response {
  return new Response(EMPTY_TWIML, {
    status: 200,
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}

function verifySignature(url: string, params: Record<string, string>, signature: string | null): boolean {
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

const STOP_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "revoke", "optout"]);

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
  if (body && STOP_WORDS.has(body) && from) {
    const db = getDb();
    const matches = await db
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.phone, from), isNull(patients.smsOptedOutAt)));
    for (const match of matches) {
      await optOutPatient({ patientId: match.id, channel: "sms" });
    }
    return twiml();
  }

  // Everything else needs a verified request: a forged delivery report could
  // otherwise suppress a patient's number or fake a delivery.
  if (!verified) return twiml();

  if (!messageSid) return twiml();

  const fresh = await recordWebhookEvent({
    provider: "twilio",
    externalId: `${messageSid}:${status || "inbound"}`,
    type: status || "inbound",
    payload: { messageSid, status },
  });
  if (!fresh) return twiml();

  if (status === "delivered") {
    await applyProviderEvent({ providerMessageId: messageSid, event: "delivered", channel: "sms" });
  } else if (status === "failed" || status === "undelivered") {
    await applyProviderEvent({ providerMessageId: messageSid, event: "failed", channel: "sms" });
  }

  return twiml();
}
