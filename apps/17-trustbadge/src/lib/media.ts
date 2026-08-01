/**
 * Photo review storage.
 *
 * ARCHITECTURE.md puts photos in Cloudflare R2 (S3 API, zero egress) because
 * widget traffic serves media at storefront scale. That is what happens when the
 * bucket is configured.
 *
 * When it is not — a fresh clone, a local checkout, a preview deploy — photos are
 * kept in Postgres and served from `/api/media/<id>`. That is a development
 * convenience, not a production plan, and it says so on the settings screen. The
 * alternative was a photo-review feature that silently does nothing until someone
 * pastes six environment variables, which is worse.
 *
 * Either way the intrinsic dimensions are read from the header and stored, because
 * the widget cannot promise zero CLS without them.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reviewMedia, type ModerationStatus, type ReviewMediaRow } from "@/db/schema";
import { env, objectStorageConfigured } from "@/lib/env";
import { ValidationError } from "@/lib/errors";
import { ACCEPTED_PHOTO_TYPES, imageSize } from "@/lib/image-size";

/** 8MB: a phone photo, not a RAW file. Checked before anything is parsed. */
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export interface StoredPhoto {
  id: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
}

export function photoUrl(row: Pick<ReviewMediaRow, "id" | "storageKey">): string {
  if (row.storageKey && env.s3.publicUrl) return `${env.s3.publicUrl}/${row.storageKey}`;
  return `/api/media/${row.id}`;
}

/**
 * Validate and store an uploaded photo.
 *
 * The declared content type is checked *and* the header is parsed: a file called
 * `photo.png` whose bytes are a PHP script must not reach a bucket that a
 * storefront loads from.
 */
export async function storePhoto(args: {
  reviewId: string;
  bytes: Buffer;
  contentType: string;
  moderationStatus?: ModerationStatus;
}): Promise<StoredPhoto> {
  const { reviewId, bytes } = args;
  if (!bytes.byteLength) throw new ValidationError("That photo was empty");
  if (bytes.byteLength > MAX_PHOTO_BYTES) {
    throw new ValidationError("Photos need to be under 8MB");
  }

  const declared = args.contentType.split(";")[0].trim().toLowerCase();
  const expected = ACCEPTED_PHOTO_TYPES[declared];
  if (!expected) throw new ValidationError("Photos need to be a JPEG, PNG, or WebP");

  const info = imageSize(bytes);
  if (!info) throw new ValidationError("That file is not an image we can read");
  if (info.format !== expected) {
    throw new ValidationError(`That file is a ${info.format}, not a ${expected}`);
  }

  const db = getDb();
  const useObjectStorage = objectStorageConfigured();
  const key = useObjectStorage
    ? `reviews/${reviewId}/${Date.now()}.${info.format === "jpeg" ? "jpg" : info.format}`
    : null;

  if (key) await putObject(key, bytes, declared);

  const [row] = await db
    .insert(reviewMedia)
    .values({
      reviewId,
      kind: "photo",
      storageKey: key,
      data: key ? null : bytes,
      contentType: declared,
      width: info.width,
      height: info.height,
      bytes: bytes.byteLength,
      moderationStatus: args.moderationStatus ?? "pending",
    })
    .returning();

  return {
    id: row.id,
    url: photoUrl(row),
    width: row.width,
    height: row.height,
    bytes: row.bytes,
  };
}

/** Read a photo back out of Postgres, for the development-mode media route. */
export async function readStoredPhoto(
  id: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const db = getDb();
  const [row] = await db.select().from(reviewMedia).where(eq(reviewMedia.id, id));
  if (!row) return null;
  if (row.storageKey) return null; // it lives in the bucket; the URL points there
  if (!row.data) return null;
  return { bytes: Buffer.from(row.data), contentType: row.contentType };
}

/**
 * PUT one object. The S3 client is imported dynamically so an app with no bucket
 * configured never loads 3MB of AWS SDK into a serverless function.
 */
async function putObject(key: string, bytes: Buffer, contentType: string): Promise<void> {
  const s3 = env.s3;
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: s3.region || "auto",
    endpoint: s3.endpoint,
    credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey },
    forcePathStyle: true,
  });
  await client.send(
    new PutObjectCommand({
      Bucket: s3.bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
}
