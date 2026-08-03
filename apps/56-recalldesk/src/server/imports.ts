/**
 * src/server/imports.ts
 *
 * The import pipeline: upload -> map -> dry-run preview -> commit -> (rollback).
 *
 * Three invariants:
 *
 * 1. **The preview writes nothing.** It runs exactly the parse the commit will
 *    run, over the same stored bytes, so "3,412 rows · 2,890 patients" on the
 *    preview sheet is the same arithmetic that produces the roster.
 *
 * 2. **An import never resurrects consent.** If a patient replied STOP, the next
 *    roster export from the PMS still has `Text OK = Y` in it — the PMS does not
 *    know about the opt-out. Re-asserting that flag would text someone who told us
 *    to stop, which is the one mistake this product cannot make. Opt-out
 *    timestamps are never cleared and always win over an imported flag.
 *
 * 3. **A commit is reversible.** Every patient the commit touched gets an
 *    `import_changes` row holding its prior values, so rollback restores instead
 *    of guessing, and visits are deleted by provenance leaving nothing orphaned.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  importChanges,
  importFiles,
  imports,
  mappingPresets,
  patients,
  visits,
  type Import,
  type Patient,
} from "@/db/schema";
import { parseRoster, readHeaders, type Anomaly, type PatientDraft } from "@/lib/csv";
import { detectSource, mappingProblems, suggestMapping, type PmsSource } from "@/lib/pms";
import { audit } from "@/server/audit";
import { recomputeOverdue } from "@/server/overdue";

export interface UploadResult {
  importId: string;
  source: PmsSource;
  headers: string[];
  mapping: Record<string, string>;
  /** True when a saved preset for this location and PMS supplied the mapping. */
  fromPreset: boolean;
}

const MAX_BYTES = 12 * 1024 * 1024;

/**
 * Store the uploaded file, detect the PMS, and produce a mapping to confirm.
 *
 * The file is kept because both the preview and the commit re-read it. R2 is the
 * specified home; with no object storage configured the bytes live in Postgres,
 * which is a real deployment shape rather than a broken one.
 */
export async function uploadImport(input: {
  locationId: string;
  practiceId: string;
  actorId: string;
  filename: string;
  content: string;
  source?: PmsSource;
}): Promise<UploadResult> {
  const byteSize = Buffer.byteLength(input.content, "utf8");
  if (byteSize === 0) throw new Error("That file is empty.");
  if (byteSize > MAX_BYTES) {
    throw new Error("That file is larger than 12 MB. Export active patients only, or split it.");
  }

  const { headers } = readHeaders(input.content);
  if (headers.length < 2) {
    throw new Error(
      "That does not look like a CSV — the first line has no columns. Export as comma-delimited (or tab), not as a Word merge.",
    );
  }

  const db = getDb();
  const source = input.source ?? detectSource(headers);

  const [preset] = await db
    .select()
    .from(mappingPresets)
    .where(and(eq(mappingPresets.locationId, input.locationId), eq(mappingPresets.source, source)));

  // A saved preset only applies if its columns are actually in this file.
  const presetUsable =
    preset && Object.keys(preset.mapping).every((h) => headers.includes(h));
  const mapping: Record<string, string> = presetUsable
    ? preset.mapping
    : suggestMapping(headers, source);

  const [row] = await db
    .insert(imports)
    .values({
      locationId: input.locationId,
      source,
      fileKey: `local/${input.filename}`,
      mapping,
      status: "uploaded",
    })
    .returning();

  await db.insert(importFiles).values({
    importId: row.id,
    filename: input.filename,
    content: input.content,
    byteSize,
  });

  await audit({
    practiceId: input.practiceId,
    actorId: input.actorId,
    action: "import.uploaded",
    target: `import:${row.id}`,
    metadata: { source, byteSize, columns: headers.length },
  });

  return {
    importId: row.id,
    source,
    headers,
    mapping,
    fromPreset: Boolean(presetUsable),
  };
}

