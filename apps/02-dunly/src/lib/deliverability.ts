import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { SuppressionReason } from "@/db/schema";
import { serverEnv } from "./env";

export interface SenderDomainSetup {
  domain: string;
  status: "pending" | "verified" | "failed";
  records: Array<{ type: "TXT" | "CNAME"; host: string; value: string; status: "pending" | "verified" }>;
}

export interface SuppressionEntry {
  organizationId: string;
  email: string;
  reason: SuppressionReason;
  providerMessageId?: string | null;
  providerEventId?: string | null;
  suppressedAt: Date;
}

declare global {
  var __dunlySuppressions: Map<string, SuppressionEntry> | undefined;
}

function suppressionStore() {
  if (!globalThis.__dunlySuppressions) {
    globalThis.__dunlySuppressions = new Map();
  }
  return globalThis.__dunlySuppressions;
}

export function getSenderDomainSetup(domain: string): SenderDomainSetup {
  const normalized = domain.toLowerCase().trim();
  return {
    domain: normalized,
    status: "verified",
    records: [
      {
        type: "TXT",
        host: normalized,
        value: "v=spf1 include:send.dunly.example -all",
        status: "verified",
      },
      {
        type: "CNAME",
        host: `dkim._domainkey.${normalized}`,
        value: "dkim.dunly.example",
        status: "verified",
      },
      {
        type: "CNAME",
        host: `bounce.${normalized}`,
        value: "feedback.dunly.example",
        status: "verified",
      },
    ],
  };
}

export async function recordSuppression(input: {
  organizationId?: string;
  email: string;
  reason: SuppressionReason;
  providerMessageId?: string;
  providerEventId?: string;
  metadata?: Record<string, unknown>;
}) {
  const organizationId = input.organizationId ?? "00000000-0000-0000-0000-000000000000";
  const suppressedAt = new Date();

  if (!serverEnv.databaseUrl) {
    const entry = {
      organizationId,
      email: input.email.toLowerCase(),
      reason: input.reason,
      providerMessageId: input.providerMessageId,
      providerEventId: input.providerEventId,
      suppressedAt,
    };
    suppressionStore().set(`${organizationId}:${entry.email}`, entry);
    return entry;
  }

  const rows = await getDb()
    .insert(schema.emailSuppressions)
    .values({
      organizationId,
      email: input.email.toLowerCase(),
      reason: input.reason,
      providerMessageId: input.providerMessageId,
      providerEventId: input.providerEventId,
      suppressedAt,
      metadata: input.metadata ?? {},
    })
    .onConflictDoUpdate({
      target: [schema.emailSuppressions.organizationId, schema.emailSuppressions.email],
      set: {
        reason: input.reason,
        providerMessageId: input.providerMessageId,
        providerEventId: input.providerEventId,
        suppressedAt,
        metadata: input.metadata ?? {},
      },
    })
    .returning({
      organizationId: schema.emailSuppressions.organizationId,
      email: schema.emailSuppressions.email,
      reason: schema.emailSuppressions.reason,
      providerMessageId: schema.emailSuppressions.providerMessageId,
      providerEventId: schema.emailSuppressions.providerEventId,
      suppressedAt: schema.emailSuppressions.suppressedAt,
    });

  return rows[0];
}

export async function listSuppressionPreview(limit = 5): Promise<SuppressionEntry[]> {
  if (!serverEnv.databaseUrl) {
    const seeded: SuppressionEntry[] = [
      {
        organizationId: "org_demo",
        email: "former@cedarlabs.io",
        reason: "unsubscribe",
        providerMessageId: "msg_demo_unsub",
        suppressedAt: new Date("2026-06-28T14:20:00Z"),
      },
      {
        organizationId: "org_demo",
        email: "old-card@morrow.studio",
        reason: "bounce",
        providerMessageId: "msg_demo_bounce",
        suppressedAt: new Date("2026-06-19T09:12:00Z"),
      },
    ];
    const recorded = Array.from(suppressionStore().values());
    return [...recorded, ...seeded].slice(0, limit);
  }

  return getDb()
    .select({
      organizationId: schema.emailSuppressions.organizationId,
      email: schema.emailSuppressions.email,
      reason: schema.emailSuppressions.reason,
      providerMessageId: schema.emailSuppressions.providerMessageId,
      providerEventId: schema.emailSuppressions.providerEventId,
      suppressedAt: schema.emailSuppressions.suppressedAt,
    })
    .from(schema.emailSuppressions)
    .orderBy(desc(schema.emailSuppressions.suppressedAt))
    .limit(limit);
}
