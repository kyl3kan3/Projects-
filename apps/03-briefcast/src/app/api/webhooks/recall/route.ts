import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { queue, type TranscribeJob } from "@/lib/queue";
import { mapBotStatus } from "@/lib/recall";
import { readRawWebhookBody, verifyProviderWebhook } from "@/lib/provider-webhook";

export async function POST(req: Request) {
  // New accounts use workspace verification and webhook-* headers; legacy
  // dashboard endpoints use their own Svix secret and svix-* headers.
  // Never mix fields from independently signed header families.
  const prefix = req.headers.has("webhook-id") ? "webhook" : "svix";
  const secret = prefix === "webhook" ? process.env.RECALL_WORKSPACE_VERIFICATION_SECRET
    : process.env.RECALL_SVIX_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook verification is not configured" }, { status: 503 });
  let verified;
  try {
    verified = verifyProviderWebhook(await readRawWebhookBody(req), req.headers, secret, prefix);
  } catch {
    return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
  }
  const body = verified.payload as {
    event?: string;
    data?: { bot_id?: string; bot?: { id?: string }; status?: { code?: string }; data?: { code?: string } };
  } | null;
  const recallBotId = body?.data?.bot?.id ?? body?.data?.bot_id;
  const code = body?.data?.data?.code ?? body?.data?.status?.code;
  if (typeof recallBotId !== "string" || typeof code !== "string") return NextResponse.json({ ok: true });
  const eventId = `recall:${verified.id}`;
  await db.transaction(async (tx) => {
    const claimed = await tx.insert(schema.providerWebhookReceipts)
      .values({ id: eventId }).onConflictDoNothing().returning();
    if (!claimed.length) return;
    const bot = await tx.query.bots.findFirst({ where: eq(schema.bots.recallBotId, recallBotId) });
    if (!bot) throw new Error("Webhook bot is not yet available; retry delivery");
    const status = mapBotStatus(code);
    await tx.update(schema.bots).set({ status }).where(eq(schema.bots.id, bot.id));
    if (status === "in_call") {
      await tx.update(schema.meetings).set({ status: "recording" }).where(eq(schema.meetings.id, bot.meetingId));
    } else if (status === "failed") {
      await tx.update(schema.meetings).set({ status: "failed", failureReason: code })
        .where(eq(schema.meetings.id, bot.meetingId));
    } else if (status === "done") {
      // Stable retained job IDs deduplicate the window where Redis accepts the
      // job but the database transaction fails before committing its receipt.
      await queue("pipeline").add("transcribe", { meetingId: bot.meetingId } satisfies TranscribeJob, {
        jobId: createHash("sha256").update(eventId).digest("hex"),
        removeOnComplete: false, removeOnFail: false,
      });
    }
  });
  return NextResponse.json({ ok: true });
}
