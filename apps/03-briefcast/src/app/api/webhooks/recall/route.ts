/**
 * src/app/api/webhooks/recall/route.ts
 *
 * Recall.ai webhook receiver. Recall posts bot lifecycle events here
 * (bot.joining, bot.in_call_recording, bot.done, bot.fatal, recording ready).
 * This handler must verify the signature, persist the status transition,
 * enqueue heavy work to BullMQ, and return 200 quickly -- no media download
 * or transcription in the request path.
 *
 * TODO:
 * - [ ] Verify webhook signature with RECALL_WEBHOOK_SECRET (reject 401 otherwise)
 * - [ ] Parse and Zod-validate event payload; ignore unknown event types with 200
 * - [ ] Update bots.status / bots.raw_events by recall_bot_id
 * - [ ] On recording-ready: enqueue "transcribe" job with meeting_id
 * - [ ] On bot.fatal / could-not-join: mark meeting failed, notify organizer
 * - [ ] Idempotency: dedupe by Recall event id
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(_req: NextRequest): Promise<NextResponse> {
  throw new Error("Not implemented");
}
