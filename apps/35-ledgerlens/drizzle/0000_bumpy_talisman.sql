CREATE TYPE "public"."close_status" AS ENUM('open', 'closing', 'closed');--> statement-breakpoint
CREATE TYPE "public"."doc_type" AS ENUM('receipt', 'invoice', 'statement', 'other');--> statement-breakpoint
CREATE TYPE "public"."document_source" AS ENUM('email', 'photo', 'upload');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('queued', 'extracting', 'needs_review', 'confirmed', 'rejected', 'duplicate');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('weekly_digest', 'review_nudge', 'close_ready', 'over_cap');--> statement-breakpoint
CREATE TYPE "public"."org_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('solo', 'operator', 'pro');--> statement-breakpoint
CREATE TYPE "public"."review_field" AS ENUM('vendor', 'date', 'total', 'tax', 'category');--> statement-breakpoint
CREATE TYPE "public"."review_resolution" AS ENUM('accepted', 'corrected', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."rule_source" AS ENUM('correction', 'manual');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"schedule_c_line" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "close_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"period" text NOT NULL,
	"status" "close_status" DEFAULT 'open' NOT NULL,
	"summary" jsonb,
	"pdf_storage_key" text,
	"package_storage_key" text,
	"forced" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source" "document_source" NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"content_hash" text NOT NULL,
	"original_filename" text NOT NULL,
	"byte_size" integer DEFAULT 0 NOT NULL,
	"email_message_id" text,
	"source_text" text,
	"status" "document_status" DEFAULT 'queued' NOT NULL,
	"duplicate_of_id" uuid,
	"duplicate_candidate_of_id" uuid,
	"failure_reason" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"extracting_since" timestamp with time zone,
	"extracted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extractions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"extractor" text NOT NULL,
	"model" text NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"escalated" boolean DEFAULT false NOT NULL,
	"raw_response" jsonb,
	"vendor_name" text,
	"doc_type" "doc_type",
	"doc_date" date,
	"total_cents" integer,
	"tax_cents" integer,
	"currency" text DEFAULT 'USD' NOT NULL,
	"line_summary" text,
	"suggested_category_slug" text,
	"confidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"overall_confidence_bp" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"cost_microcents" integer DEFAULT 0 NOT NULL,
	"failure" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"vendor_id" uuid,
	"category_id" uuid,
	"doc_date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"tax_cents" integer,
	"currency" text DEFAULT 'USD' NOT NULL,
	"memo" text,
	"confirmed_by" text,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"key" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"plan" "plan" DEFAULT 'solo' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"forwarding_slug" text NOT NULL,
	"time_zone" text DEFAULT 'America/Denver' NOT NULL,
	"fiscal_year_start_month" integer DEFAULT 1 NOT NULL,
	"digest_weekday" integer DEFAULT 1 NOT NULL,
	"weekly_digest_enabled" boolean DEFAULT true NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"field" "review_field" NOT NULL,
	"suggested_value" text,
	"confidence_bp" integer DEFAULT 0 NOT NULL,
	"resolved_value" text,
	"resolution" "review_resolution",
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"close_period_id" uuid,
	"label" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"last_accessed_at" timestamp with time zone,
	"access_count" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"period" text NOT NULL,
	"documents_ingested" integer DEFAULT 0 NOT NULL,
	"documents_extracted" integer DEFAULT 0 NOT NULL,
	"extraction_cost_microcents" bigint DEFAULT 0 NOT NULL,
	"reported_to_stripe_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"password_hash" text NOT NULL,
	"role" "org_role" DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"default_category_id" uuid,
	"rule_source" "rule_source",
	"document_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "close_periods" ADD CONSTRAINT "close_periods_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_duplicate_of_id_documents_id_fk" FOREIGN KEY ("duplicate_of_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_duplicate_candidate_of_id_documents_id_fk" FOREIGN KEY ("duplicate_candidate_of_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extractions" ADD CONSTRAINT "extractions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extractions" ADD CONSTRAINT "extractions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_close_period_id_close_periods_id_fk" FOREIGN KEY ("close_period_id") REFERENCES "public"."close_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_default_category_id_categories_id_fk" FOREIGN KEY ("default_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_org_created_idx" ON "audit_log" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_global_slug_key" ON "categories" USING btree ("slug") WHERE organization_id is null;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_org_slug_key" ON "categories" USING btree ("organization_id","slug") WHERE organization_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "close_periods_org_period_key" ON "close_periods" USING btree ("organization_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_org_hash_key" ON "documents" USING btree ("organization_id","content_hash") WHERE duplicate_of_id is null;--> statement-breakpoint
CREATE INDEX "documents_org_status_idx" ON "documents" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "documents_org_received_idx" ON "documents" USING btree ("organization_id","received_at");--> statement-breakpoint
CREATE INDEX "documents_email_message_idx" ON "documents" USING btree ("organization_id","email_message_id");--> statement-breakpoint
CREATE INDEX "extractions_document_idx" ON "extractions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "extractions_org_created_idx" ON "extractions" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "line_items_document_key" ON "line_items" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "line_items_org_date_idx" ON "line_items" USING btree ("organization_id","doc_date");--> statement-breakpoint
CREATE INDEX "line_items_org_confirmed_idx" ON "line_items" USING btree ("organization_id","confirmed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_org_kind_key" ON "notifications" USING btree ("organization_id","kind","key");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_forwarding_slug_key" ON "organizations" USING btree ("forwarding_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "review_items_document_field_key" ON "review_items" USING btree ("document_id","field");--> statement-breakpoint
CREATE INDEX "review_items_org_open_idx" ON "review_items" USING btree ("organization_id","resolved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_token_key" ON "share_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "share_links_org_idx" ON "share_links" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_counters_org_period_key" ON "usage_counters" USING btree ("organization_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_organization_idx" ON "users" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vendors_org_normalized_key" ON "vendors" USING btree ("organization_id","normalized_name");