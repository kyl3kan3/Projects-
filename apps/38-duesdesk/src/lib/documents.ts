/**
 * The document library: bylaws, CC&Rs, minutes, budgets.
 *
 * Versioning is by supersession, not by overwrite. Uploading "Bylaws v3" marks
 * v2 superseded and keeps it — a board that amended its bylaws in 2024 needs to
 * be able to show what the rules were in 2023.
 */

import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, type DocumentCategory, type DocumentRow } from "@/db/schema";
import { audit, type Actor } from "@/lib/audit";
import { MAX_UPLOAD_BYTES, objectKey, storage } from "@/lib/storage";

export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  bylaws: "Bylaws",
  ccrs: "CC&Rs",
  minutes: "Minutes",
  budget: "Budget",
  other: "Other",
};

export const CATEGORY_ORDER: DocumentCategory[] = ["bylaws", "ccrs", "minutes", "budget", "other"];

export interface UploadInput {
  associationId: string;
  title: string;
  category: DocumentCategory;
  versionLabel: string;
  memberVisible: boolean;
  filename: string;
  contentType: string;
  bytes: Buffer;
  /** When set, that row is marked superseded rather than replaced. */
  supersedesId?: string | null;
}

export async function uploadDocument(input: UploadInput, actor: Actor): Promise<DocumentRow> {
  if (!input.title.trim()) throw new Error("Give the document a title members will recognise");
  if (input.bytes.length === 0) throw new Error("That file is empty");
  if (input.bytes.length > MAX_UPLOAD_BYTES) {
    throw new Error(`Documents are limited to ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`);
  }

  const db = getDb();
  const key = objectKey(input.associationId, "documents", input.category, input.filename);
  await storage().put(key, input.bytes, input.contentType);

  const [row] = await db
    .insert(documents)
    .values({
      associationId: input.associationId,
      title: input.title.trim(),
      category: input.category,
      storageKey: key,
      contentType: input.contentType,
      sizeBytes: input.bytes.length,
      versionLabel: input.versionLabel.trim() || "v1",
      memberVisible: input.memberVisible,
      uploadedByUserId: actor.kind === "user" ? actor.id : null,
    })
    .returning();

  if (input.supersedesId) {
    await db
      .update(documents)
      .set({ supersededAt: new Date() })
      .where(
        and(eq(documents.id, input.supersedesId), eq(documents.associationId, input.associationId)),
      );
  }

  await audit(input.associationId, actor, "uploaded_document", `${row.title} (${row.versionLabel})`, {
    documentId: row.id,
    category: row.category,
    memberVisible: row.memberVisible,
    storage: storage().name,
  });
  return row;
}

export async function listDocuments(
  associationId: string,
  options: { memberVisibleOnly?: boolean; includeSuperseded?: boolean } = {},
): Promise<DocumentRow[]> {
  const db = getDb();
  const clauses = [eq(documents.associationId, associationId)];
  if (options.memberVisibleOnly) clauses.push(eq(documents.memberVisible, true));
  if (!options.includeSuperseded) clauses.push(isNull(documents.supersededAt));
  return db
    .select()
    .from(documents)
    .where(and(...clauses))
    .orderBy(documents.category, desc(documents.createdAt));
}

export async function setDocumentVisibility(
  associationId: string,
  documentId: string,
  memberVisible: boolean,
  actor: Actor,
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .update(documents)
    .set({ memberVisible })
    .where(and(eq(documents.id, documentId), eq(documents.associationId, associationId)))
    .returning();
  if (!row) throw new Error("No such document");
  await audit(
    associationId,
    actor,
    memberVisible ? "published_document" : "unpublished_document",
    row.title,
    { documentId },
  );
}

/** A signed URL valid for 10 minutes — long enough to download, short enough. */
export async function documentUrl(row: DocumentRow): Promise<string> {
  return storage().signedUrl(row.storageKey, 600);
}

export async function documentById(
  associationId: string,
  documentId: string,
): Promise<DocumentRow | null> {
  const [row] = await getDb()
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.associationId, associationId)));
  return row ?? null;
}
