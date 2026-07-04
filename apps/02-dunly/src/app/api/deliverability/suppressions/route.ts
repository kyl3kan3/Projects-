import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listSuppressionPreview, recordSuppression } from "@/lib/deliverability";

const suppressionSchema = z.object({
  email: z.string().email(),
  reason: z.enum(["unsubscribe", "bounce", "complaint"]),
  providerMessageId: z.string().optional(),
});

export async function GET() {
  return NextResponse.json({
    suppressions: await listSuppressionPreview(),
  });
}

export async function POST(request: NextRequest) {
  const body = suppressionSchema.parse(await request.json());
  return NextResponse.json({
    suppression: await recordSuppression(body),
  });
}
