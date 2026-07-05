import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSession } from "@/lib/auth";
import { applySyncLog, rejectSyncLog } from "@/lib/crm/sync";

const Body = z.object({ action: z.enum(["apply", "reject"]) });

/** Approve or dismiss one proposed CRM change (review mode). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const log = await db.query.crmSyncLogs.findFirst({
    where: and(eq(schema.crmSyncLogs.id, id), eq(schema.crmSyncLogs.orgId, session.orgId)),
  });
  if (!log) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    if (parsed.data.action === "apply") await applySyncLog(id, session.userId);
    else await rejectSyncLog(id, session.orgId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed" }, { status: 502 });
  }
}
