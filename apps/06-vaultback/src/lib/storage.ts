/**
 * Snapshot storage.
 *
 * One S3-compatible driver covers AWS S3, Cloudflare R2, and anything else that
 * speaks the API, which is why `storage_targets` carries an optional endpoint
 * rather than a provider enum. Uploads go through `lib-storage`'s multipart
 * uploader so a stream of unknown length never has to be buffered or spooled.
 *
 * The `local` driver exists for development and self-hosting: the bytes are
 * still gzipped and still AES-256-GCM encrypted, only the transport differs. It
 * refuses to run on Vercel, where the filesystem is ephemeral and a "backup"
 * written to it would be a lie.
 */

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import type { StorageTarget } from "@/db/schema";
import { decryptCredential } from "@/lib/crypto";
import { env, has } from "@/lib/env";
import { isServerless } from "@/lib/runtime";

export class StorageError extends Error {}

export interface StorageCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface StorageDriver {
  kind: "s3" | "local";
  /** Human description for the UI: "r2://vaultback-backups/acme". */
  location: string;
  /**
   * Upload a stream of unknown length. The caller counts bytes with its own tap
   * upstream — a driver must never attach a `data` listener to the body, because
   * that puts the stream into flowing mode before the uploader is reading it.
   */
  put(key: string, body: Readable): Promise<void>;
  get(key: string): Promise<Readable>;
  remove(key: string): Promise<void>;
  /** Round-trip a probe object. This is what "credential validation" means. */
  verify(): Promise<void>;
}

/** Is a managed (VaultBack-operated) bucket configured in this environment? */
export function managedStorageConfigured(): boolean {
  const s3 = env.s3;
  return Boolean(s3.bucket && s3.accessKeyId && s3.secretAccessKey);
}

/**
 * Resolve the driver for a storage target row. Managed targets read their
 * credentials from the environment; BYO targets decrypt theirs.
 */
export function driverFor(target: StorageTarget): StorageDriver {
  if (target.kind === "managed") {
    if (!managedStorageConfigured()) {
      if (isServerless()) {
        throw new StorageError(
          "No managed bucket is configured. Set S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.",
        );
      }
      return localDriver(target);
    }
    const s3 = env.s3;
    return s3Driver({
      bucket: s3.bucket,
      region: s3.region,
      endpoint: s3.endpoint || null,
      prefix: target.prefix,
      credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey },
      label: s3.endpoint ? "r2" : "s3",
    });
  }

  if (!target.encryptedCredentials) {
    throw new StorageError(`Storage target "${target.name}" has no stored credentials`);
  }
  const credentials = JSON.parse(
    decryptCredential(target.encryptedCredentials, env.credentialsKey),
  ) as StorageCredentials;

  return s3Driver({
    bucket: target.bucket,
    region: target.region,
    endpoint: target.endpoint,
    prefix: target.prefix,
    credentials,
    label: target.kind === "byo_r2" ? "r2" : "s3",
  });
}

/** Driver for credentials that are not stored yet — the "verify then save" path. */
export function driverForNewTarget(input: {
  kind: "byo_s3" | "byo_r2";
  bucket: string;
  region: string;
  endpoint: string | null;
  prefix: string;
  credentials: StorageCredentials;
}): StorageDriver {
  return s3Driver({ ...input, label: input.kind === "byo_r2" ? "r2" : "s3" });
}

/* -------------------------------------------------------------- s3 driver --- */

function s3Driver(opts: {
  bucket: string;
  region: string;
  endpoint: string | null;
  prefix: string;
  credentials: StorageCredentials;
  label: string;
}): StorageDriver {
  const client = new S3Client({
    region: opts.region || "auto",
    endpoint: opts.endpoint || undefined,
    // R2 and most S3-compatible endpoints require path-style addressing.
    forcePathStyle: Boolean(opts.endpoint),
    credentials: opts.credentials,
  });
  const prefixed = (key: string) =>
    opts.prefix ? `${opts.prefix.replace(/\/+$/, "")}/${key}` : key;

  return {
    kind: "s3",
    location: `${opts.label}://${opts.bucket}${opts.prefix ? `/${opts.prefix}` : ""}`,

    async put(key, body) {
      await multipartUpload(client, opts.bucket, prefixed(key), body);
    },

    async get(key) {
      const res = await client.send(
        new GetObjectCommand({ Bucket: opts.bucket, Key: prefixed(key) }),
      );
      if (!res.Body) throw new StorageError(`Object ${key} has no body`);
      return res.Body as Readable;
    },

    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: opts.bucket, Key: prefixed(key) }));
    },

    async verify() {
      try {
        await client.send(new HeadBucketCommand({ Bucket: opts.bucket }));
      } catch (err) {
        throw new StorageError(
          `Cannot reach bucket "${opts.bucket}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      // Read access alone is useless to us — prove we can write and delete too,
      // or the first real backup discovers it at 4am.
      const probeKey = prefixed(`.vaultback-probe-${Date.now()}`);
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: opts.bucket,
            Key: probeKey,
            Body: "vaultback write probe",
          }),
        );
      } catch (err) {
        throw new StorageError(
          `The credentials can list "${opts.bucket}" but cannot write to it: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      try {
        await client.send(new DeleteObjectCommand({ Bucket: opts.bucket, Key: probeKey }));
      } catch {
        throw new StorageError(
          `The credentials can write to "${opts.bucket}" but cannot delete — retention pruning would fail.`,
        );
      }
    },
  };
}

