/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for all ShelfSense tables. Single source of truth for
 * the data model described in ARCHITECTURE.md ("Data Model" section).
 * Migrations are generated from this file via `npm run db:generate`.
 *
 * TODO:
 * - [ ] Define pgTable for: shops, suppliers, products, variants,
 *       inventory_levels, sales_daily, forecasts, po_drafts,
 *       po_draft_lines, alerts, webhook_events.
 * - [ ] pgEnum for plan, forecast status, po_draft status, alert kind.
 * - [ ] Unique constraints: shops.shopify_domain,
 *       webhook_events.shopify_webhook_id (idempotency),
 *       sales_daily (variant_id, date).
 * - [ ] Composite indexes: forecasts (shop via variant, run_date, status),
 *       variants (shop_id, sku), alerts (shop_id, kind, resolved_at).
 * - [ ] relations() definitions for query-builder joins.
 * - [ ] Row-level tenancy convention: every domain table carries shop_id
 *       or reaches it through products/variants.
 * - [ ] Encrypted-at-rest access_token column type (bytea + app-level
 *       AES-GCM via TOKEN_ENCRYPTION_KEY).
 */

export type Plan = "counter" | "backroom" | "warehouse";

export type ForecastStatus =
  | "order_now"
  | "order_soon"
  | "healthy"
  | "overstocked"
  | "dead";

export type PoDraftStatus = "draft" | "sent" | "dismissed";

export type AlertKind = "stockout_risk" | "dead_stock";

/** Audit trail persisted on every forecast row and rendered verbatim in the UI. */
export interface ForecastInputs {
  velocity7d: number;
  velocity30d: number;
  velocity90d: number;
  blendedVelocity: number;
  leadTimeDays: number;
  safetyDays: number;
  moq: number;
  packSize: number;
}
