/**
 * Object storage for originals and close packages.
 *
 * Two drivers behind one interface:
 *
 *  - **R2** (`@aws-sdk/client-s3` against the Cloudflare S3 endpoint) when the four
 *    `R2_*` vars are set. This is the deployment configuration.
 *  - **Filesystem** otherwise, rooted at `LOCAL_STORAGE_DIR`. This is what a clone
 *    with no cloud account gets, and what the test suite uses. It is a real driver,
 *    not a stub: same keys, same content-addressing, same signed-URL discipline.
 *
 * Nothing is ever public. Both drivers hand out URLs on *this* app
 * (`/api/files?key=…&exp=…&sig=…`), HMAC-signed with a short expiry; the route
 * verifies the signature and then either redirects to a presigned R2 GET or streams
 * the local file. A leaked thumbnail URL therefore stops working, and a guessed key
 * never works at all — which is the behaviour financial records need.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

export interface StoredObject {
  key: string;
  contentHash: string;
  bytes: number;
}

export const MAX_DOCUMENT_BYTES = 12 * 1024 * 1024;

export const ALLOWED_DOCUMENT_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "text/plain",
]);

export function extensionFor(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    case "application/pdf":
      return "pdf";
    case "text/plain":
      return "txt";
    case "application/zip":
      return "zip";
    default:
      return "bin";
  }
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/* ---------------------------------------------------------------- drivers --- */

interface Driver {
  readonly kind: "r2" | "filesystem";
  put(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  exists(key: string): Promise<boolean>;
  /** A direct URL when the driver can issue one; null means "stream it yourself". */
  presignGet(key: string, ttlSeconds: number): Promise<string | null>;
  presignPut(key: string, mime: string, ttlSeconds: number): Promise<string | null>;
}

function r2Configured(): boolean {
  const r2 = env.r2;
  return Boolean(r2.accountId && r2.accessKeyId && r2.secretAccessKey && r2.bucket);
}

let _driver: Driver | null = null;

function driver(): Driver {
  if (!_driver) _driver = r2Configured() ? r2Driver() : filesystemDriver();
  return _driver;
}

export function storageKind(): "r2" | "filesystem" {
  return driver().kind;
}

function r2Driver(): Driver {
  const r2 = env.r2;
  // Imported lazily: `next build` should not pull the whole AWS SDK into a page's
  // module graph just because storage.ts was imported for its key helpers.
  const clientPromise = (async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    return new S3Client({
      region: "auto",
      endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey },
    });
  })();

  return {
    kind: "r2",
    async put(key, bytes, mime) {
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");
      const client = await clientPromise;
      await client.send(
        new PutObjectCommand({
          Bucket: r2.bucket,
          Key: key,
          Body: Buffer.from(bytes),
          ContentType: mime,
        }),
      );
    },
    async get(key) {
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      const client = await clientPromise;
      const res = await client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }));
      const body = await res.Body?.transformToByteArray();
      if (!body) throw new Error(`Object not found: ${key}`);
      return body;
    },
    async exists(key) {
      const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
      const client = await clientPromise;
      try {
        await client.send(new HeadObjectCommand({ Bucket: r2.bucket, Key: key }));
        return true;
      } catch {
        return false;
      }
    },
    async presignGet(key, ttlSeconds) {
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
      const client = await clientPromise;
      return getSignedUrl(client, new GetObjectCommand({ Bucket: r2.bucket, Key: key }), {
        expiresIn: ttlSeconds,
      });
    },
    async presignPut(key, mime, ttlSeconds) {
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");
      const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
      const client = await clientPromise;
      return getSignedUrl(
        client,
        new PutObjectCommand({ Bucket: r2.bucket, Key: key, ContentType: mime }),
        { expiresIn: ttlSeconds },
      );
    },
  };
}

function filesystemDriver(): Driver {
  const root = path.resolve(process.cwd(), env.localStorageDir);
  const resolve = (key: string) => {
    const full = path.resolve(root, key);
    // A key is app-generated, but treating it as trusted is how a path traversal
    // gets shipped.
    if (full !== root && !full.startsWith(root + path.sep)) {
      throw new Error("Refusing a storage key outside the storage root");
    }
    return full;
  };

  return {
    kind: "filesystem",
    async put(key, bytes) {
      const full = resolve(key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, Buffer.from(bytes));
    },
    async get(key) {
      return new Uint8Array(await readFile(resolve(key)));
    },
    async exists(key) {
      try {
        await stat(resolve(key));
        return true;
      } catch {
        return false;
      }
    },
    async presignGet() {
      return null;
    },
    async presignPut() {
      return null;
    },
  };
}

