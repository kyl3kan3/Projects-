/**
 * src/lib/storage.ts
 *
 * Documents live in object storage; the database holds keys and metadata.
 *
 * Two drivers behind one interface:
 *
 *  - **r2** — Cloudflare R2 over the S3 API, with presigned PUTs so a phone in
 *    a truck uploads a 6MB BOL photo straight to storage and never through a
 *    serverless function. Selected when the four R2 variables are set.
 *  - **local** — the same contract backed by a directory on disk, with the
 *    upload URL signed by the same HMAC scheme. This exists so the product is
 *    runnable and testable with no cloud account, and it is development-only:
 *    a serverless filesystem is read-only and the driver says so if it finds
 *    itself on one.
 *
 * The presigned-upload shape is identical either way, so the client component
 * that drives the camera has no idea which one it is talking to.
 */

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { env, features } from "@/lib/env";

export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
export const MAX_PDF_BYTES = 25 * 1024 * 1024;

/**
 * JPEG, PNG and PDF only — deliberately not WebP. Every uploaded page has to be
 * embeddable in the invoice packet, and pdf-lib can embed JPEG and PNG but not
 * WebP. Accepting a format that cannot reach the packet would mean a POD that
 * looks filed and then blocks the send.
 */
export const ALLOWED_CONTENT_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

export function isAllowedContentType(value: string): value is AllowedContentType {
  return (ALLOWED_CONTENT_TYPES as readonly string[]).includes(value);
}

export function maxBytesFor(contentType: string): number {
  return contentType === "application/pdf" ? MAX_PDF_BYTES : MAX_PHOTO_BYTES;
}

export interface PresignedUpload {
  key: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  /** Seconds until the URL stops working. */
  expiresIn: number;
  driver: "r2" | "local";
}

export function storageDriver(): "r2" | "local" {
  return features.r2 ? "r2" : "local";
}

/** {carrierId}/{loadId | "misc"}/{uuid}-{safe filename} */
export function objectKey(carrierId: string, loadId: string | null, filename: string): string {
  const safe = filename.replace(/[^A-Za-z0-9._-]+/g, "-").slice(-80) || "file";
  return `${carrierId}/${loadId ?? "misc"}/${randomUUID()}-${safe}`;
}

const UPLOAD_TTL_SECONDS = 900;

export async function presignUpload(opts: {
  key: string;
  contentType: string;
  sizeBytes: number;
}): Promise<PresignedUpload> {
  if (storageDriver() === "r2") return presignR2(opts);
  return {
    key: opts.key,
    uploadUrl: `/api/blobs/${encodeKey(opts.key)}?token=${signKey(opts.key, "put")}`,
    method: "PUT",
    headers: { "content-type": opts.contentType },
    expiresIn: UPLOAD_TTL_SECONDS,
    driver: "local",
  };
}

async function presignR2(opts: {
  key: string;
  contentType: string;
  sizeBytes: number;
}): Promise<PresignedUpload> {
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const client = r2Client(S3Client);
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: env.r2Bucket,
      Key: opts.key,
      ContentType: opts.contentType,
      ContentLength: opts.sizeBytes,
    }),
    { expiresIn: UPLOAD_TTL_SECONDS },
  );
  return {
    key: opts.key,
    uploadUrl: url,
    method: "PUT",
    headers: { "content-type": opts.contentType },
    expiresIn: UPLOAD_TTL_SECONDS,
    driver: "r2",
  };
}

type S3ClientCtor = typeof import("@aws-sdk/client-s3").S3Client;

function r2Client(S3Client: S3ClientCtor) {
  return new S3Client({
    region: "auto",
    endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.r2AccessKeyId,
      secretAccessKey: env.r2SecretAccessKey,
    },
  });
}

export async function putObject(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  if (storageDriver() === "r2") {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = r2Client(S3Client);
    await client.send(
      new PutObjectCommand({
        Bucket: env.r2Bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return;
  }
  const file = localPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

export async function getObject(key: string): Promise<Uint8Array | null> {
  if (storageDriver() === "r2") {
    const { S3Client, GetObjectCommand, NoSuchKey } = await import("@aws-sdk/client-s3");
    const client = r2Client(S3Client);
    try {
      const response = await client.send(
        new GetObjectCommand({ Bucket: env.r2Bucket, Key: key }),
      );
      const bytes = await response.Body?.transformToByteArray();
      return bytes ?? null;
    } catch (error) {
      if (error instanceof NoSuchKey) return null;
      throw error;
    }
  }
  try {
    const buffer = await readFile(localPath(key));
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

export async function objectSize(key: string): Promise<number | null> {
  if (storageDriver() === "r2") {
    const bytes = await getObject(key);
    return bytes?.byteLength ?? null;
  }
  try {
    const info = await stat(localPath(key));
    return info.size;
  } catch {
    return null;
  }
}

/**
 * The URL a browser reads a document from. Both drivers go through the app so
 * the session check happens on every read — a presigned GET link to a signed
 * BOL is a link anyone who sees it can keep.
 */
export function documentUrl(documentId: string): string {
  return `/api/documents/${documentId}`;
}

/* ------------------------------------------------- local driver plumbing --- */

function localPath(key: string): string {
  const root = path.resolve(process.cwd(), env.blobDir);
  const resolved = path.resolve(root, key);
  // Never let a key escape the blob root.
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Refusing an object key that escapes the blob directory");
  }
  return resolved;
}

export function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

export function signKey(key: string, action: "put" | "get"): string {
  return createHmac("sha256", env.sessionSecret).update(`${action}:${key}`).digest("hex").slice(0, 40);
}

export function verifyKeySignature(key: string, action: "put" | "get", token: string): boolean {
  const expected = Buffer.from(signKey(key, action));
  const given = Buffer.from(token);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

/**
 * True when the local driver cannot possibly work — a serverless filesystem is
 * read-only, so an app deployed to Vercel without R2 must say so out loud
 * rather than failing on the driver's first upload.
 */
export function storageMisconfigured(): string | null {
  if (features.r2) return null;
  if (process.env.VERCEL) {
    return "No R2 credentials are set and this deployment has no writable filesystem. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET before uploading documents.";
  }
  return null;
}
