/**
 * src/lib/storage.ts
 *
 * Cloudflare R2 access (S3-compatible): presigned uploads for originals,
 * derivative writes from the worker, and public CDN URLs for the guest
 * page. Key layout is the contract between app, worker, and CDN.
 *
 * TODO:
 * - [ ] S3 client factory from R2_ACCOUNT_ID + key pair (endpoint
 *       https://<account>.r2.cloudflarestorage.com, region "auto").
 * - [ ] presignUpload(locationId, filename): 15-minute presigned PUT,
 *       content-type restricted to image/jpeg|png|heic, size cap 20MB.
 * - [ ] Key scheme: {locationId}/{photoId}/original.jpg,
 *       .../enhanced.jpg, .../w640.avif, .../w1280.webp ...
 * - [ ] publicUrl(key): CDN base + key (bucket custom domain).
 * - [ ] deletePhotoKeys(photoId): remove original + derivatives on item
 *       delete (originals kept while a photo is merely rejected).
 */

export interface PresignedUpload {
  url: string;
  key: string;
  expiresAt: Date;
}

export function presignUpload(
  _locationId: string,
  _filename: string,
): Promise<PresignedUpload> {
  throw new Error("Not implemented");
}

export function publicUrl(_key: string): string {
  throw new Error("Not implemented");
}
