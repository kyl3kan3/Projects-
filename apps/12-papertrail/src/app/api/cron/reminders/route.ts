/**
 * The reminder sweep: the app's only background work.
 *
 * Runs as a cron-triggered route with a time budget rather than a worker, because
 * Vercel has no always-on processes and Hobby cron fires once a day — which is
 * exactly this job's cadence (DEPLOYING.md). Everything it decides comes from
 * `nextReminderStep`, so the sweep has no scheduling logic of its own to get
 * wrong, and running it twice in a day sends nothing twice.
 *
 * Protected by CRON_SECRET, and refuses to run when that is unset rather than
 * defaulting to open.
 */

import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { brands, clients, reminderRules, reminderSends, users } from "@/db/schema";
import { env } from "@/lib/env";
import { sweepBudgetMs } from "@/lib/runtime";
import { refreshOverdue, unpaidInvoices } from "@/lib/invoices";
import { balanceDue } from "@/lib/money";
import { daysOverdue } from "@/lib/dates";
import { nextReminderStep, reminderCopy } from "@/lib/reminders";
import { plan } from "@/lib/plans";
import { documentUrl, sendReminder } from "@/lib/delivery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<Response> {
  const secret = env.cronSecret;
  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET is not set; refusing to run the reminder sweep." },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) return new Response("forbidden", { status: 403 });

  const startedAt = Date.now();
  const budget = sweepBudgetMs();
  const now = new Date();
  const db = getDb();

  // Statuses first: an invoice has to be known-late before it can be chased.
  const flipped = await refreshOverdue(null, now);

  const due = await unpaidInvoices(now);
  let considered = 0;
  let sent = 0;
  let skippedPlan = 0;
  const errors: string[] = [];

  for (const { document, invoice } of due) {
    if (Date.now() - startedAt > budget) break;
    considered++;

    const [owner] = await db.select().from(users).where(eq(users.id, document.userId));
    if (!owner) continue;
    if (!plan(owner.plan).autoReminders) {
      skippedPlan++;
      continue;
    }

    const [rule] = await db
      .select()
      .from(reminderRules)
      .where(eq(reminderRules.userId, owner.id));
    if (!rule) continue;

    const previous = await db
      .select()
      .from(reminderSends)
      .where(eq(reminderSends.documentId, document.id));

    const step = nextReminderStep(
      rule,
      { ...invoice, status: document.status },
      previous.map((row) => row.step),
      now,
    );
    if (!step) continue;

    const [client] = await db.select().from(clients).where(eq(clients.id, document.clientId));
    if (!client) continue;
    const brand = document.brandId
      ? (await db.select().from(brands).where(eq(brands.id, document.brandId)))[0] ?? null
      : null;

    const copy = reminderCopy(step.tone, {
      clientName: client.name,
      freelancerName: owner.name?.trim() || owner.email,
      invoiceNumber: invoice.number,
      documentTitle: document.title,
      balance: balanceDue(invoice),
      currency: invoice.currency,
      daysLate: daysOverdue(invoice.dueAt, now),
      link: documentUrl(document.publicToken),
    });

    try {
      const result = await sendReminder({
        documentId: document.id,
        step: step.step,
        to: client.email,
        cc: step.tone === "final" && rule.ccOwnerOnFinal ? [owner.email] : undefined,
        subject: copy.subject,
        body: copy.body,
        replyTo: owner.email,
        fromName: brand?.name ?? owner.name ?? "PaperTrail",
        senderDomain:
          plan(owner.plan).senderDomain && brand?.senderDomainVerified
            ? brand.senderDomain
            : null,
      });
      if (result.delivered) sent++;
      else if (result.error && result.error !== "Already sent") errors.push(result.error);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "send failed");
    }
  }

  return Response.json({
    ok: true,
    flippedToOverdue: flipped,
    overdueInvoices: due.length,
    considered,
    remindersSent: sent,
    skippedForPlan: skippedPlan,
    errors: errors.slice(0, 5),
    ms: Date.now() - startedAt,
  });
}