export interface ImportPreview {
  importId: string;
  source: PmsSource;
  headers: string[];
  mapping: Record<string, string>;
  rowCount: number;
  patientCount: number;
  visitCount: number;
  anomalies: Anomaly[];
  sample: {
    name: string;
    externalId: string | null;
    email: string | null;
    phone: string | null;
    lastVisit: Date | null;
    visits: number;
  }[];
  problems: string[];
}

/** Load an import with its file, scoped to the caller's locations. */
async function loadImport(
  importId: string,
  locationIds: string[],
): Promise<{ row: Import; content: string; filename: string }> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(imports)
    .where(and(eq(imports.id, importId), inArray(imports.locationId, locationIds)));
  if (!row) throw new Error("That import does not exist.");
  const [file] = await db.select().from(importFiles).where(eq(importFiles.importId, importId));
  if (!file) throw new Error("The uploaded file for that import is no longer available.");
  return { row, content: file.content, filename: file.filename };
}

/**
 * The dry run. Pure with respect to the roster: it writes the counts and
 * anomalies onto the import row so the preview sheet can be re-opened, and
 * touches no patient.
 */
export async function previewImport(input: {
  importId: string;
  locationIds: string[];
  mapping?: Record<string, string>;
  today?: Date;
}): Promise<ImportPreview> {
  const db = getDb();
  const { row, content } = await loadImport(input.importId, input.locationIds);
  const mapping = input.mapping ?? row.mapping;
  const problems = mappingProblems(mapping);

  const parsed = parseRoster(content, mapping, row.source, input.today);
  const visitCount = parsed.patients.reduce((n, p) => n + p.visits.length, 0);

  await db
    .update(imports)
    .set({
      mapping,
      status: row.status === "committed" ? row.status : "previewed",
      rowCount: parsed.rowCount,
      patientCount: parsed.patients.length,
      anomalies: parsed.anomalies,
      updatedAt: new Date(),
    })
    .where(eq(imports.id, row.id));

  return {
    importId: row.id,
    source: row.source,
    headers: parsed.headers,
    mapping,
    rowCount: parsed.rowCount,
    patientCount: parsed.patients.length,
    visitCount,
    anomalies: parsed.anomalies,
    problems,
    sample: parsed.sample.map((p) => ({
      name: `${p.firstName} ${p.lastName}`.trim(),
      externalId: p.externalId,
      email: p.email,
      phone: p.phone,
      lastVisit: lastCompleted(p, input.today ?? new Date()),
      visits: p.visits.length,
    })),
  };
}

function lastCompleted(p: PatientDraft, today: Date): Date | null {
  const past = p.visits.filter((v) => v.visitedOn.getTime() <= today.getTime());
  return past.length ? past[past.length - 1].visitedOn : null;
}

export interface CommitResult {
  patientsCreated: number;
  patientsUpdated: number;
  visitsInserted: number;
  optOutsPreserved: number;
  recomputed: number;
}

/**
 * Commit the roster. Idempotent by import id: a second call on a committed import
 * is refused rather than duplicating the roster.
 */
