/**
 * src/lib/auth.ts
 *
 * Auth.js (NextAuth v5) configuration: email magic link (Resend) + optional
 * Google. School-scoped sessions with owner/instructor/front_desk roles.
 * The kiosk never uses staff auth — it authenticates by device token
 * (see src/lib/kiosk.ts).
 *
 * TODO:
 * - [ ] Configure NextAuth with Resend email provider + Google.
 * - [ ] Drizzle adapter against the Auth.js tables in src/db/schema.
 * - [ ] Session callback: attach schoolId, userId, role, plan, trialEndsAt.
 * - [ ] First-login flow: create school + implicit location, load the
 *       chosen curriculum template, start the trial clock.
 * - [ ] requireSchool() server helper for App Router pages/actions —
 *       scopes every query by schoolId.
 * - [ ] Role gates: curriculum edits + grading completion require
 *       owner/instructor; billing requires owner; the desk can check in
 *       and disposition flags.
 */

export function getAuth(): never {
  throw new Error("Not implemented");
}

/** Server helper: current user + school, or redirect to sign-in. */
export function requireSchool(): never {
  throw new Error("Not implemented");
}
