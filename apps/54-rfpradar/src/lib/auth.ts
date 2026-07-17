/**
 * src/lib/auth.ts
 *
 * Auth.js (NextAuth v5) configuration plus firm-scoped session helpers.
 * Every server action and API route resolves the caller's firm through
 * requireFirm() — no query in the app runs without a firm_id.
 *
 * TODO:
 * - [ ] NextAuth config: Drizzle adapter, email (magic link via Resend)
 *       + optional Google provider, session strategy "database".
 * - [ ] On first sign-in: create the firm (trial plan, 14 days), attach
 *       the user as admin.
 * - [ ] requireSession(): session or redirect("/login").
 * - [ ] requireFirm(): { firm, user } or redirect; used by every
 *       dashboard page and API route.
 * - [ ] requireAdmin(): role gate for billing, seats, token rotation.
 */

import type { firms, users } from "@/db/schema";

export type SessionUser = typeof users.$inferSelect;
export type SessionFirm = typeof firms.$inferSelect;

export async function requireSession(): Promise<{ userId: string }> {
  throw new Error("Not implemented");
}

export async function requireFirm(): Promise<{ firm: SessionFirm; user: SessionUser }> {
  throw new Error("Not implemented");
}

export async function requireAdmin(): Promise<{ firm: SessionFirm; user: SessionUser }> {
  throw new Error("Not implemented");
}
