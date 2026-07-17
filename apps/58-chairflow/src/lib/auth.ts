/**
 * src/lib/auth.ts
 *
 * Auth.js (NextAuth v5) for stylists and shop owners ONLY — clients
 * never have accounts (that's where booking conversion dies). Client
 * links (manage appointment, nudge booking, waitlist claim) are signed
 * jose tokens minted in lib/tokens.ts.
 *
 * TODO:
 * - [ ] NextAuth config: Drizzle adapter, email magic-link provider via
 *       Resend, session strategy "database".
 * - [ ] On first sign-in: create the stylist row (trial, 14 days),
 *       prompt for handle.
 * - [ ] requireStylist(): { stylist, user } or redirect("/login").
 * - [ ] requireShopOwner(shopSlug): owner gate for the rent ledger.
 */

import type { shops, stylists, users } from "@/db/schema";

export type SessionUser = typeof users.$inferSelect;
export type SessionStylist = typeof stylists.$inferSelect;
export type SessionShop = typeof shops.$inferSelect;

export async function requireStylist(): Promise<{ stylist: SessionStylist; user: SessionUser }> {
  throw new Error("Not implemented");
}

export async function requireShopOwner(
  shopSlug: string,
): Promise<{ shop: SessionShop; user: SessionUser }> {
  throw new Error("Not implemented");
}
