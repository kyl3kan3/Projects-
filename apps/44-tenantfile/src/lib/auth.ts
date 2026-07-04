/**
 * src/lib/auth.ts
 *
 * Auth.js (NextAuth v5): magic-link email + Google for LANDLORDS only.
 * Tenants and applicants never create accounts in MVP — they act through
 * signed links (see src/lib/links.ts inside storage/links helpers).
 *
 * TODO:
 * - [ ] Configure NextAuth with Resend email provider + Google.
 * - [ ] Drizzle adapter against the Auth.js tables in src/db/schema.
 * - [ ] Session callback: attach landlordId, role, plan, unit count
 *       (plan gating happens against unit count).
 * - [ ] First-login flow: create landlord + first property wizard state.
 * - [ ] requireLandlord() server helper for App Router pages/actions.
 */

export function getAuth(): never {
  throw new Error("Not implemented");
}
