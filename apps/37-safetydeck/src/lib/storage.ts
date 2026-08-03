/**
 * Object storage for the big things: huddle photos, cert-card photos, and
 * generated PDFs. Signature strokes are not here — they are path data on the
 * sign-off row, because a signature without its record is meaningless and a
 * record without its signature is worthless.
 *
 * Two backends behind one interface:
 *
 *  - **R2** (S3 API) whenever all four R2_* vars are set. Production.
 *  - **Postgres `stored_objects`** otherwise. This is not a stub: it stores the
 *    same bytes and serves the same URLs, so photo upload, binder assembly and
 *    PDF download are all verifiable on a laptop with nothing but Postgres.
 *
 * Everything is served through `/api/objects/[key]`, which authorises the
 * request and then either streams the row or redirects to a short-lived signed
 * R2 URL. Nothing is ever public: these are worker signatures and injury photos.
 */

import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb } from "@/db";
import { storedObjects } from "@/db/schema";
import { env } from "@/lib/env";

export type StorageBackend = "r2" | "postgres";

export function storageBackend(): StorageBackend {
  const { accountId, accessKeyId, secretAccessKey, bucket } = env.r2;
  return accountId && accessKeyId && secretAccessKey && bucket ? "r2" : "postgres";
}

export function newObjectKey(companyId: string, kind: string, ext: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${companyId}/${kind}/${stamp}-${randomBytes(8).toString("hex")}.${ext}`;
}

interface S3Deps {
  client: import("@aws-sdk/client-s3").S3Client;
  bucket: string;
}

let _s3: S3Deps | null = null;

async function s3(): Promise<S3Deps> {
  if (_s3) return _s3;
  const { S3Client } = await import("@aws-sdk/client-s3");
  const { accountId, accessKeyId, secretAccessKey, bucket } = env.r2;
  _s3 = {
    bucket,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
  return _s3;
}

export async function putObject(
  key: string,
  bytes: Uint8Array,
  contentType: string,
  companyId: string | null,
): Promise<void> {
  if (storageBackend() === "r2") {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { client, bucket } = await s3();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }),
    );
    return;
  }
  const db = getDb();
  const buf = Buffer.from(bytes);
  await db
    .insert(storedObjects)
    .values({
      key,
      companyId,
      contentType,
      sizeBytes: buf.byteLength,
      bytes: buf,
    })
    .onConflictDoUpdate({
      target: storedObjects.key,
      set: { bytes: buf, contentType, sizeBytes: buf.byteLength },
    });
}

export interface StoredObject {
  bytes: Uint8Array;
  contentType: string;
  companyId: string | null;
}

export async function getObject(key: string): Promise<StoredObject | null> {
  if (storageBackend() === "r2") {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { client, bucket } = await s3();
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const bytes = await res.Body?.transformToByteArray();
      if (!bytes) return null;
      return {
        bytes,
        contentType: res.ContentType ?? "application/octet-stream",
        // R2 keys are prefixed with the company id; that prefix is the tenant.
        companyId: key.split("/")[0] ?? null,
      };
    } catch {
      return null;
    }
  }
  const db = getDb();
  const [row] = await db.select().from(storedObjects).where(eq(storedObjects.key, key));
  if (!row) return null;
  return {
    bytes: new Uint8Array(row.bytes),
    contentType: row.contentType,
    companyId: row.companyId,
  };
}

/**
 * A short-lived URL for a stored object. On R2 this is a presigned GET; on the
 * Postgres backend there is nothing to presign, so the caller keeps using the
 * authorised app route.
 */
export async function signedGetUrl(key: string, ttlSeconds = 300): Promise<string | null> {
  if (storageBackend() !== "r2") return null;
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const { client, bucket } = await s3();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: ttlSeconds,
  });
}

/** The in-app URL for any stored object. Authorisation happens in the route. */
export function objectUrl(key: string): string {
  return `/api/objects/${key.split("/").map(encodeURIComponent).join("/")}`;
}
