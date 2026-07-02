/**
 * Backup worker (BullMQ): executes scheduled backup + restore-drill jobs.
 *
 * TODO:
 * - [ ] pg_dump streamed (no local disk) -> gzip -> envelope-encrypt -> S3 multipart
 * - [ ] per-provider connection handling (Supabase/Neon/PlanetScale/Railway)
 * - [ ] checksum + row-count sanity verification post-upload
 * - [ ] restore drill: restore into scratch DB, run verification queries, report
 * - [ ] retention pruning per policy
 * - [ ] failure alerts via Resend
 */
export {};
