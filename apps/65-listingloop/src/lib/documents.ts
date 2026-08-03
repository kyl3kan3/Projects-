/**
 * src/lib/documents.ts
 *
 * Document collection: named placeholders per checklist, versioned uploads, and
 * the completeness bar.
 *
 * Versioning is per (deal, label): the second "Signed disclosure" is version 2
 * and the first stays on the file. Nothing is ever overwritten — a coordinator
 * who needs to prove which disclosure the buyer actually received cannot have
 * that erased by a re-upload.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { deals, documents, tasks, type DocumentRow } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { getBytes, isAllowedUpload, putBytes, storageKey, MAX_UPLOAD_BYTES } from "@/lib/storage";

export interface UploadInput {
  dealId: string;
  taskId: string | null;
  label: string;
  filename: string;
  contentType: string;
  bytes: Buffer;
  /** "Rita Bell (coordinator)" or "Dana Okafor (buyer)". */
  uploadedBy: string;
}

export type UploadOutcome =
  | { ok: true; document: DocumentRow }
  | { ok: false; error: string };

export async function uploadDocument(input: UploadInput): Promise<UploadOutcome> {
  if (input.bytes.length === 0) return { ok: false, error: "That file is empty." };
  if (input.bytes.length > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "That file is over 15 MB. Send a smaller scan." };
  }
  if (!isAllowedUpload(input.contentType)) {
    return {
      ok: false,
      error: "That file type is not accepted. Send a PDF, an image, plain text or Word.",
    };
  }

  const db = getDb();
  const label = input.label.trim() || input.filename;

  /**
   * The next version for this label: the highest existing one plus one, never a
   * count — deleting a row must not let a later upload reuse a version number.
   *
   * Read as an ordered limit-1 rather than `max()` inside a raw `sql` fragment.
   * A bare `${documents.version}` in a select-list fragment renders unqualified,
   * which is correct here by luck and silently wrong the moment this query grows
   * a join. The unique index on (deal_id, label, version) makes this read cheap
   * and makes two racing uploads collide rather than both claiming v3.
   */
  const [current] = await db
    .select({ version: documents.version })
    .from(documents)
    .where(and(eq(documents.dealId, input.dealId), eq(documents.label, label)))
    .orderBy(desc(documents.version))
    .limit(1);
  const version = (current?.version ?? 0) + 1;

  const key = storageKey(input.dealId, input.filename);
  const [row] = await db
    .insert(documents)
    .values({
      dealId: input.dealId,
      taskId: input.taskId,
      label,
      r2Key: key,
      filename: input.filename.slice(0, 200),
      contentType: input.contentType,
      byteSize: input.bytes.length,
      version,
      uploadedBy: input.uploadedBy,
    })
    .returning();

  try {
    await putBytes({
      documentId: row.id,
      key,
      bytes: input.bytes,
      contentType: input.contentType,
    });
  } catch (err) {
    // The row is meaningless without the bytes, so it goes back out.
    await db.delete(documents).where(eq(documents.id, row.id));
    return {
      ok: false,
      error: err instanceof Error ? `Storing the file failed: ${err.message}` : "Storing the file failed.",
    };
  }

  // A document arriving moves the task off "waiting" — but never to done. The
  // coordinator confirms; a scan of the wrong page should not close a task.
  if (input.taskId) {
    await db
      .update(tasks)
      .set({ status: "waiting", updatedAt: new Date() })
      .where(and(eq(tasks.id, input.taskId), eq(tasks.dealId, input.dealId), eq(tasks.status, "todo")));
  }

  await logActivity({
    dealId: input.dealId,
    actor: input.uploadedBy,
    action: "document_uploaded",
    target: label,
    metadata: {
      detail: `${label} v${version} — ${input.filename}`,
      documentId: row.id,
      version,
    },
  });

  return { ok: true, document: row };
}

export async function documentForDownload(
  documentId: string,
  accountId: string,
): Promise<{ document: DocumentRow; bytes: Buffer } | null> {
  const db = getDb();
  const [row] = await db
    .select({ doc: documents })
    .from(documents)
    .innerJoin(deals, eq(deals.id, documents.dealId))
    .where(and(eq(documents.id, documentId), eq(deals.accountId, accountId)));
  if (!row) return null;
  const bytes = await getBytes(row.doc.id, row.doc.r2Key);
  if (!bytes) return null;
  return { document: row.doc, bytes };
}

/** Newest version per label — what the checklist and the portal show. */
export function latestByLabel(rows: readonly DocumentRow[]): DocumentRow[] {
  const best = new Map<string, DocumentRow>();
  for (const row of rows) {
    const existing = best.get(row.label);
    if (!existing || row.version > existing.version) best.set(row.label, row);
  }
  return [...best.values()].sort((a, b) => a.label.localeCompare(b.label));
}