/* ----------------------------------------------------------- local driver --- */

function localDriver(target: StorageTarget): StorageDriver {
  const root = path.resolve(env.localStorageDir, target.orgId);
  return {
    kind: "local",
    location: `file://${root}`,

    async put(key, body) {
      const file = path.join(root, key);
      await mkdir(path.dirname(file), { recursive: true });
      await pipeline(body, createWriteStream(file));
    },

    async get(key) {
      const file = path.join(root, key);
      try {
        await stat(file);
      } catch {
        throw new StorageError(`Snapshot object ${key} is missing from local storage`);
      }
      return createReadStream(file);
    },

    async remove(key) {
      await rm(path.join(root, key), { force: true });
    },

    async verify() {
      if (isServerless()) {
        throw new StorageError("Local storage is not usable on a serverless host");
      }
      await mkdir(root, { recursive: true });
      const probe = path.join(root, ".vaultback-probe");
      await writeFile(probe, "vaultback write probe");
      await readFile(probe);
      await unlink(probe);
    },
  };
}

/* ----------------------------------------------------------- multipart put --- */

/**
 * 8 MB parts: small enough that a modest worker holds a few in flight, large
 * enough that a 50 GB dump stays well under S3's 10,000-part ceiling
 * (8 MB x 10,000 = 80 GB).
 */
const PART_SIZE = 8 * 1024 * 1024;

/**
 * Stream a body of unknown length to S3.
 *
 * Written against the multipart primitives rather than `@aws-sdk/lib-storage`
 * because the ceremony is small and the control matters: the dump's length is not
 * known until it ends, parts are flushed as soon as they fill (so nothing but one
 * part is ever resident), and a failure aborts the upload instead of leaving
 * billable orphaned parts in the bucket.
 *
 * Small dumps take the single-PUT path — one request instead of three.
 */
async function multipartUpload(
  client: S3Client,
  bucket: string,
  key: string,
  body: Readable,
): Promise<void> {
  let pending: Buffer[] = [];
  let pendingBytes = 0;
  let uploadId: string | null = null;
  const parts: { ETag: string; PartNumber: number }[] = [];

  const flush = async (): Promise<void> => {
    const buffer = Buffer.concat(pending, pendingBytes);
    pending = [];
    pendingBytes = 0;
    if (!uploadId) {
      const created = await client.send(
        new CreateMultipartUploadCommand({ Bucket: bucket, Key: key }),
      );
      uploadId = created.UploadId ?? null;
      if (!uploadId) throw new StorageError("S3 did not return an upload id");
    }
    const partNumber = parts.length + 1;
    const res = await client.send(
      new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: buffer,
      }),
    );
    if (!res.ETag) throw new StorageError(`S3 did not return an ETag for part ${partNumber}`);
    parts.push({ ETag: res.ETag, PartNumber: partNumber });
  };

  try {
    for await (const chunk of body) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
      pending.push(buf);
      pendingBytes += buf.length;
      if (pendingBytes >= PART_SIZE) await flush();
    }

    if (!uploadId) {
      // The whole object fits in one request.
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: Buffer.concat(pending, pendingBytes),
        }),
      );
      return;
    }

    if (pendingBytes > 0) await flush();
    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      }),
    );
  } catch (err) {
    if (uploadId) {
      // Orphaned parts are billed until they are aborted or expire.
      await client
        .send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }))
        .catch(() => {});
    }
    throw err;
  }
}

/* -------------------------------------------------------------- key layout --- */

/**
 * Object key for a snapshot. Time-ordered under a per-database prefix so a
 * human with bucket access can find last Tuesday's dump without our help —
 * part of "you can leave whenever you like".
 */
export function objectKeyFor(args: {
  orgSlug: string;
  connectionName: string;
  takenAt: Date;
  snapshotId: string;
}): string {
  const iso = args.takenAt.toISOString().replace(/[:.]/g, "-");
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 48);
  return [
    safe(args.orgSlug),
    safe(args.connectionName),
    `${iso}-${args.snapshotId.slice(0, 8)}.sql.gz.vb1`,
  ].join("/");
}

/** Description of the default managed target, for the UI. */
export function managedTargetDescription(): string {
  if (managedStorageConfigured()) {
    const s3 = env.s3;
    return `${s3.endpoint ? "Cloudflare R2" : "AWS S3"} · ${s3.bucket}`;
  }
  if (has("VERCEL")) return "Not configured";
  return "Local disk (development)";
}
