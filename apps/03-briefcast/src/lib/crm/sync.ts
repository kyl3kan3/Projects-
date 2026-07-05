/**
 * Composes CRM sync operations from a processed meeting into crm_sync_logs
 * rows, then applies them (respecting review/auto mode). Every write is
 * idempotent by key, records old/new, and is individually retryable — the
 * "sync you can trust" that makes RevOps champion the product.
 */

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { hubspotAdapter } from "@/lib/crm/hubspot";
import type { CrmAdapter } from "@/lib/crm/types";

export async function adapterFor(connectionId: string): Promise<CrmAdapter | null> {
  const conn = await db.query.crmConnections.findFirst({
    where: eq(schema.crmConnections.id, connectionId),
  });
  if (!conn || conn.status !== "active") return null;
  if (conn.provider === "hubspot") return hubspotAdapter(conn.id, conn.accessTokenEnc);
  return null; // pipedrive/salesforce post-MVP
}

/**
 * Turn a meeting's summary + action items into pending sync-log rows.
 * Idempotent: re-running never duplicates (unique idempotency_key).
 */
export async function composeSyncLogs(meetingId: string): Promise<number> {
  const meeting = await db.query.meetings.findFirst({ where: eq(schema.meetings.id, meetingId) });
  if (!meeting) return 0;

  const conn = await db.query.crmConnections.findFirst({
    where: and(eq(schema.crmConnections.orgId, meeting.orgId), eq(schema.crmConnections.status, "active")),
  });
  if (!conn) return 0;

  const summary = await db.query.summaries.findFirst({ where: eq(schema.summaries.meetingId, meetingId) });
  const link = await db.query.meetingDealLinks.findFirst({ where: eq(schema.meetingDealLinks.meetingId, meetingId) });
  const deal = link ? await db.query.deals.findFirst({ where: eq(schema.deals.id, link.dealId) }) : null;
  const target = deal?.externalId
    ? { object: "deal" as const, id: deal.externalId }
    : null;
  if (!target || !summary) return 0;

  const rows: (typeof schema.crmSyncLogs.$inferInsert)[] = [];

  // 1. log the meeting itself
  rows.push({
    orgId: meeting.orgId,
    meetingId,
    crmConnectionId: conn.id,
    operation: "log_meeting",
    targetObject: target.object,
    targetId: target.id,
    label: "MEETING",
    newValue: meeting.title,
    status: "pending",
    idempotencyKey: `${meetingId}:log_meeting`,
  });

  // 2. action items -> tasks
  const items = await db.query.actionItems.findMany({ where: eq(schema.actionItems.meetingId, meetingId) });
  items.forEach((ai, i) => {
    rows.push({
      orgId: meeting.orgId,
      meetingId,
      crmConnectionId: conn.id,
      operation: "create_task",
      targetObject: target.object,
      targetId: target.id,
      label: "TASK",
      newValue: ai.text,
      status: "pending",
      idempotencyKey: `${meetingId}:task:${i}`,
    });
  });

  // 3. field proposals -> update_field
  summary.crmFieldProposals.forEach((p, i) => {
    rows.push({
      orgId: meeting.orgId,
      meetingId,
      crmConnectionId: conn.id,
      operation: "update_field",
      targetObject: p.object,
      targetId: target.id,
      field: p.property,
      label: p.label,
      oldValue: p.oldValue,
      newValue: p.newValue,
      confidence: p.confidence,
      status: "pending",
      idempotencyKey: `${meetingId}:field:${p.property}:${i}`,
    });
  });

  for (const row of rows) {
    await db.insert(schema.crmSyncLogs).values(row).onConflictDoNothing({ target: schema.crmSyncLogs.idempotencyKey });
  }
  return rows.length;
}

/** Apply one pending sync-log row against the live CRM. Records the result. */
export async function applySyncLog(syncLogId: string, appliedBy: string): Promise<void> {
  const log = await db.query.crmSyncLogs.findFirst({ where: eq(schema.crmSyncLogs.id, syncLogId) });
  if (!log || log.status !== "pending" || !log.crmConnectionId) return;

  const adapter = await adapterFor(log.crmConnectionId);
  if (!adapter) {
    await db.update(schema.crmSyncLogs).set({ status: "failed", error: "No active CRM connection" }).where(eq(schema.crmSyncLogs.id, syncLogId));
    return;
  }

  const meeting = log.meetingId ? await db.query.meetings.findFirst({ where: eq(schema.meetings.id, log.meetingId) }) : null;

  try {
    if (log.operation === "log_meeting" && meeting && log.targetId && log.targetObject !== "company") {
      const summary = await db.query.summaries.findFirst({ where: eq(schema.summaries.meetingId, meeting.id) });
      await adapter.logMeeting({
        targetObject: log.targetObject as "contact" | "deal",
        targetId: log.targetId,
        title: meeting.title,
        body: summary?.overview ?? meeting.title,
        occurredAt: meeting.startsAt ?? new Date(),
        idempotencyKey: log.idempotencyKey ?? syncLogId,
      });
    } else if (log.operation === "create_task" && log.targetId && log.targetObject !== "company") {
      await adapter.createTask({
        targetObject: log.targetObject as "contact" | "deal",
        targetId: log.targetId,
        text: log.newValue ?? "",
        dueDate: null,
        idempotencyKey: log.idempotencyKey ?? syncLogId,
      });
    } else if (log.operation === "update_field" && log.targetId && log.field && log.targetObject) {
      const { oldValue } = await adapter.updateField({
        object: log.targetObject,
        targetId: log.targetId,
        property: log.field,
        value: log.newValue ?? "",
      });
      await db.update(schema.crmSyncLogs).set({ oldValue }).where(eq(schema.crmSyncLogs.id, syncLogId));
    }
    await db.update(schema.crmSyncLogs).set({ status: "applied", appliedBy, error: null }).where(eq(schema.crmSyncLogs.id, syncLogId));
  } catch (err) {
    await db
      .update(schema.crmSyncLogs)
      .set({ status: "failed", error: err instanceof Error ? err.message : String(err) })
      .where(eq(schema.crmSyncLogs.id, syncLogId));
    throw err;
  }
}

export async function rejectSyncLog(syncLogId: string, orgId: string): Promise<void> {
  await db
    .update(schema.crmSyncLogs)
    .set({ status: "rejected" })
    .where(and(eq(schema.crmSyncLogs.id, syncLogId), eq(schema.crmSyncLogs.orgId, orgId)));
}
