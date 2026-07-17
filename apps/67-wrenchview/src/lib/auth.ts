/**
 * src/lib/auth.ts
 *
 * Three credentials, one module: staff sessions (scrypt + jose),
 * device tokens for bay tablets (long-lived, revocable rows), and
 * customer report tokens (jose, hash on report_links).
 *
 * TODO: hashPassword/verifyPassword; requireStaff(role?);
 * mintDeviceToken/requireDevice; mintReportToken/verifyReportToken
 * (stamps first_viewed_at on first verify).
 */

import type { devices, shops, users } from "@/db/schema";

export type SessionUser = typeof users.$inferSelect;
export type SessionShop = typeof shops.$inferSelect;
export type SessionDevice = typeof devices.$inferSelect;

export async function requireStaff(
  role?: "owner" | "advisor",
): Promise<{ user: SessionUser; shop: SessionShop }> {
  throw new Error("Not implemented");
}

export async function requireDevice(): Promise<{ device: SessionDevice; shop: SessionShop }> {
  throw new Error("Not implemented");
}

export async function verifyReportToken(
  token: string,
): Promise<{ inspectionId: string } | null> {
  throw new Error("Not implemented");
}
