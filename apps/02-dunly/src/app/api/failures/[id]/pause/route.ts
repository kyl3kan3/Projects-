import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { queue } from "@/lib/queue";

/** Pause retries on one failure: cancel pending attempts (hold-to-confirm in UI). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const failure = await db.query.paymentFailures.findFirst({
    where: and(
      eq(schema.paymentFailures.id, id),
      eq(schema.paymentFailures.organizationId, session.organizationId),
    ),
  });
  if (!failure) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pending = await db.query.recoveryAttempts.findMany({
    where: and(
      eq(schema.recoveryAttempts.paymentFailureId, failure.id),
      eq(schema.recoveryAttempts.result, "pending"),
    ),
  });
  for (const p of pending) {
    if (p.bullmqJobId) await queue("retries").remove(p.bullmqJobId).catch(() => {});
    await db
      .update(schema.recoveryAttempts)
      .set({ result: "canceled" })
      .where(eq(schema.recoveryAttempts.id, p.id));
  }

  await audit(session.organizationId, session.userId, "retries.paused", failure.stripeInvoiceId, {
    canceled: pending.length,
  });
  return NextResponse.json({ ok: true, canceled: pending.length });
}
