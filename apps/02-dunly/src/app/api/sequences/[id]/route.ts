import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSession } from "@/lib/auth";

const Body = z.object({
  active: z.boolean().optional(),
  steps: z
    .array(
      z.object({
        offsetHours: z.number().min(0).max(24 * 60),
        channel: z.enum(["email", "sms"]),
        templateKey: z.string().min(1).max(60),
      }),
    )
    .max(10)
    .optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const campaign = await db.query.recoveryCampaigns.findFirst({
    where: and(
      eq(schema.recoveryCampaigns.id, id),
      eq(schema.recoveryCampaigns.organizationId, session.organizationId),
    ),
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db
    .update(schema.recoveryCampaigns)
    .set({
      ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
      ...(parsed.data.steps ? { steps: parsed.data.steps } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.recoveryCampaigns.id, id));

  return NextResponse.json({ ok: true });
}
