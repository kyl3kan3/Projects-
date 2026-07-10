/**
 * S3-compatible object storage (Cloudflare R2 target). Presigned PUT for
 * direct-to-bucket uploads (originals never transit the app server) and
 * presigned GET for expiring original downloads.
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

let _s3: S3Client | null = null;
function s3(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      region: "auto",
      endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env.r2AccessKeyId, secretAccessKey: env.r2SecretAccessKey },
    });
  }
  return _s3;
}
export async function presignPut(key: string, contentType: string): Promise<string> {
  return getSignedUrl(s3(), new PutObjectCommand({ Bucket: env.r2Bucket, Key: key, ContentType: contentType }), { expiresIn: 3600 });
}
export async function presignGet(key: string): Promise<string> {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: env.r2Bucket, Key: key }), { expiresIn: 900 });
}
/** Public derivative URL (content-hashed, cached by CDN). */
export function publicUrl(key: string): string {
  if (env.r2PublicBase) return `${env.r2PublicBase}/${key}`;
  return `/api/media/${encodeURIComponent(key)}`;
}
export { s3 };