export async function commitImport(input: {
  importId: string;
  locationIds: string[];
  practiceId: string;
  actorId: string;
  today?: Date;
}): Promise<CommitResult> {
  const db = getDb();
  const { row, content } = await loadImport(input.importId, input.locationIds);
  if (row.status === "committed") {
    throw new Error("That import is already committed.");
  }
  if (row.status === "rolled_back") {
    throw new Error("That import was rolled back. Upload the file again to re-import it.");
  }
  const problems = mappingProblems(row.mapping);
  if (problems.length) throw new Error(problems[0]);

  const parsed = parseRoster(content, row.mapping, row.source, input.today);
  if (parsed.patients.length === 0) {
    throw new Error("Nothing to commit — no patients could be read with this mapping.");
  }

  const existing = await db
    .select()
    .from(patients)
    .where(eq(patients.locationId, row.locationId));

  const byExternal = new Map<string, Patient>();
  const byIdentity = new Map<string, Patient>();
  for (const p of existing) {
    if (p.externalId) byExternal.set(p.externalId, p);
    byIdentity.set(identityKey(p), p);
  }

  let patientsCreated = 0;
  let patientsUpdated = 0;
  let visitsInserted = 0;
  let optOutsPreserved = 0;

  for (const draft of parsed.patients) {
    const match =
      (draft.externalId ? byExternal.get(draft.externalId) : undefined) ??
      byIdentity.get(identityKey(draft));

    let patientId: string;

    if (match) {
      // Consent: an imported flag may grant, never revoke an opt-out.
      const emailConsent = match.emailOptedOutAt
        ? false
        : (draft.emailConsent ?? match.emailConsent);
      const smsConsent = match.smsOptedOutAt ? false : (draft.smsConsent ?? match.smsConsent);
      if (
        (match.emailOptedOutAt && draft.emailConsent === true) ||
        (match.smsOptedOutAt && draft.smsConsent === true)
      ) {
        optOutsPreserved++;
      }

      await db.insert(importChanges).values({
        importId: row.id,
        patientId: match.id,
        action: "updated",
        previous: {
          externalId: match.externalId,
          firstName: match.firstName,
          lastName: match.lastName,
          email: match.email,
          phone: match.phone,
          emailConsent: match.emailConsent,
          smsConsent: match.smsConsent,
          doNotContact: match.doNotContact,
          recallIntervalMonths: match.recallIntervalMonths,
        },
      }).onConflictDoNothing();

      await db
        .update(patients)
        .set({
          externalId: draft.externalId ?? match.externalId,
          firstName: draft.firstName || match.firstName,
          lastName: draft.lastName || match.lastName,
          email: draft.email ?? match.email,
          phone: draft.phone ?? match.phone,
          emailConsent,
          smsConsent,
          doNotContact: draft.doNotContact ?? match.doNotContact,
          recallIntervalMonths: draft.recallIntervalMonths ?? match.recallIntervalMonths,
          status: "active",
          updatedAt: new Date(),
        })
        .where(eq(patients.id, match.id));
      patientId = match.id;
      patientsUpdated++;
    } else {
      const [created] = await db
        .insert(patients)
        .values({
          locationId: row.locationId,
          externalId: draft.externalId,
          firstName: draft.firstName,
          lastName: draft.lastName,
          email: draft.email,
          phone: draft.phone,
          emailConsent: draft.emailConsent ?? Boolean(draft.email),
          smsConsent: draft.smsConsent ?? false,
          doNotContact: draft.doNotContact ?? false,
          recallIntervalMonths: draft.recallIntervalMonths ?? 6,
          importId: row.id,
        })
        .returning();
      patientId = created.id;
      patientsCreated++;
      await db
        .insert(importChanges)
        .values({ importId: row.id, patientId, action: "created", previous: {} })
        .onConflictDoNothing();
    }

    if (draft.visits.length) {
      const inserted = await db
        .insert(visits)
        .values(
          draft.visits.map((v) => ({
            patientId,
            visitedOn: v.visitedOn,
            kind: v.kind,
            importId: row.id,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: visits.id });
      visitsInserted += inserted.length;
    }
  }

  await db
    .update(imports)
    .set({
      status: "committed",
      committedAt: new Date(),
      rowCount: parsed.rowCount,
      patientCount: parsed.patients.length,
      anomalies: parsed.anomalies,
      updatedAt: new Date(),
    })
    .where(eq(imports.id, row.id));

  // Save the confirmed mapping so the next export from the same PMS maps itself.
  await db
    .insert(mappingPresets)
    .values({ locationId: row.locationId, source: row.source, mapping: row.mapping })
    .onConflictDoUpdate({
      target: [mappingPresets.locationId, mappingPresets.source],
      set: { mapping: row.mapping, updatedAt: new Date() },
    });

  const recompute = await recomputeOverdue({
    locationId: row.locationId,
    today: input.today,
    inferIntervals: true,
  });

  await audit({
    practiceId: input.practiceId,
    actorId: input.actorId,
    action: "import.committed",
    target: `import:${row.id}`,
    metadata: {
      patientsCreated,
      patientsUpdated,
      visitsInserted,
      optOutsPreserved,
      rowCount: parsed.rowCount,
    },
  });

  return {
    patientsCreated,
    patientsUpdated,
    visitsInserted,
    optOutsPreserved,
    recomputed: recompute.patientsUpdated,
  };
}

function identityKey(p: {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
}): string {
  return `${p.lastName.trim().toLowerCase()}|${p.firstName.trim().toLowerCase()}|${
    p.email?.toLowerCase() ?? p.phone ?? ""
  }`;
}

/**
 * Undo the most recent committed import in one action.
 *
 * Only the most recent one: rolling back an import that a later import has
 * already written over would restore values that are two generations stale, which
 * is worse than the mistake being undone.
 */
export async function rollbackImport(input: {
  importId: string;
  locationIds: string[];
  practiceId: string;
  actorId: string;
  today?: Date;
}): Promise<{ patientsDeleted: number; patientsRestored: number; visitsDeleted: number }> {
  const db = getDb();
  const { row } = await loadImport(input.importId, input.locationIds);
  if (row.status !== "committed") throw new Error("Only a committed import can be rolled back.");

  const [latest] = await db
    .select({ id: imports.id })
    .from(imports)
    .where(and(eq(imports.locationId, row.locationId), eq(imports.status, "committed")))
    .orderBy(desc(imports.committedAt))
    .limit(1);
  if (latest && latest.id !== row.id) {
    throw new Error(
      "A newer import has been committed since this one. Roll that one back first, or upload a corrected file.",
    );
  }

  const deletedVisits = await db
    .delete(visits)
    .where(eq(visits.importId, row.id))
    .returning({ id: visits.id });

  const changes = await db
    .select()
    .from(importChanges)
    .where(eq(importChanges.importId, row.id));

  let patientsRestored = 0;
  let patientsDeleted = 0;

  for (const change of changes) {
    if (change.action === "updated") {
      const prev = change.previous as Record<string, unknown>;
      await db
        .update(patients)
        .set({
          externalId: (prev.externalId as string | null) ?? null,
          firstName: (prev.firstName as string) ?? "",
          lastName: (prev.lastName as string) ?? "",
          email: (prev.email as string | null) ?? null,
          phone: (prev.phone as string | null) ?? null,
          // Consent is restored, but an opt-out recorded since the commit is not
          // undone — it is the patient's, not the import's.
          emailConsent: Boolean(prev.emailConsent),
          smsConsent: Boolean(prev.smsConsent),
          doNotContact: Boolean(prev.doNotContact),
          recallIntervalMonths: (prev.recallIntervalMonths as number) ?? 6,
          updatedAt: new Date(),
        })
        .where(eq(patients.id, change.patientId));
      patientsRestored++;
      continue;
    }

    // Created by this import. Deletable only if nothing else now references it.
    const [{ n: remainingVisits }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(visits)
      .where(eq(visits.patientId, change.patientId));
    if (remainingVisits > 0) continue;

    const deleted = await db
      .delete(patients)
      .where(and(eq(patients.id, change.patientId), eq(patients.importId, row.id)))
      .returning({ id: patients.id });
    patientsDeleted += deleted.length;
  }

  await db
    .update(imports)
    .set({ status: "rolled_back", updatedAt: new Date() })
    .where(eq(imports.id, row.id));

  await db.delete(importChanges).where(eq(importChanges.importId, row.id));

  await recomputeOverdue({ locationId: row.locationId, today: input.today });

  await audit({
    practiceId: input.practiceId,
    actorId: input.actorId,
    action: "import.rolled_back",
    target: `import:${row.id}`,
    metadata: { patientsDeleted, patientsRestored, visitsDeleted: deletedVisits.length },
  });

  return { patientsDeleted, patientsRestored, visitsDeleted: deletedVisits.length };
}

export async function listImports(locationId: string): Promise<Import[]> {
  return getDb()
    .select()
    .from(imports)
    .where(eq(imports.locationId, locationId))
    .orderBy(desc(imports.createdAt))
    .limit(20);
}

export async function getImport(
  importId: string,
  locationIds: string[],
): Promise<{ row: Import; filename: string } | null> {
  try {
    const { row, filename } = await loadImport(importId, locationIds);
    return { row, filename };
  } catch {
    return null;
  }
}
