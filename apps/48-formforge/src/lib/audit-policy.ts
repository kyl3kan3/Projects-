/**
 * src/lib/audit-policy.ts
 *
 * What may be written to the audit log, and how a row is rendered. Pure: no
 * database import, so the policy can be tested — and reused by a client
 * component — without dragging `postgres` along.
 *
 * The allowlist is the interesting part. `metadata` is the one free-form field on
 * an audit row, which makes it the one place a patient's name can end up in a
 * table that is deliberately impossible to delete from. So it is an allowlist, not
 * a denylist and not a convention: "remember not to log the patient's name" is
 * exactly the rule that gets forgotten at 5pm on a Friday.
 */

import type { AuditAction, AuditEvent } from "@/db/schema";

/**
 * Every metadata key the audit log will store. Adding one is a deliberate act:
 * ask whether it could ever hold a patient's name, contact detail, answer text
 * or diagnosis before you add it.
 */
export const ALLOWED_METADATA_KEYS = [
  "fields",
  "count",
  "rows",
  "bytes",
  "channel",
  "step",
  "version",
  "plan",
  "kind",
  "instrument",
  "severity",
  "flagged",
  "reason",
  "status",
  "section",
  "sections",
  "blocks",
  "filter",
  "from",
  "to",
  "result",
  "method",
  "role",
  "scope",
] as const;

const ALLOWED = new Set<string>(ALLOWED_METADATA_KEYS);

export type AuditMetadata = Record<string, string | number | boolean>;

/**
 * Strip anything not on the allowlist. Exported so a unit test can prove the
 * filter, rather than trusting a comment.
 */
export function sanitizeMetadata(input?: AuditMetadata | null): {
  metadata: AuditMetadata | null;
  dropped: string[];
} {
  if (!input) return { metadata: null, dropped: [] };
  const metadata: AuditMetadata = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED.has(key)) {
      dropped.push(key);
      continue;
    }
    if (typeof value === "string") {
      metadata[key] = value.length > 120 ? `${value.slice(0, 117)}...` : value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      metadata[key] = value;
    } else {
      dropped.push(key);
    }
  }
  return { metadata: Object.keys(metadata).length ? metadata : null, dropped };
}


/* ------------------------------------------------------------------ filters */

export type AuditFilter = "all" | "views" | "edits" | "exports" | "sends";

const FILTER_ACTIONS: Record<AuditFilter, AuditAction[] | null> = {
  all: null,
  views: ["viewed"],
  edits: ["edited", "published", "signed", "deleted"],
  exports: ["exported"],
  sends: ["sent", "reminded"],
};

export function filterActions(filter: AuditFilter): AuditAction[] | null {
  return FILTER_ACTIONS[filter];
}


/* ------------------------------------------------------------------- export */

const CSV_HEADER = [
  "timestamp_utc",
  "action",
  "actor_type",
  "actor",
  "actor_id",
  "target_type",
  "target_id",
  "target_label",
  "ip",
  "metadata",
];

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The audit CSV. The caller appends the `exported` event — see lib/exports.ts. */
export function auditCsv(rows: AuditEvent[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.createdAt.toISOString(),
        r.action,
        r.actorType,
        r.actorLabel,
        r.actorId ?? "",
        r.targetType,
        r.targetId ?? "",
        r.targetLabel,
        r.ip ?? "",
        r.metadata ? JSON.stringify(r.metadata) : "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

/* ------------------------------------------------------------------ display */

const VERB: Record<AuditAction, string> = {
  viewed: "VIEWED",
  edited: "EDITED",
  exported: "EXPORTED",
  sent: "SENT",
  signed: "SIGNED",
  deleted: "DELETED",
  login: "LOGIN",
  published: "PUBLISHED",
  reminded: "REMINDED",
};

export function auditVerb(action: AuditAction): string {
  return VERB[action];
}
