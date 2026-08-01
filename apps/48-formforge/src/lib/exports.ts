/**
 * src/lib/exports.ts
 *
 * Exports: the archival packet PDF and the EHR-lite CSV.
 *
 * Both are disclosures, so both are audited twice over — the decryption itself
 * goes through `readPacket`/`getPatientIdentities` (a `viewed` row) and the export
 * writes an `exported` row plus an `exports` ledger entry. That is what makes
 * DESIGN.md's audit screen behaviour honest: pull an export and the newest row on
 * the ledger is your own export.
 */

import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import {
  exportRecords,
  intakes,
  type ExportKind,
  type Practice,
  type User,
} from "@/db/schema";
import {
  blockFields,
  blockHeading,
  csvColumns,
  safeConfig,
  screenerAnswers,
  screenerInstrument,
} from "@/lib/blocks";
import { getIntake, listIntakes, readPacket, type ResolvedIntake } from "@/lib/intakes";
import { getPatientIdentities, getPatientIdentity } from "@/lib/patients";
import { appendAuditEvent } from "@/lib/audit";
import { actorFor } from "@/lib/auth";
import { renderPacketPdf, type PacketDocument, type PacketSection } from "@/lib/pdf";
import { SCREENERS, scoreLine, scoreScreener, severityLabel } from "@/lib/screeners";
import { evidenceSummary } from "@/lib/signature";
import { uploadSummaries } from "@/lib/uploads";
import { bytesLabel } from "@/lib/format";

export class ExportError extends Error {}

/* --------------------------------------------------------------------- PDF */

/** Turn a resolved intake into the pure document the renderer consumes. */
export async function buildPacketDocument(
  resolved: ResolvedIntake,
  user: User,
  ip: string | null,
): Promise<PacketDocument> {
  const actor = actorFor(user, ip);
  const packet = await readPacket(resolved, actor);
  const identity = await getPatientIdentity(resolved.practice, resolved.intake.patientId, actor);
  const files = await uploadSummaries(resolved.practice, resolved.intake.id, actor);

  const sections: PacketSection[] = [];
  for (const block of resolved.version.blocks) {
    if (block.kind === "consent" || block.kind === "signature") continue;

    if (block.kind === "screener") {
      const instrument = screenerInstrument(block);
      if (!instrument) continue;
      const def = SCREENERS[instrument];
      const raw = screenerAnswers(block, packet.answers);
      const result = scoreScreener(instrument, raw);
      sections.push({
        heading: def.name,
        answers: [],
        screener: {
          name: def.name,
          prompt: def.prompt,
          scoreLine: `${scoreLine(result)}  (${result.answered}/${result.items} answered)`,
          flagged: result.flagged,
          attribution: def.attribution,
          items: def.items.map((item, i) => {
            const value = raw[i];
            const option = def.options.find((o) => String(o.value) === value);
            return { label: item, answer: option ? `${option.value} — ${option.label}` : "not answered" };
          }),
        },
      });
      continue;
    }

    const answers = blockFields(block).map((field) => ({
      label: field.label,
      value: packet.answers[field.name] ?? "",
    }));
    sections.push({
      heading: blockHeading(block),
      answers,
      files: files
        .filter((f) => f.blockKey === block.key)
        .map((f) => ({ filename: f.filename, sizeLabel: bytesLabel(f.byteSize) })),
    });
  }

  const signatures = packet.signatures.map((entry) => {
    const summary = evidenceSummary(entry.record, entry.signedName);
    const heading =
      safeConfig("signature", resolved.version.blocks.find((b) => b.key === entry.record.blockKey)?.config ?? {})
        ?.heading ?? "Signature";
    return {
      heading,
      signedName: entry.signedName,
      method: entry.record.kind,
      payload: entry.payload,
      consentText: entry.record.signedText,
      evidenceLines: summary.lines,
      monoLine: summary.monoLine,
      verified: summary.verified,
    };
  });

  return {
    practiceName: resolved.practice.name,
    formTitle: resolved.version.title,
    formVersion: resolved.version.version,
    patientName: identity?.fullName ?? "Unknown patient",
    patientDob: identity?.dob ?? null,
    sentAtIso: resolved.intake.sentAt.toISOString(),
    completedAtIso: resolved.intake.completedAt?.toISOString() ?? null,
    status: resolved.intake.status,
    sections,
    signatures,
    generatedAtIso: new Date().toISOString(),
    generatedBy: `${user.name} <${user.email}>`,
  };
}

