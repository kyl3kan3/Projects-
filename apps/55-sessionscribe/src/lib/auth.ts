/**
 * src/lib/auth.ts
 *
 * Auth.js (NextAuth v5) configuration: email magic link (Resend) + optional
 * Google. Practice-scoped sessions with clinician/supervisor/admin roles.
 * Every authenticated request that touches PHI must pass through
 * requirePractice() so the audit hook (src/lib/audit.ts) always fires.
 *
 * TODO:
 * - [ ] Configure NextAuth with Resend email provider + Google.
 * - [ ] Drizzle adapter against the Auth.js tables in src/db/schema.
 * - [ ] Session callback: attach practiceId, userId, role, plan,
 *       trialEndsAt.
 * - [ ] First-login flow: create practice, seed built-in SOAP/DAP templates,
 *       set retention default, stamp baa_accepted_at from the signup consent.
 * - [ ] requirePractice() server helper for App Router pages/actions —
 *       resolves the session, scopes queries by practiceId, writes the
 *       audit event for the access.
 * - [ ] Short session maxAge (clinical data; re-auth is cheap with magic
 *       links).
 */

export function getAuth(): never {
  throw new Error("Not implemented");
}

/** Server helper: current user + practice, or redirect to sign-in. */
export function requirePractice(): never {
  throw new Error("Not implemented");
}