/* ------------------------------------------------------------------- keys --- */

export function documentKey(orgId: string, contentHash: string, mime: string): string {
  return `orgs/${orgId}/docs/${contentHash}.${extensionFor(mime)}`;
}

export function closePdfKey(orgId: string, period: string, version: number): string {
  return `orgs/${orgId}/close/${period}/v${version}/summary.pdf`;
}

export function closeZipKey(orgId: string, period: string, version: number): string {
  return `orgs/${orgId}/close/${period}/v${version}/ledgerlens-${period}.zip`;
}

export function uploadStagingKey(orgId: string, token: string, mime: string): string {
  return `orgs/${orgId}/incoming/${token}.${extensionFor(mime)}`;
}

/* ------------------------------------------------------------------- api --- */

export async function putDocument(
  orgId: string,
  bytes: Uint8Array,
  mime: string,
): Promise<StoredObject> {
  const contentHash = sha256(bytes);
  const key = documentKey(orgId, contentHash, mime);
  await driver().put(key, bytes, mime);
  return { key, contentHash, bytes: bytes.byteLength };
}

export async function putObject(key: string, bytes: Uint8Array, mime: string): Promise<void> {
  await driver().put(key, bytes, mime);
}

export async function getObject(key: string): Promise<Uint8Array> {
  return driver().get(key);
}

export async function objectExists(key: string): Promise<boolean> {
  return driver().exists(key);
}

/* ---------------------------------------------------------- signed links --- */

const DEFAULT_TTL_SECONDS = 600;

function signature(key: string, expiresAt: number, verb: "get" | "put"): string {
  return createHmac("sha256", env.shareTokenSecret)
    .update(`${verb}:${key}:${expiresAt}`)
    .digest("base64url");
}

export function verifySignature(
  key: string,
  expiresAt: number,
  verb: "get" | "put",
  provided: string,
): boolean {
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) return false;
  const expected = Buffer.from(signature(key, expiresAt, verb));
  const got = Buffer.from(provided);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

/**
 * A short-lived URL for one object. Always an app URL, whichever driver is active,
 * so the audit trail and the expiry behave the same in every environment.
 */
export function signedDownloadUrl(
  key: string,
  opts: { ttlSeconds?: number; filename?: string; baseUrl?: string } = {},
): string {
  const ttl = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const params = new URLSearchParams({ key, exp: String(exp), sig: signature(key, exp, "get") });
  if (opts.filename) params.set("as", opts.filename);
  return `${opts.baseUrl ?? env.appUrl}/api/files?${params.toString()}`;
}

export interface SignedUpload {
  /** Where the browser PUTs the bytes. */
  uploadUrl: string;
  /** Where the bytes land — echoed back to `/api/uploads/complete`. */
  key: string;
  /** True when the PUT goes straight to R2 and never touches the app server. */
  direct: boolean;
}

/**
 * A signed PUT for the camera flow.
 *
 * On R2 the browser uploads directly and the image never proxies through the app
 * server (ARCHITECTURE.md, flow 2). On the filesystem driver there is nowhere else
 * to send it, so the PUT lands on a signed app route that only accepts the exact key
 * and MIME type it signed.
 */
export async function createSignedUploadUrl(
  orgId: string,
  mime: string,
  opts: { ttlSeconds?: number; token: string } = { token: "" },
): Promise<SignedUpload> {
  if (!ALLOWED_DOCUMENT_MIME.has(mime)) {
    throw new Error(`Unsupported document type: ${mime}`);
  }
  const ttl = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const key = uploadStagingKey(orgId, opts.token, mime);
  const direct = await driver().presignPut(key, mime, ttl);
  if (direct) return { uploadUrl: direct, key, direct: true };

  const exp = Math.floor(Date.now() / 1000) + ttl;
  const params = new URLSearchParams({ key, exp: String(exp), sig: signature(key, exp, "put") });
  return { uploadUrl: `${env.appUrl}/api/uploads/put?${params.toString()}`, key, direct: false };
}

/** Test seam — resets the memoised driver after env changes. */
export function resetStorageDriver(): void {
  _driver = null;
}