export interface ExportArtifact {
  filename: string;
  contentType: string;
  bytes: Buffer;
}

/** Render, record, return. The recording is the part that must not be skipped. */
export async function exportPacketPdf(
  practice: Practice,
  user: User,
  intakeId: string,
  ip: string | null,
): Promise<ExportArtifact> {
  const resolved = await getIntake(practice.id, intakeId);
  if (!resolved) throw new ExportError("That packet is not in this practice");

  const document = await buildPacketDocument(resolved, user, ip);
  const { bytes, pageCount } = await renderPacketPdf(document);
  const filename = `packet-${resolved.intake.id.slice(0, 8)}-v${resolved.version.version}.pdf`;

  await recordExport({
    practiceId: practice.id,
    userId: user.id,
    kind: "packet_pdf",
    targetIntakeId: resolved.intake.id,
    filename,
    byteSize: bytes.length,
    actorLabel: actorFor(user, ip).label,
    ip,
    metadata: { count: pageCount, version: resolved.version.version },
  });

  return { filename, contentType: "application/pdf", bytes };
}

/* --------------------------------------------------------------------- CSV */

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const FIXED_COLUMNS = [
  "intake_id",
  "status",
  "patient_first_name",
  "patient_last_name",
  "patient_dob",
  "patient_email",
  "patient_phone",
  "form_title",
  "form_version",
  "sent_at",
  "completed_at",
];

/**
 * The EHR-lite CSV: one row per intake, stable columns.
 *
 * Answers from *different* published versions of the same form can have different
 * columns. The header is the union across the rows in the export, in first-seen
 * order, so a version that added a question does not silently shift every column
 * to the right of it.
 */
