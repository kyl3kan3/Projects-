import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSession } from "@/lib/auth";

const Body = z.object({ status: z.enum(["open", "done", "dismissed"]) });

/** Check off / reopen an action item. Org-scoped through the meeting. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const item = await db.query.actionItems.findFirst({ where: eq(schema.actionItems.id, id) });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const meeting = await db.query.meetings.findFirst({
    where: and(eq(schema.meetings.id, item.meetingId), eq(schema.meetings.orgId, session.orgId)),
  });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.update(schema.actionItems).set({ status: parsed.data.status }).where(eq(schema.actionItems.id, id));
  return NextResponse.json({ ok: true });
}
