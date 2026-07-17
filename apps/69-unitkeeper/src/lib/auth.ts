/**
 * src/lib/auth.ts
 *
 * scrypt + jose sessions for owners; tokenized tenant links for
 * move-in/sign/pay surfaces. Tenants never log in.
 *
 * TODO: hashPassword/verifyPassword; createSession/destroySession;
 * requireOwner(); mintTenantToken/verifyTenantToken.
 */

import type { owners } from "@/db/schema";

export type SessionOwner = typeof owners.$inferSelect;

export async function requireOwner(): Promise<{ owner: SessionOwner }> {
  throw new Error("Not implemented");
}

export async function verifyTenantToken(
  token: string,
): Promise<{ tenancyId: string; purpose: "movein" | "pay" | "receipt" } | null> {
  throw new Error("Not implemented");
}
