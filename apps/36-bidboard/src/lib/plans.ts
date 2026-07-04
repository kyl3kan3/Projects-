/**
 * src/lib/plans.ts
 *
 * Plan/spec file hosting on R2. Plan sets are large, versioned, and
 * downloaded by many subs -- signed URLs only, zero-egress storage.
 *
 * TODO:
 * - [ ] createSignedUploadUrl(companyId, projectId, filename, bytes):
 *       presigned PUT; enforce file types (pdf/dwg/zip/images) and the
 *       per-plan storage caps (25 GB Crew and up per plan).
 * - [ ] attachPlanFile(projectId, packageId | null, key, versionLabel):
 *       insert plan_files; new versions never overwrite -- subs may have
 *       bid against the old set and the record must show which.
 * - [ ] createSignedDownloadUrl(planFileId, portalScope | user): TTL 15
 *       min; portal calls verify the file belongs to the token's package
 *       (or project-level); every download writes audit_log.
 * - [ ] storageUsage(companyId): running total for plan-cap enforcement
 *       and the cold-tiering job later.
 */

export function createSignedUploadUrl(): Promise<string> {
  throw new Error("Not implemented");
}

export function createSignedDownloadUrl(): Promise<string> {
  throw new Error("Not implemented");
}
