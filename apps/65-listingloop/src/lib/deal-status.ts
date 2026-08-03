/**
 * src/lib/deal-status.ts
 *
 * The deal-status vocabulary, kept in its own pure module.
 *
 * This exists because of a real build failure: `Placard.tsx` is imported by a
 * client component, it needed these labels, and importing them from
 * `lib/deals.ts` pulled the Drizzle client — and therefore `postgres`, `net` and
 * `tls` — into the browser bundle. Labels are data, not database access, so they
 * live where a client component can have them.
 */

import type { DealStatus } from "@/db/schema";

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  active: "Active",
  pending_items: "Pending items",
  clear_to_close: "Clear to close",
  closed: "Closed",
  terminated: "Terminated",
};

export const DEAL_STATUS_ORDER: readonly DealStatus[] = [
  "active",
  "pending_items",
  "clear_to_close",
  "closed",
  "terminated",
] as const;
