/**
 * Object storage for walkthrough audio, job photos, contractor logos and
 * proposal PDF snapshots.
 *
 * Two drivers behind one interface:
 *
 *  - **r2** — Cloudflare R2 over the S3 API, the shape ARCHITECTURE.md calls for:
 *    the phone uploads straight to R2 with a presigned PUT and the bytes never
 *    touch our servers. Selected automatically when the R2 credentials are set.
 *  - **local** — the filesystem, selected when they are not. The presigned URL
 *    points at our own `/api/uploads/blob` route and carries an HMAC of the key,
 *    content type, size cap and expiry, so the capture client, its retry logic and
 *    the proposal page all behave exactly as they do against R2. It is for local
 *    development and self-hosting; a serverless deploy has no writable disk, and
 *    `storageReady()` says so on the go-live checklist.
 *
 * The signature covers the whole grant (key + type + size cap + expiry), so a
 * leaked upload URL cannot be widened into "write any key, any size, forever" —
 * the failure mode of a naive `?key=` upload endpoint.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { env, has, isServerless } from "@/lib/env";

export type StorageDriver = "r2" | "local";

export function storageDriver(): StorageDriver {
  const r2 = env.r2;
  return r2.accountId && r2.accessKeyId && r2.secretAccessKey ? "r2" : "local";
}

export function storageReady(): { ready: boolean; driver: StorageDriver; reason?: string } {
  const driver = storageDriver();
  if (driver === "r2") return { ready: true, driver };
  if (isServerless()) {
    return {
      ready: false,
      driver,
      reason:
        "R2 is not configured, and the filesystem driver cannot be used on a serverless host — photos and audio would be lost between requests.",
    };
  }
  return { ready: true, driver, reason: "Using the local filesystem driver (development only)." };
}

/* ----------------------------------------------------------------- keys --- */

const EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

export function extensionFor(contentType: string): string {
  return EXT[contentType.toLowerCase().split(";")[0].trim()] ?? "bin";
}

export function isAllowedMediaType(kind: "audio" | "photo", contentType: string): boolean {
  const base = contentType.toLowerCase().split(";")[0].trim();
  return kind === "audio" ? base.startsWith("audio/") : base.startsWith("image/");
}

export function mediaKey(args: {
  organizationId: string;
  walkthroughId: string;
  kind: "audio" | "photo";
  sequence: number;
  contentType: string;
}): string {
  return `org/${args.organizationId}/walkthrough/${args.walkthroughId}/${args.kind}-${args.sequence}.${extensionFor(args.contentType)}`;
}

export function logoKey(organizationId: string, contentType: string): string {
  return `org/${organizationId}/brand/logo.${extensionFor(contentType)}`;
}

export function pdfKey(organizationId: string, proposalId: string): string {
  return `org/${organizationId}/proposal/${proposalId}.pdf`;
}

/* ------------------------------------------------------------ signatures --- */

export interface Grant {
  key: string;
  contentType: string;
  maxBytes: number;
  expiresAt: number;
}

