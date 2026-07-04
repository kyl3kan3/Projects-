/**
 * src/lib/auth.ts
 *
 * Auth.js (NextAuth v5) configuration: magic-link email + Google OAuth,
 * firm-scoped sessions. Portal visitors never authenticate (signed links,
 * see src/lib/portal.ts).
 *
 * TODO:
 * - [ ] Configure NextAuth with Resend email provider + Google.
 * - [ ] Drizzle adapter against the Auth.js tables in src/db/schema.
 * - [ ] Session callback: attach firmId, firmGroupId, role, plan.
 * - [ ] First-login flow: create firm, seed the default sequence ladder
 *       (approval mode ON by default — ground rule for new firms).
 * - [ ] requireFirm() server helper for App Router pages/actions.
 */

export function getAuth(): never {
  throw new Error("Not implemented");
}
