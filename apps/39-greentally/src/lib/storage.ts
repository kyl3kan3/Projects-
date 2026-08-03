/**
 * Storage for original bills — the audit trail's physical layer.
 *
 * Two drivers behind one interface:
 *
 *  - **R2** (`@aws-sdk/client-s3` against the Cloudflare S3 endpoint) when the four
 *    `R2_*` vars are set. This is the deployment configuration.
 *  - **Postgres** otherwise, as base64 in `document_blobs`. This is what a clone
 *    with no cloud account gets, and it is a real driver, not a stub: same keys,
 *    same signed-URL discipline, and it works on Vercel, where the filesystem is
 *    read-only.
 *
 * Nothing is ever public. Both drivers hand out URLs on *this* app
 * (`/api/files/<documentId>?exp=…&sig=…`), HMAC-signed with a short expiry; the
 * route verifies the signature and then either redirects to a presigned R2 GET or
 * streams the bytes. A leaked bill URL stops working, and a guessed one never
 * works — which is what a document containing a customer's service address needs.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documentBlobs } from "@/db/schema";
import { env, r2Configured } from "@/lib/env";

export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

export const ALLOWED_DOCUMENT_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "text/plain",
  "text/csv",
  "application/vnd.ms-excel",
]);

export function extensionFor(mime: string): string {
  switch (mime) {
    case "application/pdf":
      return "pdf";
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
    case "text/csv":
    case "application/vnd.ms-excel":
      return "csv";
    case "text/plain":
      return "txt";
    default:
      return "bin";
  }
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function storageKeyFor(organizationId: string, documentId: string, mime: string): string {
  return `bills/${organizationId}/${documentId}.${extensionFor(mime)}`;
}

/* ---------------------------------------------------------------- drivers --- */

export type DriverKind = "r2" | "postgres";

export function driverKind(): DriverKind {
  return r2Configured() ? "r2" : "postgres";
}

async function r2Client() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  const { accountId, accessKeyId, secretAccessKey } = env.r2;
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

/** Write the original bytes. `documentId` is the key for the Postgres driver. */
export async function putDocumentBytes(
  documentId: string,
  key: string,
  bytes: Uint8Array,
  mime: string,
): Promise<void> {
  if (driverKind() === "r2") {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await r2Client();
    await client.send(
      new PutObjectCommand({
        Bucket: env.r2.bucket,
        Key: key,
        Body: bytes,
        ContentType: mime,
      }),
    );
    return;
  }
  await getDb()
    .insert(documentBlobs)
    .values({ documentId, data: Buffer.from(bytes).toString("base64") })
    .onConflictDoUpdate({
      target: documentBlobs.documentId,
      set: { data: Buffer.from(bytes).toString("base64") },
    });
}

export async function getDocumentBytes(documentId: string, key: string): Promise<Uint8Array> {
  if (driverKind() === "r2") {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await r2Client();
    const res = await client.send(
      new GetObjectCommand({ Bucket: env.r2.bucket, Key: key }),
    );
    const body = res.Body as unknown as { transformToByteArray(): Promise<Uint8Array> };
    return body.transformToByteArray();
  }
  const [row] = await getDb()
    .select()
    .from(documentBlobs)
    .where(eq(documentBlobs.documentId, documentId));
  if (!row) throw new Error(`No stored bytes for document ${documentId}`);
  return new Uint8Array(Buffer.from(row.data, "base64"));
}

/** A direct URL when the driver can issue one; null means "stream it yourself". */
export async function presignGet(key: string, ttlSeconds: number): Promise<string | null> {
  if (driverKind() !== "r2") return null;
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const client = await r2Client();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: env.r2.bucket, Key: key }), {
    expiresIn: ttlSeconds,
  });
}

/* ------------------------------------------------------------ signed links --- */

function sign(documentId: string, exp: number): string {
  return createHmac("sha256", env.signingSecret)
    .update(`${documentId}:${exp}`)
    .digest("base64url");
}

/** A short-lived, signed URL on this app for a document's original bytes. */
export function signedDocumentUrl(documentId: string, ttlSeconds = 900): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `/api/files/${documentId}?exp=${exp}&sig=${sign(documentId, exp)}`;
}

export function verifyDocumentUrl(documentId: string, exp: string, sig: string): boolean {
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum * 1000 < Date.now()) return false;
  const expected = Buffer.from(sign(documentId, expNum));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
