/**
 * src/lib/storage.ts
 *
 * Where an uploaded document's bytes go.
 *
 * With R2 configured, into the bucket under a key that carries the deal id, so a
 * closing packet can be assembled without a database round trip per file.
 * Without it, into `document_blobs` in Postgres. The second path is not a
 * downgrade for correctness: a party's signed disclosure has to land somewhere
 * durable in every deployment, and an upload that silently vanished is exactly
 * the failure this product exists to remove.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documentBlobs } from "@/db/schema";
import { env, r2Configured } from "@/lib/env";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export function isAllowedUpload(contentType: string): boolean {
  return ALLOWED_TYPES.has(contentType);
}

export function storageKey(dealId: string, filename: string): string {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
  return `deals/${dealId}/${randomUUID()}-${safe}`;
}

async function s3Client() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    region: "auto",
    endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.r2AccessKeyId,
      secretAccessKey: env.r2SecretAccessKey,
    },
  });
}

export async function putBytes(input: {
  documentId: string;
  key: string;
  bytes: Buffer;
  contentType: string;
}): Promise<void> {
  if (r2Configured()) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await s3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: env.r2Bucket,
        Key: input.key,
        Body: input.bytes,
        ContentType: input.contentType,
      }),
    );
    return;
  }
  await getDb()
    .insert(documentBlobs)
    .values({ documentId: input.documentId, bytes: input.bytes })
    .onConflictDoUpdate({ target: documentBlobs.documentId, set: { bytes: input.bytes } });
}

export async function getBytes(documentId: string, key: string): Promise<Buffer | null> {
  if (r2Configured()) {
    try {
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      const client = await s3Client();
      const result = await client.send(
        new GetObjectCommand({ Bucket: env.r2Bucket, Key: key }),
      );
      const bytes = await result.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }
  const [row] = await getDb()
    .select({ bytes: documentBlobs.bytes })
    .from(documentBlobs)
    .where(eq(documentBlobs.documentId, documentId));
  return row?.bytes ?? null;
}

export function storageMode(): "r2" | "postgres" {
  return r2Configured() ? "r2" : "postgres";
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