export async function exportIntakesCsv(
  practice: Practice,
  user: User,
  opts: { from?: Date; to?: Date; assignedUserId?: string | null; ip?: string | null } = {},
): Promise<ExportArtifact> {
  const db = getDb();
  const actor = actorFor(user, opts.ip ?? null);

  const conditions = [eq(intakes.practiceId, practice.id)];
  if (opts.from) conditions.push(gte(intakes.sentAt, opts.from));
  if (opts.to) conditions.push(lte(intakes.sentAt, opts.to));
  if (opts.assignedUserId) conditions.push(eq(intakes.assignedUserId, opts.assignedUserId));

  const rows = await db.query.intakes.findMany({
    where: and(...conditions),
    with: { formVersion: true, submission: true },
    orderBy: [desc(intakes.sentAt)],
    limit: 2000,
  });

  const identities = await getPatientIdentities(
    practice,
    rows.map((r) => r.patientId),
    actor,
    "export",
  );

  const dynamic: string[] = [];
  const records: Record<string, string>[] = [];

  for (const row of rows) {
    if (!row.formVersion) continue;
    const resolved: ResolvedIntake = {
      intake: row,
      practice,
      version: row.formVersion,
      submission: row.submission ?? null,
    };
    // Read through the audited helper: an export is a disclosure of every packet
    // in it, and the ledger says so per packet.
    const packet = await readPacket(resolved, actor);
    const identity = identities.get(row.patientId);

    const record: Record<string, string> = {
      intake_id: row.id,
      status: row.status,
      patient_first_name: identity?.firstName ?? "",
      patient_last_name: identity?.lastName ?? "",
      patient_dob: identity?.dob ?? "",
      patient_email: identity?.email ?? "",
      patient_phone: identity?.phone ?? "",
      form_title: row.formVersion.title,
      form_version: String(row.formVersion.version),
      sent_at: row.sentAt.toISOString(),
      completed_at: row.completedAt?.toISOString() ?? "",
    };

    for (const block of row.formVersion.blocks) {
      for (const column of csvColumns(block)) {
        if (!dynamic.includes(column)) dynamic.push(column);
      }
      if (block.kind === "screener") {
        const instrument = screenerInstrument(block);
        if (!instrument) continue;
        const result = scoreScreener(instrument, screenerAnswers(block, packet.answers));
        record[`${block.key}.total`] = String(result.total);
        record[`${block.key}.severity`] = severityLabel(result.severity);
        record[`${block.key}.flagged`] = result.flagged ? "yes" : "no";
      } else if (block.kind === "signature") {
        const signature = packet.signatures.find((s) => s.record.blockKey === block.key);
        record[`${block.key}.signed_at`] = signature?.record.signedAt.toISOString() ?? "";
        record[`${block.key}.document_hash`] = signature?.record.documentHash ?? "";
      } else {
        for (const field of blockFields(block)) {
          record[field.name] = packet.answers[field.name] ?? "";
        }
      }
    }
    records.push(record);
  }

  const header = [...FIXED_COLUMNS, ...dynamic];
  const lines = [header.join(",")];
  for (const record of records) {
    lines.push(header.map((column) => csvCell(record[column] ?? "")).join(","));
  }
  const bytes = Buffer.from(`${lines.join("\n")}\n`, "utf8");
  const filename = `intakes-${new Date().toISOString().slice(0, 10)}.csv`;

  await recordExport({
    practiceId: practice.id,
    userId: user.id,
    kind: "intakes_csv",
    targetIntakeId: null,
    filename,
    byteSize: bytes.length,
    actorLabel: actor.label,
    ip: opts.ip ?? null,
    metadata: { rows: records.length, count: header.length },
  });

  return { filename, contentType: "text/csv; charset=utf-8", bytes };
}

/* ------------------------------------------------------------------ ledger */

export async function recordExport(input: {
  practiceId: string;
  userId: string;
  kind: ExportKind;
  targetIntakeId: string | null;
  filename: string;
  byteSize: number;
  actorLabel: string;
  ip: string | null;
  metadata?: Record<string, string | number | boolean>;
}): Promise<void> {
  const db = getDb();
  await db.insert(exportRecords).values({
    practiceId: input.practiceId,
    userId: input.userId,
    kind: input.kind,
    targetIntakeId: input.targetIntakeId,
    filename: input.filename,
    byteSize: input.byteSize,
  });
  await appendAuditEvent({
    practiceId: input.practiceId,
    actorType: "user",
    actorId: input.userId,
    actorLabel: input.actorLabel,
    action: "exported",
    targetType: input.targetIntakeId ? "intake" : "practice",
    targetId: input.targetIntakeId ?? input.practiceId,
    targetLabel: exportLabel(input.kind),
    ip: input.ip,
    metadata: { bytes: input.byteSize, kind: input.kind, ...(input.metadata ?? {}) },
  });
}

function exportLabel(kind: ExportKind): string {
  if (kind === "packet_pdf") return "packet PDF";
  if (kind === "intakes_csv") return "intakes CSV";
  return "audit log CSV";
}

export async function recentExports(practiceId: string, limit = 20) {
  const db = getDb();
  return db
    .select()
    .from(exportRecords)
    .where(eq(exportRecords.practiceId, practiceId))
    .orderBy(desc(exportRecords.createdAt))
    .limit(limit);
}

/** Packets a practice may export in one CSV, for the settings screen's copy. */
export async function exportableCount(practiceId: string): Promise<number> {
  const rows = await listIntakes(practiceId, { limit: 2000 });
  return rows.length;
}

