import { NextRequest, NextResponse } from "next/server";
import { recordSuppression } from "@/lib/deliverability";

type ResendEvent = {
  type?: string;
  data?: {
    email?: string;
    to?: string[];
    id?: string;
  };
};

export async function POST(request: NextRequest) {
  const event = (await request.json().catch(() => ({}))) as ResendEvent;
  const email = event.data?.email ?? event.data?.to?.[0];
  const eventId = event.data?.id;

  if (!email) {
    return NextResponse.json({ received: true, suppressed: false });
  }

  if (event.type === "email.bounced") {
    return NextResponse.json({
      received: true,
      suppression: await recordSuppression({
        email,
        reason: "bounce",
        providerEventId: eventId,
        metadata: { provider: "resend", type: event.type },
      }),
    });
  }

  if (event.type === "email.complained") {
    return NextResponse.json({
      received: true,
      suppression: await recordSuppression({
        email,
        reason: "complaint",
        providerEventId: eventId,
        metadata: { provider: "resend", type: event.type },
      }),
    });
  }

  return NextResponse.json({ received: true, suppressed: false, type: event.type ?? "unknown" });
}
