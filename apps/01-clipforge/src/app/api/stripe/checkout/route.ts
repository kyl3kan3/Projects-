import { NextResponse } from "next/server";
import { z } from "zod";
import { currentContext } from "@/lib/auth";
import { createCheckoutSession } from "@/lib/billing";

const schema = z.object({ plan: z.enum(["starter", "pro", "team"]) });

export async function POST(req: Request) {
  const ctx = await currentContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }
  try {
    const url = await createCheckoutSession(ctx.workspace.id, parsed.data.plan);
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Checkout failed" },
      { status: 500 },
    );
  }
}
