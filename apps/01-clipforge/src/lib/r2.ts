/**
 * Cloudflare R2 (S3-compatible) storage helpers.
 *
 * Large media never proxies through our server — browsers PUT directly to R2
 * with a presigned URL. Rendered clips are served from a public bucket URL.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";
import { env } from "@/lib/env";

let _client: S3Client | null = null;

function client(): S3Client {
  if (!_client) {
    const r2 = env.r2;
    _client = new S3Client({
      region: "auto",
      endpoint: r2.endpoint,
      credentials: {
        accessKeyId: r2.accessKeyId,
        secretAccessKey: r2.secretAccessKey,
      },
    });
  }
  return _client;
}

/** Presigned PUT URL for a browser to upload a source file directly. */
export async function presignUpload(
  key: string,
  contentType: string,
  expiresIn = 3600,
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: env.r2.bucket,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(client(), cmd, { expiresIn });
}

/** Presigned GET URL for the worker to pull source media. */
export async function presignDownload(key: string, expiresIn = 3600): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: env.r2.bucket, Key: key });
  return getSignedUrl(client(), cmd, { expiresIn });
}

export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: env.r2.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const res = await client().send(
    new GetObjectCommand({ Bucket: env.r2.bucket, Key: key }),
  );
  const stream = res.Body as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

export async function deleteObject(key: string): Promise<void> {
  await client().send(
    new DeleteObjectCommand({ Bucket: env.r2.bucket, Key: key }),
  );
}

/** Public URL for a rendered asset (R2 public bucket or presigned fallback). */
export function publicUrl(key: string): string {
  const base = env.r2.publicBaseUrl;
  if (base) return `${base.replace(/\/$/, "")}/${key}`;
  // Fallback: caller should presign for private buckets.
  return key;
}

export async function signedAssetUrl(key: string): Promise<string> {
  if (env.r2.publicBaseUrl) return publicUrl(key);
  return presignDownload(key, 86400);
}
