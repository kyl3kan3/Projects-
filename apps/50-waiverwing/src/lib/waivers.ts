/**
 * src/lib/waivers.ts
 *
 * Waiver builder + immutable versioning. Every signature pins the exact
 * version signed; publishing never mutates, it snapshots.
 *
 * TODO:
 * - [ ] Block validation (zod): liability_text, initialed_clause,
 *       question, signature; exactly one signature block; at least one
 *       liability_text.
 * - [ ] publish(waiverId): write waiver_versions row (version++), set
 *       waiver live; drafts editable, versions never.
 * - [ ] renderVersionText(version): canonical plain-text rendering used
 *       for BOTH display and the SHA-256 text_hash -- one function so
 *       they can never diverge (ROADMAP acceptance criterion).
 * - [ ] Expiry rules: visit | days_365 | forever -> expiresAt(signedAt).
 * - [ ] Minor rules: age of majority (default 18), guardian relationship
 *       options, whether guardians also sign for themselves.
 * - [ ] Template skeletons per vertical (climbing, trampoline, tours,
 *       rentals) -- clearly labeled "have your attorney review."
 */

import type { ExpiryRule, WaiverBlock } from "../db/schema";

export function validateBlocks(_blocks: WaiverBlock[]): string[] {
  throw new Error("Not implemented");
}

export function expiresAt(_rule: ExpiryRule, _signedAt: Date): Date | null {
  throw new Error("Not implemented");
}
