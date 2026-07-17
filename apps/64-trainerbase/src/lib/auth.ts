/**
 * src/lib/auth.ts
 *
 * Trainer auth (scrypt + jose cookies) and client magic links (jose
 * tokens, hash stored on the client row — clients never see a
 * password).
 *
 * TODO: hashPassword/verifyPassword; createSession/destroySession;
 * requireTrainer(); mintClientLink(clientId)/verifyClientLink(token);
 * requireClient() for the PWA surfaces.
 */

import type { clients, trainers } from "@/db/schema";

export type SessionTrainer = typeof trainers.$inferSelect;
export type SessionClient = typeof clients.$inferSelect;

export async function requireTrainer(): Promise<{ trainer: SessionTrainer }> {
  throw new Error("Not implemented");
}

export async function requireClient(): Promise<{
  client: SessionClient;
  trainer: SessionTrainer;
}> {
  throw new Error("Not implemented");
}
