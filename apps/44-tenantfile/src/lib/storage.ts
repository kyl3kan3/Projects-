/**
 * Object storage behind an interface, with a local-filesystem adapter.
 *
 * ARCHITECTURE.md specifies Cloudflare R2 with presigned browser uploads. No R2
 * (or any S3) credentials exist in this environment, so the adapter that ships
 * working here is `local`: files land under LOCAL_STORAGE_DIR and are served by
 * `/api/files/[...key]`, which checks the same authorisation the browser would
 * have needed to get a presigned URL. Everything above this file speaks only to
 * the `Storage` interface, so swapping in an S3 adapter is one class and one env
 * var.
 *
 * Two things are enforced here rather than in the routes, because "the caller
 * will check" is how a photo endpoint becomes a free file host:
 *   - the content type must be on the scope's allow-list;
 *   - the byte length must be under the scope's ceiling.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

export type StorageScope = "listing" | "application" | "lease" | "request" | "export";

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
  remove(key: string): Promise<void>;
  /** The URL a browser should use to read this key. */
  urlFor(key: string): string;
}

interface ScopeRule {
  types: readonly string[];
  maxBytes: number;
  /** Public objects are readable without a token (a listing photo is a poster). */
  publicRead: boolean;
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const DOC_TYPES = ["application/pdf", ...IMAGE_TYPES] as const;

export const SCOPES: Record<StorageScope, ScopeRule> = {
  // Listing photos are the one public scope: the whole point is a shareable link.
  listing: { types: IMAGE_TYPES, maxBytes: 8 * 1024 * 1024, publicRead: true },
  // Pay stubs and IDs. Never public.
  application: { types: DOC_TYPES, maxBytes: 12 * 1024 * 1024, publicRead: false },
  lease: { types: ["application/pdf"], maxBytes: 20 * 1024 * 1024, publicRead: false },
  request: { types: IMAGE_TYPES, maxBytes: 8 * 1024 * 1024, publicRead: false },
  export: { types: ["application/pdf"], maxBytes: 40 * 1024 * 1024, publicRead: false },
};

export function scopeOf(key: string): StorageScope | null {
  const scope = key.split("/")[1];
  return scope && scope in SCOPES ? (scope as StorageScope) : null;
}

export function isPublicKey(key: string): boolean {
  const scope = scopeOf(key);
  return scope ? SCOPES[scope].publicRead : false;
}

export function landlordOfKey(key: string): string | null {
  return key.split("/")[0] || null;
}

export class StorageError extends Error {}

/** `{landlordId}/{scope}/{uuid}.{ext}` — the convention every adapter follows. */
export function buildKey(landlordId: string, scope: StorageScope, contentType: string): string {
  return `${landlordId}/${scope}/${randomUUID()}.${extensionFor(contentType)}`;
}

function extensionFor(contentType: string): string {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    default:
      return "bin";
  }
}

/** Reject anything the scope does not allow, before a byte is written. */
export function assertAllowed(scope: StorageScope, contentType: string, size: number): void {
  const rule = SCOPES[scope];
  if (!rule.types.includes(contentType)) {
    throw new StorageError(
      `${scope} uploads accept ${rule.types.map(friendlyType).join(", ")} — not ${friendlyType(contentType)}`,
    );
  }
  if (size <= 0) throw new StorageError("That file is empty");
  if (size > rule.maxBytes) {
    throw new StorageError(`That file is ${mb(size)} — the limit is ${mb(rule.maxBytes)}`);
  }
}

function friendlyType(contentType: string): string {
  return contentType.replace("image/", "").replace("application/", "").toUpperCase();
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/* ---------------------------------------------------------- local adapter --- */

class LocalStorage implements Storage {
  readonly driver = "local";

  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    // A key arrives in a request; never let one climb out of the root.
    if (!full.startsWith(path.resolve(this.root) + path.sep)) {
      throw new StorageError("Invalid storage key");
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
    let contentType = "application/octet-stream";
    try {
      contentType = (await readFile(`${full}.type`, "utf8")).trim();
    } catch {
      /* object written without a sidecar — fall back */
    }
    return { key, bytes, contentType };
  }

  async remove(key: string): Promise<void> {
    const full = this.resolve(key);
    await unlink(full).catch(() => {});
    await unlink(`${full}.type`).catch(() => {});
  }

  urlFor(key: string): string {
    return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
}

export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

let _storage: Storage | null = null;

export function storage(): Storage {
  if (!_storage) {
    if (env.storageDriver !== "local") {
      // Deliberate: an S3/R2 adapter belongs here, but shipping an untested one
      // that silently swallows a landlord's signed lease is worse than saying so.
      throw new StorageError(
        `STORAGE_DRIVER="${env.storageDriver}" has no adapter in this build — only "local" is implemented`,
      );
    }
    _storage = new LocalStorage(path.resolve(process.cwd(), env.localStorageDir));
  }
  return _storage;
}

/** Store an upload after checking it. Returns the key to persist on the row. */
export async function storeUpload(
  landlordId: string,
  scope: StorageScope,
  file: { bytes: Buffer; contentType: string },
): Promise<PutResult> {
  assertAllowed(scope, file.contentType, file.bytes.byteLength);
  const key = buildKey(landlordId, scope, file.contentType);
  return storage().put(key, file.bytes, file.contentType);
}

export function urlForKey(key: string): string {
  return storage().urlFor(key);
}
