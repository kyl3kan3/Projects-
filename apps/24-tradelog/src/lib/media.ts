/**
 * Chart-snapshot limits. Kept out of the "use server" action module, which may
 * only export async functions.
 *
 * 2 MB is a generous PNG of a trading platform at retina width. The cap exists
 * because the bytes live in Postgres at MVP (see db/schema.ts) and because an
 * unbounded upload is an unbounded serverless function.
 */

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
