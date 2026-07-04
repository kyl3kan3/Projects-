import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listRecentWebhookEvents, replayStripeWebhookEvent } from "@/lib/webhooks";

const replaySchema = z.object({
  eventId: z.string().min(1),
});

export async function GET() {
  return NextResponse.json({
    events: await listRecentWebhookEvents(),
  });
}

export async function POST(request: NextRequest) {
  const body = replaySchema.parse(await request.json());
  const replay = await replayStripeWebhookEvent(body.eventId);
  return NextResponse.json(replay, { status: replay.replayed ? 200 : 404 });
}
