/**
 * src/lib/auth.ts
 *
 * scrypt password hashing + jose session cookies. Roles: owner, staff,
 * driver. Customer surfaces are tokenized links — no customer accounts.
 *
 * TODO:
 * - [ ] hashPassword / verifyPassword (node:crypto scrypt, timing-safe).
 * - [ ] createSession / destroySession (jose, env.sessionSecret, 30d).
 * - [ ] requireSession(): { user, account } or redirect("/login").
 * - [ ] requireRole("owner" | "staff") for money surfaces.
 */

import type { accounts, users } from "@/db/schema";

export type SessionUser = typeof users.$inferSelect;
export type SessionAccount = typeof accounts.$inferSelect;

export async function hashPassword(password: string): Promise<string> {
  throw new Error("Not implemented");
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  throw new Error("Not implemented");
}

export async function requireSession(): Promise<{ user: SessionUser; account: SessionAccount }> {
  throw new Error("Not implemented");
}
