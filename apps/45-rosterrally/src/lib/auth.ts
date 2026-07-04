/**
 * src/lib/auth.ts
 *
 * Auth.js (NextAuth v5): magic-link email + Google for CLUB STAFF only
 * (admin/registrar/treasurer/coach/manager). Parents never authenticate —
 * they act through signed link-pages (see src/lib/links.ts).
 *
 * TODO:
 * - [ ] Configure NextAuth with Resend email provider + Google.
 * - [ ] Drizzle adapter against the Auth.js tables in src/db/schema.
 * - [ ] Session callback: attach clubId, role, plan.
 * - [ ] Role scoping helpers: coaches see only their teams; medical fields
 *       excluded from coach queries and exports (hard rule).
 * - [ ] requireStaff(role?) server helper for App Router pages/actions.
 */

export function getAuth(): never {
  throw new Error("Not implemented");
}
