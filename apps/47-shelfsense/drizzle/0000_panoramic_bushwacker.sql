CREATE TYPE "public"."alert_kind" AS ENUM('stockout_risk', 'dead_stock');--> statement-breakpoint
CREATE TYPE "public"."confidence" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."digest_kind" AS ENUM('weekly_reorder', 'monthly_dead_stock');--> statement-breakpoint
CREATE TYPE "public"."forecast_status" AS ENUM('order_now', 'order_soon', 'healthy', 'overstocked', 'dead');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('counter', 'backroom', 'warehouse');--> statement-breakpoint
CREATE TYPE "public"."po_draft_status" AS ENUM('draft', 'sent', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."trend" AS ENUM('rising', 'flat', 'falling');--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"kind" "alert_kind" NOT NULL,
	"first_raised_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_notified_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"open_variant_id" uuid
);
--> statement-breakpoint
CREATE TABLE "digest_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"kind" "digest_kind" NOT NULL,
	"period_key" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"suppressed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forecasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"run_date" date NOT NULL,
	"velocity_7d" double precision DEFAULT 0 NOT NULL,
	"velocity_30d" double precision DEFAULT 0 NOT NULL,
	"velocity_90d" double precision DEFAULT 0 NOT NULL,
	"blended_velocity" double precision DEFAULT 0 NOT NULL,
	"days_of_cover" double precision,
	"reorder_point" integer DEFAULT 0 NOT NULL,
	"reorder_qty" integer DEFAULT 0 NOT NULL,
	"order_by_date" date,
	"stockout_date" date,
	"revenue_at_risk_cents" integer DEFAULT 0 NOT NULL,
	"cash_tied_up_cents" integer DEFAULT 0 NOT NULL,
	"available" integer DEFAULT 0 NOT NULL,
	"status" "forecast_status" NOT NULL,
	"trend" "trend" DEFAULT 'flat' NOT NULL,
	"confidence" "confidence" DEFAULT 'low' NOT NULL,
	"inputs" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"shopify_location_id" text NOT NULL,
	"available" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"external_order_id" text NOT NULL,
	"date" date NOT NULL,
	"units" integer DEFAULT 0 NOT NULL,
	"revenue_cents" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "po_draft_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"po_draft_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"title" text NOT NULL,
	"suggested_qty" integer NOT NULL,
	"final_qty" integer NOT NULL,
	"unit_cost_cents" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "po_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"supplier_id" uuid,
	"supplier_name" text NOT NULL,
	"status" "po_draft_status" DEFAULT 'draft' NOT NULL,
	"lead_time_days" integer DEFAULT 14 NOT NULL,
	"line_count" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"sent_to_email" text,
	"dismissed_at" timestamp with time zone,
	"suppress_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"shopify_product_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"vendor" text,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"date" date NOT NULL,
	"units_sold" integer DEFAULT 0 NOT NULL,
	"revenue_cents" integer DEFAULT 0 NOT NULL,
	"stockout" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"shopify_domain" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"access_token" text,
	"shopify_scopes" text,
	"plan" "plan" DEFAULT 'counter' NOT NULL,
	"shopify_charge_id" text,
	"trial_ends_at" timestamp with time zone,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"sku_count" integer DEFAULT 0 NOT NULL,
	"backfill_cursor" text,
	"backfill_orders_imported" integer DEFAULT 0 NOT NULL,
	"backfill_orders_estimated" integer,
	"backfill_started_at" timestamp with time zone,
	"backfill_completed_at" timestamp with time zone,
	"last_recompute_at" timestamp with time zone,
	"last_recompute_date" date,
	"uninstalled_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"lead_time_days" integer DEFAULT 14 NOT NULL,
	"min_order_value_cents" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"shopify_variant_id" text NOT NULL,
	"sku" text NOT NULL,
	"title" text NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"cost_cents" integer,
	"supplier_id" uuid,
	"moq" integer DEFAULT 0 NOT NULL,
	"pack_size" integer DEFAULT 1 NOT NULL,
	"inventory_quantity" integer DEFAULT 0 NOT NULL,
	"tracked" boolean DEFAULT true NOT NULL,
	"snoozed_until" timestamp with time zone,
	"first_sale_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid,
	"shop_domain" text NOT NULL,
	"shopify_webhook_id" text NOT NULL,
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_sends" ADD CONSTRAINT "digest_sends_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecasts" ADD CONSTRAINT "forecasts_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecasts" ADD CONSTRAINT "forecasts_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_draft_lines" ADD CONSTRAINT "po_draft_lines_po_draft_id_po_drafts_id_fk" FOREIGN KEY ("po_draft_id") REFERENCES "public"."po_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_draft_lines" ADD CONSTRAINT "po_draft_lines_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_drafts" ADD CONSTRAINT "po_drafts_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_drafts" ADD CONSTRAINT "po_drafts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_daily" ADD CONSTRAINT "sales_daily_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_daily" ADD CONSTRAINT "sales_daily_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_open_key" ON "alerts" USING btree ("open_variant_id","kind");--> statement-breakpoint
CREATE INDEX "alerts_shop_kind_idx" ON "alerts" USING btree ("shop_id","kind","resolved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "digest_sends_period_key" ON "digest_sends" USING btree ("shop_id","kind","period_key");--> statement-breakpoint
CREATE UNIQUE INDEX "forecasts_variant_run_key" ON "forecasts" USING btree ("variant_id","run_date");--> statement-breakpoint
CREATE INDEX "forecasts_shop_run_status_idx" ON "forecasts" USING btree ("shop_id","run_date","status");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_variant_location_key" ON "inventory_levels" USING btree ("variant_id","shopify_location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merchants_email_key" ON "merchants" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "order_lines_order_variant_key" ON "order_lines" USING btree ("shop_id","external_order_id","variant_id");--> statement-breakpoint
CREATE INDEX "order_lines_variant_date_idx" ON "order_lines" USING btree ("variant_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "po_draft_lines_draft_variant_key" ON "po_draft_lines" USING btree ("po_draft_id","variant_id");--> statement-breakpoint
CREATE INDEX "po_draft_lines_variant_idx" ON "po_draft_lines" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "po_drafts_shop_status_idx" ON "po_drafts" USING btree ("shop_id","status");--> statement-breakpoint
CREATE INDEX "po_drafts_supplier_idx" ON "po_drafts" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_shop_shopify_key" ON "products" USING btree ("shop_id","shopify_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_daily_variant_date_key" ON "sales_daily" USING btree ("variant_id","date");--> statement-breakpoint
CREATE INDEX "sales_daily_shop_date_idx" ON "sales_daily" USING btree ("shop_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "shops_domain_key" ON "shops" USING btree ("shopify_domain");--> statement-breakpoint
CREATE INDEX "shops_merchant_idx" ON "shops" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "suppliers_shop_idx" ON "suppliers" USING btree ("shop_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_shop_name_key" ON "suppliers" USING btree ("shop_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "variants_shop_shopify_key" ON "variants" USING btree ("shop_id","shopify_variant_id");--> statement-breakpoint
CREATE INDEX "variants_shop_sku_idx" ON "variants" USING btree ("shop_id","sku");--> statement-breakpoint
CREATE INDEX "variants_supplier_idx" ON "variants" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "variants_product_idx" ON "variants" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_shopify_id_key" ON "webhook_events" USING btree ("shopify_webhook_id");--> statement-breakpoint
CREATE INDEX "webhook_events_pending_idx" ON "webhook_events" USING btree ("processed_at","received_at");