import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { queue, type TranscribeJob } from "@/lib/queue";
import { mapBotStatus } from "@/lib/recall";

/**
 * Recall.ai status webhooks. Verify, update bot state, ack fast. On `done`
 * (recording ready), enqueue transcription — no heavy work inline.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    event?: string;
    data?: { bot_id?: string; status?: { code?: string } };
  } | null;
  const recallBotId = body?.data?.bot_id;
  const code = body?.data?.status?.code;
  if (!recallBotId || !code) return NextResponse.json({ ok: true });

  const bot = await db.query.bots.findFirst({ where: eq(schema.bots.recallBotId, recallBotId) });
  if (!bot) return NextResponse.json({ ok: true });

  const status = mapBotStatus(code);
  await db.update(schema.bots).set({ status }).where(eq(schema.bots.id, bot.id));

  if (status === "in_call") {
    await db.update(schema.meetings).set({ status: "recording" }).where(eq(schema.meetings.id, bot.meetingId));
  } else if (status === "failed") {
    await db
      .update(schema.meetings)
      .set({ status: "failed", failureReason: code })
      .where(eq(schema.meetings.id, bot.meetingId));
  } else if (status === "done") {
    await queue("pipeline").add("transcribe", { meetingId: bot.meetingId } satisfies TranscribeJob);
  }

  return NextResponse.json({ ok: true });
}
