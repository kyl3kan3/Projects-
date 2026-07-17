/**
 * src/lib/auth.ts
 *
 * scrypt + jose sessions serving two audiences: staff (director/admin/
 * teacher) and parents (family-linked).
 *
 * TODO:
 * - [ ] hashPassword / verifyPassword (scrypt, timing-safe).
 * - [ ] createSession / destroySession (jose, 30d).
 * - [ ] requireSession(): { user, coop }.
 * - [ ] requireStaff() and requireFamily(): role-split guards.
 */

import type { coops, families, users } from "@/db/schema";

export type SessionUser = typeof users.$inferSelect;
export type SessionCoop = typeof coops.$inferSelect;
export type SessionFamily = typeof families.$inferSelect;

export async function requireSession(): Promise<{ user: SessionUser; coop: SessionCoop }> {
  throw new Error("Not implemented");
}

export async function requireStaff(): Promise<{ user: SessionUser; coop: SessionCoop }> {
  throw new Error("Not implemented");
}

export async function requireFamily(): Promise<{
  user: SessionUser;
  coop: SessionCoop;
  family: SessionFamily;
}> {
  throw new Error("Not implemented");
}
