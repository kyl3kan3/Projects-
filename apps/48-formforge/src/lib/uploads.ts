/**
 * src/lib/uploads.ts
 *
 * Encrypted file uploads (insurance cards, prior records).
 *
 * Files are encrypted **in the application** with the practice DEK before they go
 * anywhere, so the storage layer only ever holds an AES-256-GCM envelope. That is
 * why there are two storage backends and neither weakens the guarantee:
 *
 *  - **S3**, when a bucket and credentials are configured. Server-side encryption
 *    (SSE-KMS) is requested as well, which is belt-and-braces: it protects the
 *    envelope, not the file, because AWS never sees the file.
 *  - **Postgres**, otherwise — the envelope lands in `uploads.cipher_blob`. Small
 *    practices with a few insurance-card photos never need a bucket, and a
 *    developer without AWS credentials still gets the real code path.
 *
 * Downloading goes through `readPhiBytes`, so a staff member fetching a patient's
 * insurance card is a `viewed` row in the ledger like every other disclosure.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { uploads, type Practice, type Upload } from "@/db/schema";

import { env, s3Configured } from "@/lib/env";
import { practiceDek, readPhiBytes, sealBytesFor, sealFor, type PhiActor } from "@/lib/phi";
import { appendAuditEvent } from "@/lib/audit";
import { safeConfig } from "@/lib/blocks";
import type { FormBlock } from "@/db/schema";

export class UploadError extends Error {}

/* ------------------------------------------------------------- object store */

async function s3Client() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({ region: env.awsRegion });
}

async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await s3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: env.s3Bucket,
      Key: key,
      Body: body,
      // The bytes are already an envelope; SSE protects the envelope at rest too.
      ServerSideEncryption: "aws:kms",
      ContentType: contentType,
    }),
  );
}

async function getObject(key: string): Promise<Buffer> {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await s3Client();
  const result = await client.send(new GetObjectCommand({ Bucket: env.s3Bucket, Key: key }));
  const chunks: Buffer[] = [];
  for await (const chunk of result.Body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function deleteObject(key: string): Promise<void> {
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await s3Client();
  await client.send(new DeleteObjectCommand({ Bucket: env.s3Bucket, Key: key }));
}

/* -------------------------------------------------------------------- store */

export interface StoreUploadInput {
  practice: Pick<Practice, "id" | "dekWrapped">;
  intakeId: string;
  blockKey: string;
  block: FormBlock;
  filename: string;
  contentType: string;
  bytes: Buffer;
  ip: string | null;
}

/** Validate against the block's own limits, then encrypt, then store. */
export async function storeUpload(input: StoreUploadInput): Promise<Upload> {
  const cfg = safeConfig("upload", input.block.config);
  if (!cfg) throw new UploadError("That upload block is misconfigured");
  if (!input.bytes.length) throw new UploadError("That file is empty");
  if (input.bytes.length > cfg.maxBytes) {
    throw new UploadError(
      `That file is ${Math.round(input.bytes.length / 1024 / 1024)}MB. The limit is ${Math.round(cfg.maxBytes / 1024 / 1024)}MB.`,
    );
  }
  if (!cfg.accept.includes(input.contentType)) {
    throw new UploadError("That file type is not accepted here — use a JPEG, PNG or PDF.");
  }

  const envelope = sealBytesFor(input.practice, input.bytes);

  let storageKey: string | null = null;
  let cipherBlob: Buffer | null = envelope;
  if (s3Configured()) {
    storageKey = `uploads/${input.practice.id}/${input.intakeId}/${input.blockKey}-${Date.now()}.enc`;
    await putObject(storageKey, envelope, "application/octet-stream");
    cipherBlob = null;
  }

  const db = getDb();
  const [row] = await db
    .insert(uploads)
    .values({
      practiceId: input.practice.id,
      intakeId: input.intakeId,
      blockKey: input.blockKey,
      // Even the filename is PHI: "hendricks-psych-eval-2019.pdf" says plenty.
      filenameEnc: sealFor(input.practice, input.filename),
      contentType: input.contentType,
      byteSize: input.bytes.length,
      storageKey,
      cipherBlob,
    })
    .returning();

  await appendAuditEvent({
    practiceId: input.practice.id,
    actorType: "patient",
    actorId: input.intakeId,
    actorLabel: "patient (own packet)",
    action: "edited",
    targetType: "upload",
    targetId: row.id,
    targetLabel: "file uploaded",
    ip: input.ip,
    metadata: { bytes: input.bytes.length, kind: input.contentType },
  });

  return row;
}

/* --------------------------------------------------------------- read paths */

export interface DownloadedUpload {
  filename: string;
  contentType: string;
  bytes: Buffer;
}

export async function downloadUpload(
  practice: Pick<Practice, "id" | "dekWrapped">,
  uploadId: string,
  actor: PhiActor,
): Promise<DownloadedUpload | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(uploads)
    .where(and(eq(uploads.id, uploadId), eq(uploads.practiceId, practice.id)));
  if (!row) return null;

  const envelope = row.cipherBlob ?? (row.storageKey ? await getObject(row.storageKey) : null);
  if (!envelope) throw new UploadError("That file is no longer in storage");

  const bytes = await readPhiBytes(
    practice,
    actor,
    { targetType: "upload", targetId: row.id, targetLabel: "uploaded file" },
    envelope,
  );
  // The filename is decrypted from the same envelope family; the audit row above
  // already covers this disclosure, so no second event is written.
  const { open } = await import("@/lib/crypto");
  const dek = practiceDek(practice);
  return {
    filename: open(row.filenameEnc, dek).toString("utf8"),
    contentType: row.contentType,
    bytes,
  };
}

/** Filenames only, for the packet view. One audited batch read. */
export async function uploadSummaries(
  practice: Pick<Practice, "id" | "dekWrapped">,
  intakeId: string,
  actor: PhiActor,
): Promise<{ id: string; blockKey: string; filename: string; byteSize: number; contentType: string }[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(uploads)
    .where(and(eq(uploads.intakeId, intakeId), eq(uploads.practiceId, practice.id)));
  if (!rows.length) return [];
  const { open } = await import("@/lib/crypto");
  const dek = practiceDek(practice);
  await appendAuditEvent({
    practiceId: practice.id,
    actorType: actor.type,
    actorId: actor.id,
    actorLabel: actor.label,
    action: "viewed",
    targetType: "upload",
    targetId: intakeId,
    targetLabel: "file list",
    ip: actor.ip ?? null,
    metadata: { count: rows.length },
  });
  return rows.map((row) => ({
    id: row.id,
    blockKey: row.blockKey,
    filename: open(row.filenameEnc, dek).toString("utf8"),
    byteSize: row.byteSize,
    contentType: row.contentType,
  }));
}

/** Used by the retention sweep: remove the object as well as the row. */
export async function purgeUploadObjects(practiceId: string, intakeId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: uploads.id, storageKey: uploads.storageKey })
    .from(uploads)
    .where(and(eq(uploads.intakeId, intakeId), eq(uploads.practiceId, practiceId)));
  let removed = 0;
  for (const row of rows) {
    if (row.storageKey && s3Configured()) {
      try {
        await deleteObject(row.storageKey);
        removed += 1;
      } catch (err) {
        console.error("[uploads] could not delete object", row.id, err);
      }
    }
  }
  return removed;
}
