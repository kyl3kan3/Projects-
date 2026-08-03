CREATE TYPE "public"."activity_category" AS ENUM('electricity_kwh', 'natural_gas_kwh', 'diesel_l', 'petrol_l', 'heating_oil_l', 'propane_l');--> statement-breakpoint
CREATE TYPE "public"."answer_status" AS ENUM('draft', 'ready');--> statement-breakpoint
CREATE TYPE "public"."billing_interval" AS ENUM('month', 'year');--> statement-breakpoint
CREATE TYPE "public"."classification_source" AS ENUM('auto', 'user');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('electricity_bill', 'gas_bill', 'fuel_receipt', 'spend_csv', 'other');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('uploaded', 'extracting', 'needs_review', 'accepted', 'rejected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."factor_set" AS ENUM('epa_2025', 'egrid_2024', 'defra_2025', 'useeio_v2', 'contractual');--> statement-breakpoint
CREATE TYPE "public"."framework" AS ENUM('cdp_style', 'ecovadis_style', 'custom');--> statement-breakpoint
CREATE TYPE "public"."job_kind" AS ENUM('extract_document', 'classify_spend', 'compute_footprint');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."market_method" AS ENUM('residual_mix', 'renewable_contract');--> statement-breakpoint
CREATE TYPE "public"."org_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."period_status" AS ENUM('collecting', 'review', 'complete');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('preview', 'starter', 'standard', 'supplier_plus');--> statement-breakpoint
CREATE TYPE "public"."report_kind" AS ENUM('csrd_lite');--> statement-breakpoint
CREATE TYPE "public"."scope" AS ENUM('1', '2_location', '2_market', '3_spend');--> statement-breakpoint
CREATE TABLE "activity_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"category" "activity_category" NOT NULL,
	"quantity_milli" bigint NOT NULL,
	"unit" text NOT NULL,
	"source_quantity" text DEFAULT '' NOT NULL,
	"source_unit" text DEFAULT '' NOT NULL,
	"service_start" date NOT NULL,
	"service_end" date NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"field_confidences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"actor_label" text DEFAULT '' NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_blobs" (
	"document_id" uuid PRIMARY KEY NOT NULL,
	"data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid,
	"period_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"content_hash" text NOT NULL,
	"kind" "document_kind" NOT NULL,
	"status" "document_status" DEFAULT 'uploaded' NOT NULL,
	"confidence_bp" integer,
	"extractor" text,
	"extractor_model" text,
	"cost_microcents" bigint DEFAULT 0 NOT NULL,
	"error" text,
	"provider" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emission_factors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factor_set" "factor_set" NOT NULL,
	"category" text NOT NULL,
	"region" text NOT NULL,
	"unit" text NOT NULL,
	"kgco2e_per_unit_micro" bigint NOT NULL,
	"vintage" text NOT NULL,
	"citation" text NOT NULL,
	"scope" "scope" NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emission_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"site_id" uuid,
	"scope" "scope" NOT NULL,
	"category" text NOT NULL,
	"gco2e" bigint NOT NULL,
	"factor_id" uuid,
	"activity_line_id" uuid,
	"spend_line_id" uuid,
	"quantity_milli" bigint DEFAULT 0 NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"month" text DEFAULT '' NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"engine_version" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "job_kind" NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"plan" "plan" DEFAULT 'preview' NOT NULL,
	"billing_interval" "billing_interval",
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"industry_code" text DEFAULT '' NOT NULL,
	"industry_label" text DEFAULT '' NOT NULL,
	"annual_revenue_cents" bigint DEFAULT 0 NOT NULL,
	"fte_count" integer DEFAULT 0 NOT NULL,
	"reporting_currency" text DEFAULT 'USD' NOT NULL,
	"settings" jsonb DEFAULT '{"contactName":"","contactEmail":"","reportWordmark":"","frameworks":["cdp_style"],"spendMapping":null}'::jsonb NOT NULL,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questionnaire_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"framework" "framework" NOT NULL,
	"question_key" text NOT NULL,
	"question_text" text NOT NULL,
	"answer_text" text NOT NULL,
	"tone_note" text DEFAULT '' NOT NULL,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "answer_status" DEFAULT 'draft' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reporting_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"status" "period_status" DEFAULT 'collecting' NOT NULL,
	"locked_at" timestamp with time zone,
	"snapshot" jsonb,
	"snapshot_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"kind" "report_kind" DEFAULT 'csrd_lite' NOT NULL,
	"storage_key" text,
	"totals_snapshot" jsonb NOT NULL,
	"rendered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"country" text DEFAULT 'US' NOT NULL,
	"grid_region" text NOT NULL,
	"floor_area_sqm" integer DEFAULT 0 NOT NULL,
	"market_method" "market_method" DEFAULT 'residual_mix' NOT NULL,
	"renewable_share_pct" integer DEFAULT 0 NOT NULL,
	"contract_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spend_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"description" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"gl_account" text DEFAULT '' NOT NULL,
	"spend_date" date,
	"eeio_category" text,
	"classification_source" "classification_source",
	"classification_confidence_bp" integer,
	"classification_reason" text DEFAULT '' NOT NULL,
	"excluded" boolean DEFAULT false NOT NULL,
	"exclusion_reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "org_role" DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_lines" ADD CONSTRAINT "activity_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_lines" ADD CONSTRAINT "activity_lines_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_lines" ADD CONSTRAINT "activity_lines_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_lines" ADD CONSTRAINT "activity_lines_period_id_reporting_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."reporting_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_lines" ADD CONSTRAINT "activity_lines_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_blobs" ADD CONSTRAINT "document_blobs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_period_id_reporting_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."reporting_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emission_results" ADD CONSTRAINT "emission_results_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emission_results" ADD CONSTRAINT "emission_results_period_id_reporting_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."reporting_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emission_results" ADD CONSTRAINT "emission_results_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emission_results" ADD CONSTRAINT "emission_results_factor_id_emission_factors_id_fk" FOREIGN KEY ("factor_id") REFERENCES "public"."emission_factors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emission_results" ADD CONSTRAINT "emission_results_activity_line_id_activity_lines_id_fk" FOREIGN KEY ("activity_line_id") REFERENCES "public"."activity_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emission_results" ADD CONSTRAINT "emission_results_spend_line_id_spend_lines_id_fk" FOREIGN KEY ("spend_line_id") REFERENCES "public"."spend_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_answers" ADD CONSTRAINT "questionnaire_answers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_answers" ADD CONSTRAINT "questionnaire_answers_period_id_reporting_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."reporting_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_periods" ADD CONSTRAINT "reporting_periods_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_period_id_reporting_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."reporting_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_lines" ADD CONSTRAINT "spend_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_lines" ADD CONSTRAINT "spend_lines_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_lines" ADD CONSTRAINT "spend_lines_period_id_reporting_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."reporting_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_period_site_idx" ON "activity_lines" USING btree ("period_id","site_id");--> statement-breakpoint
CREATE INDEX "activity_document_idx" ON "activity_lines" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "audit_org_idx" ON "audit_log" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "documents_org_status_idx" ON "documents" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "documents_period_idx" ON "documents" USING btree ("period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_org_hash_unique" ON "documents" USING btree ("organization_id","content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "factors_unique" ON "emission_factors" USING btree ("factor_set","category","region","vintage");--> statement-breakpoint
CREATE INDEX "factors_lookup_idx" ON "emission_factors" USING btree ("scope","category","region");--> statement-breakpoint
CREATE INDEX "results_period_scope_idx" ON "emission_results" USING btree ("period_id","scope");--> statement-breakpoint
CREATE INDEX "results_period_site_idx" ON "emission_results" USING btree ("period_id","site_id");--> statement-breakpoint
CREATE INDEX "jobs_claim_idx" ON "jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "jobs_org_idx" ON "jobs" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "answers_unique" ON "questionnaire_answers" USING btree ("period_id","framework","question_key");--> statement-breakpoint
CREATE INDEX "answers_period_idx" ON "questionnaire_answers" USING btree ("period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "periods_org_year_unique" ON "reporting_periods" USING btree ("organization_id","year");--> statement-breakpoint
CREATE INDEX "reports_period_idx" ON "reports" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "sites_org_idx" ON "sites" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "spend_period_idx" ON "spend_lines" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "spend_document_idx" ON "spend_lines" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");