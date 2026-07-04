/**
 * Dashboard reads: hero stat, at-risk MRR, activity feed, campaign
 * performance. All money in cents; the UI formats.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { recoverySummary } from "@/lib/attribution";

export interface OverviewStats {
  recoveredCents: number;
  baselineCents: number;
  preventedCents: number;
  recoveredCount: number;
  atRiskCents: number;
  inRecoveryCount: number;
}

export async function overviewStats(organizationId: string, days: number): Promise<OverviewStats> {
  const summary = await recoverySummary(organizationId, days);

  const [atRisk] = await db
    .select({
      total: sql<number>`coalesce(sum(${schema.paymentFailures.amountDueCents}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(schema.paymentFailures)
    .where(
      and(
        eq(schema.paymentFailures.organizationId, organizationId),
        inArray(schema.paymentFailures.status, ["open", "recovering"]),
      ),
    );

  return {
    recoveredCents: summary.byDunlyCents,
    baselineCents: summary.baselineCents,
    preventedCents: summary.preventedCents,
    recoveredCount: summary.recoveredCount,
    atRiskCents: Number(atRisk?.total ?? 0),
    inRecoveryCount: Number(atRisk?.count ?? 0),
  };
}

export interface FeedItem {
  id: string;
  kind: "recovered" | "failed" | "message" | "retry";
  customerName: string;
  amountCents: number;
  currency: string;
  detail: string;
  at: Date;
}

export async function activityFeed(organizationId: string, limit = 30): Promise<FeedItem[]> {
  const recoveries = await db
    .select({
      id: schema.recoveredRevenueEvents.id,
      amountCents: schema.recoveredRevenueEvents.amountCents,
      currency: schema.recoveredRevenueEvents.currency,
      attributedTo: schema.recoveredRevenueEvents.attributedTo,
      at: schema.recoveredRevenueEvents.recoveredAt,
      customerName: schema.customers.name,
      customerEmail: schema.customers.email,
    })
    .from(schema.recoveredRevenueEvents)
    .leftJoin(
      schema.paymentFailures,
      eq(schema.recoveredRevenueEvents.paymentFailureId, schema.paymentFailures.id),
    )
    .leftJoin(schema.customers, eq(schema.paymentFailures.customerId, schema.customers.id))
    .where(eq(schema.recoveredRevenueEvents.organizationId, organizationId))
    .orderBy(desc(schema.recoveredRevenueEvents.recoveredAt))
    .limit(limit);

  const failures = await db
    .select({
      id: schema.paymentFailures.id,
      amountCents: schema.paymentFailures.amountDueCents,
      currency: schema.paymentFailures.currency,
      declineCode: schema.paymentFailures.declineCode,
      at: schema.paymentFailures.firstFailedAt,
      customerName: schema.customers.name,
      customerEmail: schema.customers.email,
    })
    .from(schema.paymentFailures)
    .leftJoin(schema.customers, eq(schema.paymentFailures.customerId, schema.customers.id))
    .where(eq(schema.paymentFailures.organizationId, organizationId))
    .orderBy(desc(schema.paymentFailures.firstFailedAt))
    .limit(limit);

  const items: FeedItem[] = [
    ...recoveries.map((r) => ({
      id: `r-${r.id}`,
      kind: "recovered" as const,
      customerName: r.customerName ?? r.customerEmail ?? "Customer",
      amountCents: r.amountCents,
      currency: r.currency,
      detail:
        r.attributedTo === "baseline"
          ? "recovered (baseline — not counted)"
          : `recovered via ${r.attributedTo}`,
      at: r.at,
    })),
    ...failures.map((f) => ({
      id: `f-${f.id}`,
      kind: "failed" as const,
      customerName: f.customerName ?? f.customerEmail ?? "Customer",
      amountCents: f.amountCents,
      currency: f.currency,
      detail: f.declineCode ? `payment failed · ${f.declineCode}` : "payment failed",
      at: f.at,
    })),
  ];

  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

export interface AtRiskRow {
  failureId: string;
  customerName: string;
  amountCents: number;
  currency: string;
  declineCode: string | null;
  firstFailedAt: Date;
  attempts: {
    attemptNumber: number;
    scheduledFor: Date;
    result: string;
  }[];
}

export async function atRiskRows(organizationId: string): Promise<AtRiskRow[]> {
  const failures = await db
    .select({
      id: schema.paymentFailures.id,
      amountCents: schema.paymentFailures.amountDueCents,
      currency: schema.paymentFailures.currency,
      declineCode: schema.paymentFailures.declineCode,
      firstFailedAt: schema.paymentFailures.firstFailedAt,
      customerName: schema.customers.name,
      customerEmail: schema.customers.email,
    })
    .from(schema.paymentFailures)
    .leftJoin(schema.customers, eq(schema.paymentFailures.customerId, schema.customers.id))
    .where(
      and(
        eq(schema.paymentFailures.organizationId, organizationId),
        inArray(schema.paymentFailures.status, ["open", "recovering"]),
      ),
    )
    .orderBy(desc(schema.paymentFailures.firstFailedAt))
    .limit(100);

  if (failures.length === 0) return [];

  const attempts = await db
    .select({
      paymentFailureId: schema.recoveryAttempts.paymentFailureId,
      attemptNumber: schema.recoveryAttempts.attemptNumber,
      scheduledFor: schema.recoveryAttempts.scheduledFor,
      result: schema.recoveryAttempts.result,
    })
    .from(schema.recoveryAttempts)
    .where(
      inArray(
        schema.recoveryAttempts.paymentFailureId,
        failures.map((f) => f.id),
      ),
    );

  const byFailure = new Map<string, AtRiskRow["attempts"]>();
  for (const a of attempts) {
    const list = byFailure.get(a.paymentFailureId) ?? [];
    list.push({ attemptNumber: a.attemptNumber, scheduledFor: a.scheduledFor, result: a.result });
    byFailure.set(a.paymentFailureId, list);
  }

  return failures.map((f) => ({
    failureId: f.id,
    customerName: f.customerName ?? f.customerEmail ?? "Customer",
    amountCents: f.amountCents,
    currency: f.currency,
    declineCode: f.declineCode,
    firstFailedAt: f.firstFailedAt,
    attempts: (byFailure.get(f.id) ?? []).sort((a, b) => a.attemptNumber - b.attemptNumber),
  }));
}
