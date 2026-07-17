/**
 * src/lib/auth.ts
 *
 * scrypt + jose sessions for org users (admin/coordinator). Vendors
 * never log in — their surface is the tokenized upload link.
 *
 * TODO: hashPassword/verifyPassword (scrypt, timing-safe);
 * createSession/destroySession (jose, 30d); requireSession();
 * requireAdmin() for billing + template deletion.
 */

import type { orgs, users } from "@/db/schema";

export type SessionUser = typeof users.$inferSelect;
export type SessionOrg = typeof orgs.$inferSelect;

export async function requireSession(): Promise<{ user: SessionUser; org: SessionOrg }> {
  throw new Error("Not implemented");
}

export async function requireAdmin(): Promise<{ user: SessionUser; org: SessionOrg }> {
  throw new Error("Not implemented");
}
