/**
 * src/lib/storage.ts
 *
 * Where certificate PDFs live.
 *
 * R2 (S3 API) when it is configured, and bytes in Postgres when it is not. The
 * fallback is not a shortcut — a certificate is legal evidence, and an app that
 * refuses the upload because an object store is unconfigured has failed at the one
 * job the product exists to do. Both paths are content-addressed by sha256 and
 * append-only: nothing is ever overwritten, and a replacement certificate is a new
 * key and a new row.
 */

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { certificateBlobs } from "@/db/schema";
import { env, r2Configured } from "@/lib/env";

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

/** `certificates/<org>/<vendor>/<sha>.pdf` — content-addressed, so re-uploading
 *  the identical file cannot produce a second object. */
export function certificateKey(orgId: string, vendorId: string, hash: string): string {
  return `certificates/${orgId}/${vendorId}/${hash}.pdf`;
}

export function binderKey(orgId: string, propertyId: string, at: Date): string {
  return `binders/${orgId}/${propertyId}/${at.toISOString().replace(/[:.]/g, "-")}.pdf`;
}

let _s3: import("@aws-sdk/client-s3").S3Client | null = null;

async function s3(): Promise<import("@aws-sdk/client-s3").S3Client> {
  if (!_s3) {
    const { S3Client } = await import("@aws-sdk/client-s3");
    _s3 = new S3Client({
      region: "auto",
      endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.r2AccessKeyId,
        secretAccessKey: env.r2SecretAccessKey,
      },
    });
  }
  return _s3;
}

export type StorageBackend = "r2" | "postgres";

export function storageBackend(): StorageBackend {
  return r2Configured() ? "r2" : "postgres";
}

/**
 * Store the PDF. `certificateId` is required for the Postgres backend, which keys
 * the blob to the certificate row.
 */
export async function putCertificate(opts: {
  key: string;
  bytes: Uint8Array;
  certificateId: string;
  contentType?: string;
}): Promise<StorageBackend> {
  const contentType = opts.contentType ?? "application/pdf";
  if (r2Configured()) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await s3();
    await client.send(
      new PutObjectCommand({
        Bucket: env.r2Bucket,
        Key: opts.key,
        Body: Buffer.from(opts.bytes),
        ContentType: contentType,
        // Immutability at the storage layer too: an existing object is never
        // replaced, only read.
        IfNoneMatch: "*",
      }),
    );
    return "r2";
  }

  const db = getDb();
  await db
    .insert(certificateBlobs)
    .values({
      certificateId: opts.certificateId,
      contentType,
      byteSize: opts.bytes.byteLength,
      bytes: Buffer.from(opts.bytes),
    })
    .onConflictDoNothing({ target: certificateBlobs.certificateId });
  return "postgres";
}

/** Read a stored certificate back. Null when the object is genuinely gone. */
export async function getCertificateBytes(opts: {
  key: string;
  certificateId: string;
}): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (r2Configured()) {
    try {
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      const client = await s3();
      const res = await client.send(
        new GetObjectCommand({ Bucket: env.r2Bucket, Key: opts.key }),
      );
      const body = res.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
      if (!body?.transformToByteArray) return null;
      return {
        bytes: Buffer.from(await body.transformToByteArray()),
        contentType: res.ContentType ?? "application/pdf",
      };
    } catch {
      return null;
    }
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(certificateBlobs)
    .where(eq(certificateBlobs.certificateId, opts.certificateId));
  if (!row) return null;
  return { bytes: Buffer.from(row.bytes), contentType: row.contentType };
}

/** Store a generated binder. Returns the key it can be read back from. */
export async function putBinder(key: string, bytes: Uint8Array): Promise<string> {
  if (r2Configured()) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await s3();
    await client.send(
      new PutObjectCommand({
        Bucket: env.r2Bucket,
        Key: key,
        Body: Buffer.from(bytes),
        ContentType: "application/pdf",
      }),
    );
  }
  // With no object store the binder is streamed to the browser and not retained:
  // it is derived from certificates that are all still on file, so it can be
  // regenerated at any time. The `binder_exports` row records that it happened.
  return key;
}
