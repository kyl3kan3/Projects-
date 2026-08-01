/**
 * Object storage behind one interface, with two adapters.
 *
 * ARCHITECTURE.md specifies Cloudflare R2 (S3 API) for issue photos and the
 * document library. R2 credentials are environment configuration, not a code
 * dependency, so this module picks an adapter at runtime:
 *
 *  - **r2** when R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY /
 *    R2_BUCKET are all set. Uses the S3 client and presigned GETs.
 *  - **local** otherwise: writes under LOCAL_STORAGE_DIR (default
 *    `.data/uploads`) and hands out short-lived signed URLs served by
 *    `/api/files/[...key]`. This is what development and this environment use —
 *    there are no R2 credentials here.
 *
 * Both adapters expose the same signed-URL contract, so nothing above this
 * module knows or cares which one is live. Uploads always go through our own
 * route rather than a browser-to-bucket PUT: it is the only shape that works
 * identically for both adapters, and it is where EXIF stripping belongs.
 */

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

export interface StoredObject {
  bytes: Buffer;
  contentType: string;
}

export interface StorageAdapter {
  readonly name: "r2" | "local";
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  remove(key: string): Promise<void>;
  /** A URL the browser may fetch for `ttlSeconds`. */
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
}

/* ----------------------------------------------------------------- keys --- */

/** `assoc/{id}/issues/{issueId}/{random}.jpg` — tenant-scoped, unguessable. */
export function objectKey(
  associationId: string,
  scope: "issues" | "documents",
  scopeId: string,
  filename: string,
): string {
  const ext = path.extname(filename).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 8);
  return `assoc/${associationId}/${scope}/${scopeId}/${randomBytes(8).toString("hex")}${ext}`;
}

/* ---------------------------------------------------- local file adapter --- */

function localRoot(): string {
  return path.resolve(process.cwd(), env.localStorageDir);
}

function safeLocalPath(key: string): string {
  const resolved = path.resolve(localRoot(), key);
  if (!resolved.startsWith(localRoot() + path.sep)) {
    throw new Error("Refusing a storage key that escapes the storage root");
  }
  return resolved;
}

const CONTENT_TYPE_SIDECAR = ".content-type";

class LocalAdapter implements StorageAdapter {
  readonly name = "local" as const;

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    const file = safeLocalPath(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
    await writeFile(file + CONTENT_TYPE_SIDECAR, contentType, "utf8");
  }

  async get(key: string): Promise<StoredObject | null> {
    const file = safeLocalPath(key);
    try {
      const bytes = await readFile(file);
      let contentType = "application/octet-stream";
      try {
        contentType = (await readFile(file + CONTENT_TYPE_SIDECAR, "utf8")).trim();
      } catch {
        // Sidecar missing (hand-placed file): the default is honest.
      }
      return { bytes, contentType };
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    const file = safeLocalPath(key);
    await unlink(file).catch(() => {});
    await unlink(file + CONTENT_TYPE_SIDECAR).catch(() => {});
  }

  async signedUrl(key: string, ttlSeconds: number): Promise<string> {
    const token = await signFileToken(key, ttlSeconds);
    return `${env.appUrl}/api/files/${key}?sig=${encodeURIComponent(token)}`;
  }
}

/** Sign a local-storage fetch. Same secret family as the portal links. */
async function signFileToken(key: string, ttlSeconds: number): Promise<string> {
  return new SignJWT({ key, kind: "file" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${Math.max(30, ttlSeconds)}s`)
    .sign(new TextEncoder().encode(env.portalTokenSecret));
}

export async function verifyFileToken(token: string, key: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(env.portalTokenSecret),
    );
    return payload.kind === "file" && payload.key === key;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------ R2 adapter --- */

class R2Adapter implements StorageAdapter {
  readonly name = "r2" as const;
  private client: import("@aws-sdk/client-s3").S3Client | null = null;

  private async s3() {
    if (!this.client) {
      const { S3Client } = await import("@aws-sdk/client-s3");
      const { accountId, accessKeyId, secretAccessKey } = env.r2;
      this.client = new S3Client({
        region: "auto",
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      });
    }
    return this.client;
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.s3()).send(
      new PutObjectCommand({
        Bucket: env.r2.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    try {
      const res = await (await this.s3()).send(
        new GetObjectCommand({ Bucket: env.r2.bucket, Key: key }),
      );
      const bytes = Buffer.from(await res.Body!.transformToByteArray());
      return { bytes, contentType: res.ContentType ?? "application/octet-stream" };
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.s3()).send(
      new DeleteObjectCommand({ Bucket: env.r2.bucket, Key: key }),
    );
  }

  async signedUrl(key: string, ttlSeconds: number): Promise<string> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    return getSignedUrl(
      await this.s3(),
      new GetObjectCommand({ Bucket: env.r2.bucket, Key: key }),
      { expiresIn: Math.max(30, ttlSeconds) },
    );
  }
}

/* -------------------------------------------------------------- selector --- */

let _adapter: StorageAdapter | null = null;

export function storage(): StorageAdapter {
  if (!_adapter) {
    const { accountId, accessKeyId, secretAccessKey, bucket } = env.r2;
    _adapter = accountId && accessKeyId && secretAccessKey && bucket
      ? new R2Adapter()
      : new LocalAdapter();
  }
  return _adapter;
}

export function storageName(): "r2" | "local" {
  return storage().name;
}

/* ---------------------------------------------------------------- images --- */

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export function isAcceptedPhoto(contentType: string): boolean {
  return IMAGE_TYPES.has(contentType.toLowerCase());
}

/**
 * Strip JPEG metadata (APP1/Exif, APP2..APPn, and comments) before a member's
 * photo of their neighbour's fence lands in permanent storage. Home addresses in
 * GPS tags are exactly the sort of thing a violation photo should not carry.
 *
 * Only JPEG is rewritten — PNG/WebP have no Exif segment in practice from phone
 * cameras, and re-encoding them would need an image library we deliberately do
 * not ship.
 */
export function stripJpegMetadata(bytes: Buffer): Buffer {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
  const out: Buffer[] = [bytes.subarray(0, 2)];
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) break;
    const marker = bytes[i + 1];
    // Start of scan: the rest is compressed image data, copy it verbatim.
    if (marker === 0xda) {
      out.push(bytes.subarray(i));
      return Buffer.concat(out);
    }
    const length = bytes.readUInt16BE(i + 2);
    const segment = bytes.subarray(i, i + 2 + length);
    const isAppOrComment = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!isAppOrComment) out.push(segment);
    i += 2 + length;
  }
  return Buffer.concat(out);
}

/** Content-addressed suffix, so the same photo uploaded twice is visibly the same. */
export function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 12);
}
