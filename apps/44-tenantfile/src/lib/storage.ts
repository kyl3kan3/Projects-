/**
 * src/lib/storage.ts
 *
 * Object storage (Cloudflare R2, S3-compatible): listing photos, applicant
 * documents, signed leases, maintenance photos, File exports. Browser
 * uploads go straight to R2 via presigned URLs.
 *
 * TODO:
 * - [ ] S3 client from R2_* env vars (fail fast when unset).
 * - [ ] presignPut(scope, contentType, maxBytes): key convention
 *       {landlordId}/{scope}/{uuid}; content-type + size enforced in the
 *       policy, images only where scope demands.
 * - [ ] presignGet(key, expiry): short-lived reads; applicant documents
 *       and reports get the shortest expiry.
 * - [ ] Image handling: strip EXIF GPS on ingest, generate thumbnail
 *       variants for threads and listing grids.
 * - [ ] Signed-link tokens for tenant/applicant pages (jose JWT with
 *       LINK_TOKEN_SECRET) also live here: createLinkToken / verifyLinkToken.
 */

export function presignPut(
  _scope: "listing" | "application" | "lease" | "request" | "export",
  _contentType: string,
): Promise<{ url: string; key: string }> {
  throw new Error("Not implemented");
}
