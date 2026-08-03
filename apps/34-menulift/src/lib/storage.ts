/**
 * Dish-photo object storage.
 *
 * Production is Cloudflare R2 (ARCHITECTURE.md): S3-compatible, zero egress,
 * CDN in front. But a photo pipeline that only works with a cloud credential is
 * a photo pipeline nobody can test, so there are two drivers behind one
 * interface, chosen by whether the R2 variables are present:
 *
 *  - **r2** — `@aws-sdk/client-s3` against `https://<account>.r2.cloudflarestorage.com`.
 *  - **db** — rows in `photo_objects`, served by `/api/photos/[...key]`. Used in
 *    dev, preview and CI. Slower and unsuitable for real traffic; honest about it.
 *
 * The key scheme is the contract between app, pipeline and CDN:
 *   `{locationId}/{photoId}/original.jpg` · `.../enhanced.jpg`
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { photoObjects } from "@/db/schema";
import { env } from "@/lib/env";

export type StorageDriver = "r2" | "db";

export function storageDriver(): StorageDriver {
  const r2 = env.r2;
  return r2.accountId && r2.accessKeyId && r2.secretAccessKey && r2.bucket ? "r2" : "db";
}

/**
 * Server-side ceiling for an uploaded original.
 *
 * Matched to `serverActions.bodySizeLimit` in next.config.ts and to Vercel's own
 * 4.5MB request-body limit — a larger number here would just be a promise the
 * platform breaks. The browser downscales a phone photo to a few hundred KB
 * before it ever gets here.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"] as const;

export function extensionFor(contentType: string): string {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    default:
      return "jpg";
  }
}

export function originalKey(locationId: string, photoId: string, contentType: string): string {
  return `${locationId}/${photoId}/original.${extensionFor(contentType)}`;
}

export function enhancedKey(locationId: string, photoId: string): string {
  return `${locationId}/${photoId}/enhanced.jpg`;
}

/** Public URL for a stored key. */
export function photoUrl(key: string): string {
  if (storageDriver() === "r2" && env.r2.publicBase) return `${env.r2.publicBase}/${key}`;
  return `/api/photos/${key}`;
}

/* ------------------------------------------------------------------ the API */

export async function putObject(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  if (storageDriver() === "r2") return putR2(key, bytes, contentType);
  const db = getDb();
  const row = {
    key,
    contentType,
    bytes: Buffer.from(bytes).toString("base64"),
    byteSize: bytes.byteLength,
  };
  await db
    .insert(photoObjects)
    .values(row)
    .onConflictDoUpdate({ target: photoObjects.key, set: row });
}

export interface StoredObject {
  bytes: Buffer;
  contentType: string;
}

export async function getObject(key: string): Promise<StoredObject | null> {
  if (storageDriver() === "r2") return getR2(key);
  const db = getDb();
  const [row] = await db.select().from(photoObjects).where(eq(photoObjects.key, key));
  if (!row) return null;
  return { bytes: Buffer.from(row.bytes, "base64"), contentType: row.contentType };
}

export async function deleteObjects(keys: string[]): Promise<void> {
  if (!keys.length) return;
  if (storageDriver() === "r2") {
    for (const key of keys) await deleteR2(key);
    return;
  }
  const db = getDb();
  for (const key of keys) {
    await db.delete(photoObjects).where(eq(photoObjects.key, key));
  }
}

/* -------------------------------------------------------------- R2 driver */

type S3Client = import("@aws-sdk/client-s3").S3Client;
let _s3: S3Client | null = null;

async function s3(): Promise<S3Client> {
  if (_s3) return _s3;
  const { S3Client } = await import("@aws-sdk/client-s3");
  const r2 = env.r2;
  _s3 = new S3Client({
    region: "auto",
    endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey },
  });
  return _s3;
}

async function putR2(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await s3();
  await client.send(
    new PutObjectCommand({
      Bucket: env.r2.bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
}

async function getR2(key: string): Promise<StoredObject | null> {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await s3();
  try {
    const out = await client.send(new GetObjectCommand({ Bucket: env.r2.bucket, Key: key }));
    const body = out.Body;
    if (!body) return null;
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
    return {
      bytes: Buffer.concat(chunks),
      contentType: out.ContentType ?? "application/octet-stream",
    };
  } catch {
    return null;
  }
}

async function deleteR2(key: string): Promise<void> {
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await s3();
  await client.send(new DeleteObjectCommand({ Bucket: env.r2.bucket, Key: key }));
}
