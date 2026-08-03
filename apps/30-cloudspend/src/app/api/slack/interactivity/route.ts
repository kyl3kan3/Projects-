/**
 * Slack interactivity: the Ack button on an alert card.
 *
 * Slack posts a signed, url-encoded form. The signature and its timestamp are both
 * checked before anything is written, because this endpoint acks an anomaly on
 * someone's behalf.
 *
 * Ack updates the original message in place — the header gains an `Acked —` prefix
 * and the buttons are replaced by a context line — and the dashboard reflects the
 * same state, because both read the one row.
 */

import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { anomalies, members, orgs, users } from "@/db/schema";
import { env } from "@/lib/env";
import { verifySlackRequest } from "@/lib/slack";
import { ackAnomaly } from "@/lib/anomalies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<Response> {
  const signingSecret = env.slack.signingSecret;
  if (!signingSecret) {
    return Response.json(
      { error: "SLACK_SIGNING_SECRET is not set; refusing to accept Slack actions." },
      { status: 503 },
    );
  }

  const rawBody = await req.text();
  const verified = verifySlackRequest({
    signingSecret,
    timestamp: req.headers.get("x-slack-request-timestamp"),
    rawBody,
    signature: req.headers.get("x-slack-signature"),
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!verified) return new Response("unauthorised", { status: 401 });

  const payloadRaw = new URLSearchParams(rawBody).get("payload");
  if (!payloadRaw) return Response.json({ error: "No payload" }, { status: 400 });

  let payload: {
    type?: string;
    user?: { id?: string; username?: string };
    actions?: Array<{ action_id?: string; value?: string }>;
  };
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    return Response.json({ error: "Payload is not JSON" }, { status: 400 });
  }

  const action = payload.actions?.[0];
  if (payload.type !== "block_actions" || action?.action_id !== "anomaly_ack") {
    return Response.json({ ignored: `Unhandled action ${action?.action_id ?? payload.type}` });
  }
  const anomalyId = action.value;
  if (!anomalyId) return Response.json({ error: "No anomaly id on the action" }, { status: 400 });

  const db = getDb();
  const [anomaly] = await db.select().from(anomalies).where(eq(anomalies.id, anomalyId));
  if (!anomaly) return Response.json({ error: "Unknown anomaly" }, { status: 404 });
  const [org] = await db.select().from(orgs).where(eq(orgs.id, anomaly.orgId));
  if (!org) return Response.json({ error: "Unknown org" }, { status: 404 });

  // The owner is the account of record; the Slack username is what gets shown.
  const [membership] = await db.select().from(members).where(eq(members.orgId, org.id));
  const [owner] = membership
    ? await db.select().from(users).where(eq(users.id, membership.userId))
    : [];
  const actor = payload.user?.username ? `@${payload.user.username}` : "Slack";

  const result = await ackAnomaly(
    org,
    { email: owner?.email ?? "unknown@cloudspend", name: owner?.name ?? null },
    anomalyId,
    actor,
  );
  if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
  return Response.json({ ok: true });
}
