/**
 * src/lib/auth.ts
 *
 * scrypt + jose sessions for account users; tokenized party links for
 * the portal and uploads (parties never log in).
 *
 * TODO: hashPassword/verifyPassword; createSession/destroySession;
 * requireSession(); mintPartyToken/verifyPartyToken.
 */

import type { accounts, users } from "@/db/schema";

export type SessionUser = typeof users.$inferSelect;
export type SessionAccount = typeof accounts.$inferSelect;

export async function requireSession(): Promise<{ user: SessionUser; account: SessionAccount }> {
  throw new Error("Not implemented");
}

export async function verifyPartyToken(token: string): Promise<{ partyId: string } | null> {
  throw new Error("Not implemented");
}
