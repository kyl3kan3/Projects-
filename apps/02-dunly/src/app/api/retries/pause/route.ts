import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cancelPlan } from "@/lib/campaigns";

const pauseSchema = z.object({
  failureId: z.string().min(1),
  reason: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const body = pauseSchema.parse(await request.json());
  const result = await cancelPlan(body.failureId);

  return NextResponse.json({
    ...result,
    reason: body.reason ?? "manual_hold",
  });
}
