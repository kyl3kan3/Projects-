/**
 * src/lib/storage.ts
 *
 * Cloudflare R2 (S3-compatible) access. All originals and close packages
 * live in R2 and are served exclusively through short-lived signed URLs --
 * documents are financial records and the bucket is never public.
 *
 * TODO:
 * - [ ] S3 client configured for R2 (endpoint from R2_ACCOUNT_ID).
 * - [ ] putDocument(orgId, buffer, mime): content-addressed key
 *       `orgs/{orgId}/docs/{sha256}.{ext}`; returns { key, contentHash }.
 * - [ ] createSignedUploadUrl(orgId, mime, maxBytes): presigned PUT for the
 *       PWA camera flow (browser uploads directly, never via the app server).
 * - [ ] createSignedDownloadUrl(key, ttlSeconds): presigned GET, default
 *       TTL 10 minutes, logged to audit_log by callers.
 * - [ ] putClosePackage(orgId, period, zipBuffer) / putClosePdf(...).
 * - [ ] Enforce allowed MIME types (jpeg/png/heic/webp/pdf) and size caps.
 */

export interface StoredObject {
  key: string;
  contentHash: string;
  bytes: number;
}

export function createSignedUploadUrl(): never {
  throw new Error("Not implemented");
}

export function createSignedDownloadUrl(): never {
  throw new Error("Not implemented");
}
