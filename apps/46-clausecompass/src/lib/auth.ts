/**
 * src/lib/auth.ts
 *
 * Auth.js (NextAuth v5): magic-link email + Google. Per-contract buyers
 * get an implicit account at checkout (the report must be retrievable),
 * so the magic-link path is the primary one.
 *
 * TODO:
 * - [ ] Configure NextAuth with Resend email provider + Google.
 * - [ ] Drizzle adapter against the Auth.js tables in src/db/schema.
 * - [ ] Session callback: attach accountId, plan, creditsRemaining,
 *       disclaimerAckAt.
 * - [ ] Disclaimer gate: no review may start for an account without
 *       disclaimer_ack_at (enforced server-side, not just UI).
 * - [ ] requireAccount() server helper for App Router pages/actions.
 */

export function getAuth(): never {
  throw new Error("Not implemented");
}
