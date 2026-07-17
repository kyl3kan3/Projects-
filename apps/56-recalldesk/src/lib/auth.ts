/**
 * src/lib/auth.ts
 *
 * Auth.js (NextAuth v5) configuration: email magic link (Resend) + optional
 * Google. Practice-scoped sessions with owner/office_manager/front_desk
 * roles. Patients never authenticate — booking pages use signed tokens
 * (see src/lib/campaigns.ts booking-link helpers).
 *
 * TODO:
 * - [ ] Configure NextAuth with Resend email provider + Google.
 * - [ ] Drizzle adapter against the Auth.js tables in src/db/schema.
 * - [ ] Session callback: attach practiceId, userId, role,
 *       defaultLocationId, plan, trialEndsAt.
 * - [ ] First-login flow: create practice + first location, seed built-in
 *       templates, start the trial clock.
 * - [ ] requirePractice() / requireLocation() server helpers for App Router
 *       pages/actions — scope every query by practice, and by location for
 *       operational screens.
 * - [ ] Role gates: campaign launch + import commit require office_manager
 *       or owner; the call queue is open to front_desk.
 */

export function getAuth(): never {
  throw new Error("Not implemented");
}

/** Server helper: current user + practice, or redirect to sign-in. */
export function requirePractice(): never {
  throw new Error("Not implemented");
}
