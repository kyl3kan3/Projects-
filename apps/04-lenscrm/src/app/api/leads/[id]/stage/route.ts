import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSession } from "@/lib/auth";
const Body = z.object({ stage: z.enum(["inquiry", "consult", "proposal", "booked", "lost"]) });
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const lead = await db.query.leads.findFirst({ where: and(eq(schema.leads.id, id), eq(schema.leads.accountId, session.accountId)) });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.update(schema.leads).set({ stage: parsed.data.stage }).where(eq(schema.leads.id, id));
  return NextResponse.json({ ok: true });
}
