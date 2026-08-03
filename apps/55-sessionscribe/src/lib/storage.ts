/**
 * src/lib/storage.ts
 *
 * Where session audio lives.
 *
 * Two backends behind one interface:
 *
 *  - **r2** — Cloudflare R2 over the S3 API, when the four R2 vars are set. The
 *    browser PUTs straight to a signed URL, so the audio never transits our
 *    server; the object key is the only thing the app holds.
 *  - **inline** — the bytes in Postgres (`audio_artifacts.bytes`), used when R2
 *    is not configured. This is what a self-hosted install and the test suite
 *    get, and it is a real backend rather than a stub: the purge path deletes the
 *    column exactly as it deletes an R2 object, so retention is verifiable
 *    without a cloud account.
 *
 * Either way the row in `audio_artifacts` is the record of the artifact having
 * existed, and it survives the purge (stamped `purged_at`) so the audit trail
 * outlives the tape.
 */

import { randomUUID } from "node:crypto";
import { env, storageConfigured } from "@/lib/env";

export type StorageBackend = "r2" | "inline";

export function storageBackend(): StorageBackend {
  return storageConfigured() ? "r2" : "inline";
}

/** Object key for a session's audio. Opaque, and it carries no PHI. */
export function audioKey(sessionId: string, mime: string): string {
  const ext = mime.includes("wav")
    ? "wav"
    : mime.includes("mp4") || mime.includes("m4a")
      ? "m4a"
      : mime.includes("mpeg") || mime.includes("mp3")
        ? "mp3"
        : mime.includes("ogg")
          ? "ogg"
          : "webm";
  return `audio/${sessionId}/${randomUUID()}.${ext}`;
}

/* --------------------------------------------------------------- R2 client */

type S3Client = import("@aws-sdk/client-s3").S3Client;

let _s3: S3Client | null = null;

async function s3(): Promise<S3Client> {
  if (_s3) return _s3;
  const { S3Client } = await import("@aws-sdk/client-s3");
  const r2 = env.r2;
  _s3 = new S3Client({
    region: "auto",
    endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2.accessKeyId,
      secretAccessKey: r2.secretAccessKey,
    },
  });
  return _s3;
}

/**
 * A short-lived signed PUT the browser uploads to directly. Only meaningful on
 * the r2 backend; the inline backend uploads through our own route instead.
 */
export async function signedUploadUrl(
  key: string,
  mime: string,
  expiresInSeconds = 600,
): Promise<string> {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const client = await s3();
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: env.r2.bucket,
      Key: key,
      ContentType: mime,
      // R2 encrypts at rest by default; this makes the intent explicit and fails
      // loudly if a bucket policy ever disagrees.
      ServerSideEncryption: "AES256",
    }),
    { expiresIn: expiresInSeconds },
  );
}

/** Upload bytes we already hold (the inline-to-R2 path and the PDF exports). */
export async function putObject(
  key: string,
  body: Buffer,
  mime: string,
): Promise<void> {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await s3();
  await client.send(
    new PutObjectCommand({
      Bucket: env.r2.bucket,
      Key: key,
      Body: body,
      ContentType: mime,
      ServerSideEncryption: "AES256",
    }),
  );
}

export async function getObject(key: string): Promise<Buffer> {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await s3();
  const res = await client.send(
    new GetObjectCommand({ Bucket: env.r2.bucket, Key: key }),
  );
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error(`R2 object ${key} has no body`);
  return Buffer.from(bytes);
}

/** Idempotent: deleting an object that is already gone is a success. */
export async function deleteObject(key: string): Promise<void> {
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await s3();
  await client.send(
    new DeleteObjectCommand({ Bucket: env.r2.bucket, Key: key }),
  );
}
