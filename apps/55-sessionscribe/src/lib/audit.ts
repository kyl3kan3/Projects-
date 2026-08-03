/**
 * src/lib/audit.ts
 *
 * The append-only audit trail — a product surface (the Trust screen), not an ops
 * artifact. Every view, edit, draft, sign, amendment, export and purge lands
 * here with an actor, a timestamp and an IP.
 *
 * Two guarantees this module owns:
 *
 *  - **Append-only.** There is no update or delete helper here, and migration
 *    0001 installs a trigger that raises if anyone tries anyway.
 *  - **No PHI in metadata, by allowlist.** `sanitizeMetadata` keeps only the
 *    keys named below and drops everything else with a warning. An allowlist
 *    rather than a blocklist because the failure mode is asymmetric: a forgotten
 *    blocklist entry writes a client's words into a log that is exported by
 *    date range, and no amount of later care removes it. Note text, transcript
 *    text and client labels therefore *cannot* reach this table — they have no
 *    allowlisted key to travel in.
 */

import { and, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, type AuditEvent } from "@/db/schema";

export type AuditAction =
  | "login"
  | "logout"
  | "signup"
  | "viewed"
  | "created"
  | "edited"
  | "drafted"
  | "redrafted"
  | "signed"
  | "cosigned"
  | "amended"
  | "exported"
  | "purged"
  | "settings_changed"
  | "billing_changed"
  | "failed";

/**
 * Keys allowed in `audit_events.metadata`. Ids, counts, enums and hashes only —
 * nothing that could carry a sentence a client said.
 */
export const ALLOWED_METADATA_KEYS = [
  "sessionId",
  "noteId",
  "clientId",
  "templateId",
  "version",
  "versions",
  "format",
  "modality",
  "captureKind",
  "sectionKey",
  "sectionCount",
  "wordCount",
  "sentenceCount",
  "tracedSentences",
  "untracedSentences",
  "contentHash",
  "reason",
  "provider",
  "model",
  "fixture",
  "plan",
  "period",
  "count",
  "artifact",
  "retentionDays",
  "byteSize",
  "durationSeconds",
  "attempt",
  "status",
  "exportKind",
  "from",
  "to",
  "costMicros",
  "inputTokens",
  "outputTokens",
  "notesDrafted",
] as const;

export type AuditMetadata = Partial<
  Record<(typeof ALLOWED_METADATA_KEYS)[number], string | number | boolean | null>
>;

const ALLOWED = new Set<string>(ALLOWED_METADATA_KEYS);

export function sanitizeMetadata(input: AuditMetadata | null | undefined): {
  metadata: Record<string, unknown>;
  dropped: string[];
} {
  const metadata: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(input ?? {})) {
    if (value === undefined) continue;
    if (!ALLOWED.has(key)) {
      dropped.push(key);
      continue;
    }
    metadata[key] = value;
  }
  return { metadata, dropped };
}

export interface AuditInput {
  practiceId: string;
  actorId?: string | null;
  actorKind?: "user" | "system";
  action: AuditAction;
  targetKind: string;
  targetId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: AuditMetadata | null;
}

/**
 * Write one audit row.
 *
 * Never throws: losing the clinician's action because the ledger write failed
 * would be worse than a gap in the ledger, but the gap is loud in the logs.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  const { metadata, dropped } = sanitizeMetadata(input.metadata);
  if (dropped.length) {
    console.warn(
      `[audit] dropped non-allowlisted metadata keys on ${input.action}: ${dropped.join(", ")}`,
    );
  }
  try {
    const db = getDb();
    await db.insert(auditEvents).values({
      practiceId: input.practiceId,
      actorId: input.actorId ?? null,
      actorKind: input.actorKind ?? "user",
      action: input.action,
      targetKind: input.targetKind,
      targetId: input.targetId ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      metadata,
    });
  } catch (err) {
    console.error(`[audit] could not write ${input.action} event`, err);
  }
}

/* ----------------------------------------------------------------- reading */

export type AuditFilter = "all" | "views" | "edits" | "signs" | "exports" | "purges";

const FILTER_ACTIONS: Record<Exclude<AuditFilter, "all">, AuditAction[]> = {
  views: ["viewed"],
  edits: ["created", "edited", "drafted", "redrafted", "amended", "settings_changed"],
  signs: ["signed", "cosigned"],
  exports: ["exported"],
  purges: ["purged"],
};

export function filterActions(filter: AuditFilter): AuditAction[] | null {
  return filter === "all" ? null : FILTER_ACTIONS[filter];
}

export const AUDIT_VERB: Record<AuditAction, string> = {
  login: "SIGNED IN",
  logout: "SIGNED OUT",
  signup: "PRACTICE CREATED",
  viewed: "VIEWED",
  created: "CREATED",
  edited: "EDITED",
  drafted: "DRAFTED",
  redrafted: "REDRAFTED",
  signed: "SIGNED",
  cosigned: "CO-SIGNED",
  amended: "AMENDED",
  exported: "EXPORTED",
  purged: "PURGED",
  settings_changed: "SETTINGS",
  billing_changed: "BILLING",
  failed: "FAILED",
};

export interface AuditQuery {
  practiceId: string;
  filter?: AuditFilter;
  targetKind?: string;
  targetId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

function conditions(q: AuditQuery): SQL[] {
  const where: SQL[] = [eq(auditEvents.practiceId, q.practiceId)];
  const actions = filterActions(q.filter ?? "all");
  if (actions) where.push(inArray(auditEvents.action, actions));
  if (q.targetKind) where.push(eq(auditEvents.targetKind, q.targetKind));
  if (q.targetId) where.push(eq(auditEvents.targetId, q.targetId));
  // Typed operators: a Date interpolated into a raw sql fragment skips Drizzle's
  // encoder and postgres.js then throws on it at runtime.
  if (q.from) where.push(gte(auditEvents.occurredAt, q.from));
  if (q.to) where.push(lte(auditEvents.occurredAt, q.to));
  return where;
}

export async function listAuditEvents(q: AuditQuery): Promise<AuditEvent[]> {
  const db = getDb();
  return db
    .select()
    .from(auditEvents)
    .where(and(...conditions(q)))
    .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
    .limit(q.limit ?? 100)
    .offset(q.offset ?? 0);
}

/** CSV for the org audit export. Header row included; no PHI by construction. */
export function auditCsv(rows: AuditEvent[]): string {
  const head = [
    "occurred_at",
    "actor_kind",
    "actor_id",
    "action",
    "target_kind",
    "target_id",
    "ip",
    "metadata",
  ];
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [
      r.occurredAt.toISOString(),
      r.actorKind,
      r.actorId ?? "",
      r.action,
      r.targetKind,
      r.targetId ?? "",
      r.ip ?? "",
      JSON.stringify(r.metadata ?? {}),
    ]
      .map(cell)
      .join(","),
  );
  return [head.join(","), ...lines].join("\n");
}
