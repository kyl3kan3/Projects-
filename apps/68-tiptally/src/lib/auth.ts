/**
 * src/lib/auth.ts
 *
 * scrypt + jose sessions for managers; tokenized staff links for the
 * transparency page. Staff never log in.
 *
 * TODO: hashPassword/verifyPassword; createSession/destroySession;
 * requireManager(restaurantId?); mintStaffToken/verifyStaffToken.
 */

import type { groups, restaurants, users } from "@/db/schema";

export type SessionUser = typeof users.$inferSelect;
export type SessionGroup = typeof groups.$inferSelect;
export type SessionRestaurant = typeof restaurants.$inferSelect;

export async function requireManager(
  restaurantId?: string,
): Promise<{ user: SessionUser; group: SessionGroup; restaurant: SessionRestaurant | null }> {
  throw new Error("Not implemented");
}

export async function verifyStaffToken(token: string): Promise<{ employeeId: string } | null> {
  throw new Error("Not implemented");
}
