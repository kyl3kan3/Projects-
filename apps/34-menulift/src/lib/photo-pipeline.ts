/**
 * src/lib/photo-pipeline.ts — Dish photo enhancement pipeline
 *
 * Thin abstraction over Replicate (relight + background cleanup) + sharp
 * (crop, aspect, AVIF/WebP derivatives) so the vendor is a one-file swap.
 *
 * TODO:
 * - [ ] enhance(originalKey) -> candidateKey (never overwrite original)
 * - [ ] approval gate: candidate only publishes on explicit approve
 * - [ ] derivative generation 1x/2x AVIF/WebP; cost cap per month
 */
export {};
