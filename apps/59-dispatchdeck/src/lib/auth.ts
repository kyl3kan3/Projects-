/**
 * src/lib/auth.ts
 *
 * scrypt password hashing + jose session cookies (the proven pattern
 * from the built apps). Roles: owner, dispatcher, driver — drivers see
 * only their assigned loads.
 *
 * TODO:
 * - [ ] hashPassword / verifyPassword (node:crypto scrypt, timing-safe).
 * - [ ] createSession(userId) -> signed cookie (jose, env.sessionSecret,
 *       30d) ; destroySession().
 * - [ ] requireSession(): { user, carrier } or redirect("/login").
 * - [ ] requireRole("owner" | "dispatcher"): office-surface gate.
 */

import type { carriers, users } from "@/db/schema";

export type SessionUser = typeof users.$inferSelect;
export type SessionCarrier = typeof carriers.$inferSelect;

export async function hashPassword(password: string): Promise<string> {
  throw new Error("Not implemented");
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  throw new Error("Not implemented");
}

export async function requireSession(): Promise<{ user: SessionUser; carrier: SessionCarrier }> {
  throw new Error("Not implemented");
}
