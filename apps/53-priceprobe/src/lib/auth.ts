/**
 * src/lib/auth.ts
 *
 * Auth.js (NextAuth v5) configuration and session guards. Brands are
 * workspaces with unlimited users; there are no public token surfaces
 * in this product (unlike the portfolio's field-worker apps).
 *
 * TODO:
 * - [ ] NextAuth v5 config: email magic-link provider (Resend) + optional
 *       Google; Drizzle adapter; session carries { userId, brandId, role }.
 * - [ ] requireUser(): server-side session guard for dashboard routes;
 *       redirects to sign-in when absent.
 * - [ ] requireOwner(): guard for billing and destructive settings.
 * - [ ] Invite flow: owner invites by email -> pending user row ->
 *       magic link completes it.
 */

export interface SessionUser {
  userId: string;
  brandId: string;
  role: "owner" | "member";
}

/** Server-side guard for dashboard routes; redirects to sign-in when absent. */
export async function requireUser(): Promise<SessionUser> {
  throw new Error("Not implemented");
}

/** Guard for billing and destructive settings routes. */
export async function requireOwner(): Promise<SessionUser> {
  throw new Error("Not implemented");
}
