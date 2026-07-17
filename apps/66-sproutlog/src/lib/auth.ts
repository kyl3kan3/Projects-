/**
 * src/lib/auth.ts
 *
 * scrypt + jose sessions for providers (and Orchard assistants);
 * tokenized family links for digest archives, pay links, and
 * signature capture. Parents never log in.
 *
 * TODO: hashPassword/verifyPassword; createSession/destroySession;
 * requireProvider(); mintFamilyToken/verifyFamilyToken.
 */

import type { providers } from "@/db/schema";

export type SessionProvider = typeof providers.$inferSelect;

export async function requireProvider(): Promise<{ provider: SessionProvider; loggedBy: string }> {
  throw new Error("Not implemented");
}

export async function verifyFamilyToken(token: string): Promise<{ familyId: string } | null> {
  throw new Error("Not implemented");
}
