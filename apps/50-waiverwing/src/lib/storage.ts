/**
 * Object storage for rendered PDFs.
 *
 * S3 is a cache, never the record. The signature row in Postgres holds the
 * evidence; a PDF is a rendering of it and can always be produced again from the
 * row alone. So when S3 is not configured — local development, a preview
 * deploy — PDFs are simply rendered per request and nothing is lost but a few
 * hundred milliseconds. Nothing in the product blocks on storage being present.
 */

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, s3Configured } from "@/lib/env";

let _client: S3Client | null = null;

function client(): S3Client {
  if (!_client) _client = new S3Client({ region: env.awsRegion });
  return _client;
}

export { s3Configured };

export async function putObject(
  key: string,
  body: Uint8Array,
  contentType = "application/pdf",
): Promise<string | null> {
  if (!s3Configured()) return null;
  await client().send(
    new PutObjectCommand({
      Bucket: env.s3Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      // The archive holds PII including minors' — encrypted at rest, always.
      ServerSideEncryption: "AES256",
    }),
  );
  return key;
}

export async function getObject(key: string): Promise<Uint8Array | null> {
  if (!s3Configured()) return null;
  try {
    const res = await client().send(
      new GetObjectCommand({ Bucket: env.s3Bucket, Key: key }),
    );
    const bytes = await res.Body?.transformToByteArray();
    return bytes ?? null;
  } catch {
    return null;
  }
}

/** Short-lived signed URL — the archive is never public. */
export async function signedDownloadUrl(key: string, ttlSeconds = 300): Promise<string | null> {
  if (!s3Configured()) return null;
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: env.s3Bucket, Key: key }),
    { expiresIn: ttlSeconds },
  );
}

/**
 * Cache key for a signed-waiver PDF. Deterministic from immutable inputs: the
 * signature id plus the hash of the text it carries. If the stored text were
 * ever altered the key would change, so a stale render can never be served as
 * though it matched.
 */
export function signaturePdfKey(signatureId: string, textHash: string): string {
  return `signatures/${signatureId}/${textHash.slice(0, 16)}.pdf`;
}

export function bulkPdfKey(accountId: string, stamp: string): string {
  return `exports/${accountId}/bulk-${stamp}.pdf`;
}

export function incidentPdfKey(accountId: string, incidentId: string, stamp: string): string {
  return `exports/${accountId}/incident-${incidentId}-${stamp}.pdf`;
}
