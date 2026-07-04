/**
 * src/lib/storage.ts
 *
 * Object storage (Cloudflare R2): contract uploads and exported report
 * PDFs. Customer contracts are sensitive by definition — short-lived
 * URLs, strict retention, and the "we don't train on your contracts"
 * promise starts with how these bytes are handled.
 *
 * TODO:
 * - [ ] S3 client from R2_* env vars (fail fast when unset).
 * - [ ] presignPut(accountId, contentType): key {accountId}/contracts/
 *       {uuid}; PDF/DOCX only, size-capped in the policy.
 * - [ ] presignGet(key): short expiry (minutes, not days).
 * - [ ] sha256 of uploads for dedupe (same contract re-uploaded = same
 *       review offered, not double-charged).
 * - [ ] Retention sweeper hook: delete source + report at
 *       retention_expires_at (worker job calls in here); deletions
 *       audit-logged.
 * - [ ] Server-side encryption headers; no public buckets, ever.
 */

export function presignPut(
  _accountId: string,
  _contentType: string,
): Promise<{ url: string; key: string }> {
  throw new Error("Not implemented");
}
