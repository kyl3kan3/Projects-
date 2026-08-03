/**
 * Document storage behind an interface, with two adapters.
 *
 * ARCHITECTURE.md specifies Cloudflare R2 over the S3 API. No R2 credentials
 * exist in this environment, so the adapter that runs here is `local`: leases,
 * notices, statements and lien packets land under LOCAL_STORAGE_DIR and are served
 * by `/api/documents/[...key]`, which checks the same ownership the presigned URL
 * would have encoded. The `s3` adapter is selected automatically once R2 variables
 * are present.
 *
 * Everything above this file speaks only to the `Storage` interface. Keys are
 * `{ownerId}/{scope}/{uuid}.pdf`, and the owner id in the key is what the download
 * route authorises against — a key is never trusted to be about its own bearer.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

export type DocScope = "lease" | "notice" | "statement" | "packet";

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

export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function buildKey(ownerId: string, scope: DocScope): string {
  return `${ownerId}/${scope}/${randomUUID()}.pdf`;
}

export function ownerOfKey(key: string): string | null {
  return key.split("/")[0] || null;
}

export function scopeOfKey(key: string): DocScope | null {
  const scope = key.split("/")[1];
  return scope === "lease" || scope === "notice" || scope === "statement" || scope === "packet"
    ? scope
    : null;
}

/* ---------------------------------------------------------- local adapter --- */

class LocalStorage implements Storage {
  readonly driver = "local";

  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    // A key arrives in a request; never let one climb out of the root.
    if (!full.startsWith(path.resolve(this.root) + path.sep)) {
      throw new StorageError("Invalid document key");
    }
    return full;
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<PutResult> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes);
    await writeFile(`${full}.type`, contentType, "utf8");
    return { key, size: bytes.byteLength, sha256: sha256(bytes) };
  }

  async get(key: string): Promise<StoredObject | null> {
    const full = this.resolve(key);
    try {
      await stat(full);
    } catch {
      return null;
    }
    const bytes = await readFile(full);
    let contentType = "application/pdf";
    try {
      contentType = (await readFile(`${full}.type`, "utf8")).trim();
    } catch {
      /* written without a sidecar — the fallback is right for this app */
    }
    return { key, bytes, contentType };
  }
}

/* ------------------------------------------------------------- R2 adapter --- */

/**
 * R2 over the S3 API. Unexercised in this environment — there are no R2
 * credentials here — so it is deliberately the thinnest possible wrapper: two
 * calls, no retry policy of its own, no presigning. If it is wrong, it is wrong in
 * one visible place rather than spread through the app.
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
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }),
    );
    return { key, size: bytes.byteLength, sha256: sha256(bytes) };
  }

  async get(key: string): Promise<StoredObject | null> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    try {
      const out = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const body = out.Body;
      if (!body) return null;
      const bytes = Buffer.from(await body.transformToByteArray());
      return { key, bytes, contentType: out.ContentType ?? "application/pdf" };
    } catch {
      return null;
    }
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
      `STORAGE_DRIVER="${env.storageDriver}" has no adapter — use "local" or "s3"`,
    );
  }
  _storage = new LocalStorage(path.resolve(process.cwd(), env.localStorageDir));
  return _storage;
}

export async function putDocument(
  ownerId: string,
  scope: DocScope,
  bytes: Buffer,
): Promise<PutResult> {
  const key = buildKey(ownerId, scope);
  return (await storage()).put(key, bytes, "application/pdf");
}

export function documentUrl(key: string): string {
  return `/api/documents/${key.split("/").map(encodeURIComponent).join("/")}`;
}
