/**
 * src/lib/storage.ts
 *
 * Condition photos and PDFs behind an interface, with two adapters.
 *
 * ARCHITECTURE.md specifies Cloudflare R2 over the S3 API with presigned uploads
 * straight from the driver's phone. No R2 credentials exist in this environment,
 * so the adapter that actually runs here is `local`: photos and documents land
 * under LOCAL_STORAGE_DIR and are served by `/api/files/[...key]`, which enforces
 * the same account ownership a presigned URL would have encoded. The `s3` adapter
 * turns on automatically once R2_ACCESS_KEY_ID is present.
 *
 * Keys are `{accountId}/{scope}/{uuid}.{ext}` and the account id in the key is
 * what the download route authorises against — a key is never trusted to be
 * about its own bearer.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

export type FileScope = "photo" | "contract" | "signature" | "runsheet";

const SCOPES: FileScope[] = ["photo", "contract", "signature", "runsheet"];

/**
 * Only these content types are ever accepted from a client. SVG is deliberately
 * absent: it is a script container, and this app serves stored objects inline.
 */
export const ALLOWED_PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

export interface StoredObject {
  key: string;
  bytes: Buffer;
  contentType: string;
}

export interface PutResult {
  key: string;
  size: number;
  sha256: string;
}

export interface Storage {
  readonly driver: string;
  put(key: string, bytes: Buffer, contentType: string): Promise<PutResult>;
  get(key: string): Promise<StoredObject | null>;
}

export class StorageError extends Error {}

export function sha256(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function buildKey(accountId: string, scope: FileScope, ext: string): string {
  return `${accountId}/${scope}/${randomUUID()}.${ext}`;
}

export function accountOfKey(key: string): string | null {
  return key.split("/")[0] || null;
}

export function scopeOfKey(key: string): FileScope | null {
  const scope = key.split("/")[1] as FileScope | undefined;
  return scope && SCOPES.includes(scope) ? scope : null;
}

/** The content type a stored key should be served as. Never guessed from input. */
export function contentTypeOfKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "pdf") return "application/pdf";
  return "application/octet-stream";
}

/* ---------------------------------------------------------- local adapter --- */

class LocalStorage implements Storage {
  readonly driver = "local";

  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    // A key arrives inside a request; never let one climb out of the root.
    if (!full.startsWith(path.resolve(this.root) + path.sep)) {
      throw new StorageError("Invalid file key");
    }
    return full;
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<PutResult> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes);
    void contentType; // the extension in the key is the authority
    return { key, size: bytes.byteLength, sha256: sha256(bytes) };
  }

  async get(key: string): Promise<StoredObject | null> {
    const full = this.resolve(key);
    try {
      await stat(full);
    } catch {
      return null;
    }
    return { key, bytes: await readFile(full), contentType: contentTypeOfKey(key) };
  }
}

/* ------------------------------------------------------------- R2 adapter --- */

/**
 * R2 over the S3 API. Unexercised here — there are no R2 credentials in this
 * environment — so it is deliberately the thinnest possible wrapper: two calls,
 * no retry policy of its own. If it is wrong, it is wrong in one visible place.
 */
class R2Storage implements Storage {
  readonly driver = "s3";

  constructor(
    private readonly bucket: string,
    private readonly client: import("@aws-sdk/client-s3").S3Client,
  ) {}

  async put(key: string, bytes: Buffer, contentType: string): Promise<PutResult> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentType: contentType }),
    );
    return { key, size: bytes.byteLength, sha256: sha256(bytes) };
  }

  async get(key: string): Promise<StoredObject | null> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    try {
      const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!out.Body) return null;
      return {
        key,
        bytes: Buffer.from(await out.Body.transformToByteArray()),
        contentType: out.ContentType ?? contentTypeOfKey(key),
      };
    } catch {
      return null;
    }
  }

  /**
   * A presigned PUT, so a driver's phone uploads straight to R2 instead of
   * through a function. Only reachable on the s3 driver; the local driver takes
   * the multipart POST at /api/uploads instead.
   */
  async presignPut(key: string, contentType: string): Promise<string> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: 600 },
    );
  }
}

let _storage: Storage | null = null;

export async function storage(): Promise<Storage> {
  if (_storage) return _storage;
  if (env.storageDriver === "s3") {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const r2 = env.r2;
    _storage = new R2Storage(
      r2.bucket,
      new S3Client({
        region: "auto",
        endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey },
      }),
    );
    return _storage;
  }
  if (env.storageDriver !== "local") {
    throw new StorageError(
      `STORAGE_DRIVER="${env.storageDriver}" has no adapter — use "local" or "s3".`,
    );
  }
  _storage = new LocalStorage(path.resolve(process.cwd(), env.localStorageDir));
  return _storage;
}

export async function putFile(
  accountId: string,
  scope: FileScope,
  ext: string,
  bytes: Buffer,
): Promise<PutResult> {
  const key = buildKey(accountId, scope, ext);
  return (await storage()).put(key, bytes, contentTypeOfKey(key));
}

/**
 * A presigned upload URL when the s3 driver is active, or `null` when it is not.
 * `null` is the signal for the client to POST the file to /api/uploads instead —
 * the same key either way, so nothing downstream can tell the difference.
 */
export async function presignUpload(
  accountId: string,
  scope: FileScope,
  ext: string,
): Promise<{ key: string; url: string | null }> {
  const key = buildKey(accountId, scope, ext);
  const store = await storage();
  if (store instanceof R2Storage) {
    return { key, url: await store.presignPut(key, contentTypeOfKey(key)) };
  }
  return { key, url: null };
}

export function fileUrl(key: string): string {
  return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`;
}