function grantSignature(grant: Grant): string {
  return createHmac("sha256", env.authSecret)
    .update(`${grant.key}\n${grant.contentType}\n${grant.maxBytes}\n${grant.expiresAt}`)
    .digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export type GrantCheck = { ok: true; grant: Grant } | { ok: false; reason: "expired" | "invalid" };

export function verifyGrant(params: URLSearchParams): GrantCheck {
  const key = params.get("key") ?? "";
  const contentType = params.get("type") ?? "";
  const maxBytes = Number(params.get("max") ?? 0);
  const expiresAt = Number(params.get("exp") ?? 0);
  const signature = params.get("sig") ?? "";
  if (!key || !signature || !Number.isFinite(expiresAt)) return { ok: false, reason: "invalid" };
  const grant: Grant = { key, contentType, maxBytes, expiresAt };
  let matches = false;
  try {
    matches = safeEqualHex(signature, grantSignature(grant));
  } catch {
    matches = false;
  }
  if (!matches) return { ok: false, reason: "invalid" };
  if (expiresAt < Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, grant };
}

function localGrantUrl(mode: "put" | "get", grant: Grant): string {
  const params = new URLSearchParams({
    key: grant.key,
    type: grant.contentType,
    max: String(grant.maxBytes),
    exp: String(grant.expiresAt),
    sig: grantSignature(grant),
  });
  return `${env.appUrl}/api/uploads/blob?mode=${mode}&${params.toString()}`;
}

/* ------------------------------------------------------------- R2 client --- */

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

/* ------------------------------------------------------------ operations --- */

export interface PresignedUpload {
  key: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
  driver: StorageDriver;
}

const UPLOAD_TTL_SECONDS = 15 * 60;

/** A time-limited, size-capped PUT for one object. */
export async function presignUpload(args: {
  key: string;
  contentType: string;
  maxBytes: number;
}): Promise<PresignedUpload> {
  const expiresAt = Date.now() + UPLOAD_TTL_SECONDS * 1000;
  const grant: Grant = {
    key: args.key,
    contentType: args.contentType,
    maxBytes: args.maxBytes,
    expiresAt,
  };

  if (storageDriver() === "r2") {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const url = await getSignedUrl(
      await s3(),
      new PutObjectCommand({
        Bucket: env.r2.bucket,
        Key: args.key,
        ContentType: args.contentType,
      }),
      { expiresIn: UPLOAD_TTL_SECONDS },
    );
    return {
      key: args.key,
      uploadUrl: url,
      method: "PUT",
      headers: { "Content-Type": args.contentType },
      expiresAt: new Date(expiresAt).toISOString(),
      driver: "r2",
    };
  }

  return {
    key: args.key,
    uploadUrl: localGrantUrl("put", grant),
    method: "PUT",
    headers: { "Content-Type": args.contentType },
    expiresAt: new Date(expiresAt).toISOString(),
    driver: "local",
  };
}

/** A time-limited GET, for proposal photos and PDF downloads. */
export async function signedReadUrl(key: string, ttlSeconds = 3600): Promise<string> {
  if (storageDriver() === "r2") {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    return getSignedUrl(await s3(), new GetObjectCommand({ Bucket: env.r2.bucket, Key: key }), {
      expiresIn: ttlSeconds,
    });
  }
  return localGrantUrl("get", {
    key,
    contentType: "",
    maxBytes: 0,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

function localPath(key: string): string {
  // Keys are generated by this module and never contain "..", but a storage
  // driver that can be told to write outside its root is not worth shipping.
  const safe = key
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
  return path.join(path.resolve(env.localMediaDir), safe);
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  if (storageDriver() === "r2") {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (
      await s3()
    ).send(
      new PutObjectCommand({
        Bucket: env.r2.bucket,
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

export async function getObject(key: string): Promise<Buffer | null> {
  if (storageDriver() === "r2") {
    try {
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      const result = await (await s3()).send(
        new GetObjectCommand({ Bucket: env.r2.bucket, Key: key }),
      );
      const bytes = await result.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }
  try {
    return await readFile(localPath(key));
  } catch {
    return null;
  }
}

export interface ObjectHead {
  sizeBytes: number;
  contentType?: string;
}

/** Confirm an object really landed, and how big it is. */
export async function headObject(key: string): Promise<ObjectHead | null> {
  if (storageDriver() === "r2") {
    try {
      const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
      const result = await (await s3()).send(
        new HeadObjectCommand({ Bucket: env.r2.bucket, Key: key }),
      );
      return { sizeBytes: Number(result.ContentLength ?? 0), contentType: result.ContentType };
    } catch {
      return null;
    }
  }
  try {
    const info = await stat(localPath(key));
    return { sizeBytes: info.size };
  } catch {
    return null;
  }
}

/** Write bytes through a verified local grant (the filesystem driver's PUT). */
export async function writeLocalGrant(grant: Grant, body: Buffer): Promise<void> {
  const file = localPath(grant.key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

export function r2Configured(): boolean {
  return has("R2_ACCOUNT_ID") && has("R2_ACCESS_KEY_ID") && has("R2_SECRET_ACCESS_KEY");
}
