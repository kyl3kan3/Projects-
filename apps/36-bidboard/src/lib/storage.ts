/**
 * Plan sets and bid attachments, behind one interface so the backend is a
 * deployment decision rather than a rewrite.
 *
 * ARCHITECTURE.md specifies Cloudflare R2 with signed PUT/GET — zero egress is
 * genuinely decisive when nine subs each download a 180 MB plan set. That driver
 * is implemented here and selected by `STORAGE_DRIVER=r2`. It is **not exercised
 * in this environment**: there are no R2 credentials here, so everything below the
 * `r2` branch is untested against a real bucket.
 *
 * The default driver keeps blobs in Postgres. It is the one that runs with no
 * cloud account — including on Vercel, whose filesystem is read-only — and it is
 * what the upload cap (`MAX_UPLOAD_BYTES`) is sized for.
 *
 * Storage keys are random and opaque, never derived from a filename, so no key is
 * guessable from another project's. Authorisation is still the row, never the key.
 */

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { fileBlobs, type StorageDriver } from "@/db/schema";
import { env } from "@/lib/env";

export interface StoredObject {
  data: Buffer;
  contentType: string;
  size: number;
}

export interface StorageAdapter {
  readonly driver: StorageDriver;
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  /**
   * A time-limited direct URL, when the driver can issue one. The db driver
   * cannot, so callers must fall back to streaming through a route handler — see
   * src/app/bid/[token]/plans/[fileId]/route.ts.
   */
  signedUrl?(key: string, ttlSeconds: number): Promise<string>;
}

const EXT_RE = /\.([a-zA-Z0-9]{1,8})$/;

export function newStorageKey(prefix: string, filename: string): string {
  const ext = EXT_RE.exec(filename)?.[1]?.toLowerCase() ?? "bin";
  return `${prefix}/${Date.now().toString(36)}-${randomBytes(8).toString("hex")}.${ext}`;
}

/** Plan sets and bid attachments only. A .exe in a bid package is not a bid. */
export const ALLOWED_EXTENSIONS = [
  "pdf",
  "dwg",
  "dxf",
  "zip",
  "png",
  "jpg",
  "jpeg",
  "xlsx",
  "csv",
  "docx",
  "rvt",
  "ifc",
] as const;

export function isAllowedFilename(filename: string): boolean {
  const ext = EXT_RE.exec(filename)?.[1]?.toLowerCase();
  return Boolean(ext && (ALLOWED_EXTENSIONS as readonly string[]).includes(ext));
}

/* ------------------------------------------------------------- db driver --- */

const dbAdapter: StorageAdapter = {
  driver: "db",
  async put(key, data, contentType) {
    const db = getDb();
    await db
      .insert(fileBlobs)
      .values({ key, data, size: data.byteLength, contentType })
      .onConflictDoUpdate({
        target: fileBlobs.key,
        set: { data, size: data.byteLength, contentType },
      });
  },
  async get(key) {
    const db = getDb();
    const [row] = await db.select().from(fileBlobs).where(eq(fileBlobs.key, key));
    if (!row) return null;
    return { data: Buffer.from(row.data), contentType: row.contentType, size: row.size };
  },
  async delete(key) {
    const db = getDb();
    await db.delete(fileBlobs).where(eq(fileBlobs.key, key));
  },
};

/* ------------------------------------------------------------- r2 driver --- */

type S3Client = import("@aws-sdk/client-s3").S3Client;
let _s3: S3Client | null = null;

async function s3(): Promise<S3Client> {
  if (!_s3) {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const { accountId, accessKeyId, secretAccessKey } = env.r2;
    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error("STORAGE_DRIVER=r2 needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY");
    }
    _s3 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return _s3;
}

const r2Adapter: StorageAdapter = {
  driver: "r2",
  async put(key, data, contentType) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await s3()).send(
      new PutObjectCommand({ Bucket: env.r2.bucket, Key: key, Body: data, ContentType: contentType }),
    );
  },
  async get(key) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const res = await (await s3()).send(
      new GetObjectCommand({ Bucket: env.r2.bucket, Key: key }),
    );
    if (!res.Body) return null;
    const data = Buffer.from(await res.Body.transformToByteArray());
    return {
      data,
      contentType: res.ContentType ?? "application/octet-stream",
      size: data.byteLength,
    };
  },
  async delete(key) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await (await s3()).send(new DeleteObjectCommand({ Bucket: env.r2.bucket, Key: key }));
  },
  async signedUrl(key, ttlSeconds) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    return getSignedUrl(
      await s3(),
      new GetObjectCommand({ Bucket: env.r2.bucket, Key: key }),
      { expiresIn: ttlSeconds },
    );
  },
};

const ADAPTERS: Record<StorageDriver, StorageAdapter> = { db: dbAdapter, r2: r2Adapter };

/** The configured driver, for writes. */
export function storage(): StorageAdapter {
  return ADAPTERS[env.storageDriver];
}

/**
 * The driver a specific row was written with, for reads. Rows keep their driver,
 * so flipping `STORAGE_DRIVER` never orphans what is already stored.
 */
export function storageFor(driver: StorageDriver): StorageAdapter {
  return ADAPTERS[driver] ?? dbAdapter;
}
