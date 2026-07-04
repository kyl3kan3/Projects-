/**
 * src/lib/storage.ts
 *
 * Cloudflare R2 (S3 API) helpers: presigned uploads for walkthrough media
 * and presigned/streamed reads for proposal pages and PDF snapshots. Media
 * uploads go phone -> R2 directly; our servers never proxy bytes.
 *
 * TODO:
 * - [ ] S3 client from R2_ACCOUNT_ID / R2_ACCESS_KEY_ID /
 *       R2_SECRET_ACCESS_KEY, endpoint https://<account>.r2.cloudflarestorage.com.
 * - [ ] presignUpload(orgId, walkthroughId, kind, contentType): key scheme
 *       org/{orgId}/walkthrough/{id}/{seq}.{ext}; short-lived PUT URL;
 *       content-type + max-size conditions.
 * - [ ] presignRead(key): time-limited GET for proposal-page photos.
 * - [ ] putPdfSnapshot(proposalId, bytes): archived acceptance artifact.
 * - [ ] confirmUpload(mediaId): HEAD the object, verify size/type, flip
 *       walkthrough_media.upload_status to complete.
 * - [ ] Lifecycle: delete media for orgs deleted 90+ days ago.
 */

export interface PresignedUpload {
  mediaId: string;
  uploadUrl: string;
  key: string;
  expiresAt: Date;
}

export function presignUpload(
  _orgId: string,
  _walkthroughId: string,
  _kind: "audio" | "photo",
  _contentType: string,
): Promise<PresignedUpload> {
  throw new Error("Not implemented");
}

export function presignRead(_key: string): Promise<string> {
  throw new Error("Not implemented");
}
