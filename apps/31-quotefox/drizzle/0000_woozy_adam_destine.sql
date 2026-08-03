CREATE TYPE "public"."deposit_status" AS ENUM('pending', 'paid', 'refunded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."deposit_type" AS ENUM('none', 'percent', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."estimate_status" AS ENUM('drafting', 'draft', 'ready', 'sent');--> statement-breakpoint
CREATE TYPE "public"."item_kind" AS ENUM('labor', 'material', 'flat_rate');--> statement-breakpoint
CREATE TYPE "public"."item_source" AS ENUM('manual', 'csv_import', 'template');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('open', 'quoted', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."line_item_source" AS ENUM('ai', 'manual');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('audio', 'photo');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('solo', 'crew', 'fleet');--> statement-breakpoint
CREATE TYPE "public"."proposal_event_type" AS ENUM('sent', 'delivered', 'viewed', 'accepted', 'deposit_initiated', 'deposit_paid', 'deposit_refunded', 'nudge_sent', 'expired', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('sent', 'viewed', 'accepted', 'deposit_paid', 'expired', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'estimator', 'tech');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled', 'trial_expired');--> statement-breakpoint
CREATE TYPE "public"."trade" AS ENUM('hvac', 'roofing', 'electrical', 'plumbing', 'other');--> statement-breakpoint
CREATE TYPE "public"."transcript_source" AS ENUM('whisper', 'demo_fixture');--> statement-breakpoint
CREATE TYPE "public"."unit" AS ENUM('each', 'hour', 'sqft', 'lf', 'day');--> statement-breakpoint
CREATE TYPE "public"."upload_status" AS ENUM('pending', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."walkthrough_status" AS ENUM('capturing', 'uploaded', 'transcribing', 'drafting', 'drafted', 'failed');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deposits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"stripe_account_id" text,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"status" "deposit_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimate_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"price_book_item_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"quantity_milli" integer DEFAULT 1000 NOT NULL,
	"unit" "unit" DEFAULT 'each' NOT NULL,
	"unit_price_cents" integer DEFAULT 0 NOT NULL,
	"line_total_cents" integer DEFAULT 0 NOT NULL,
	"needs_pricing" boolean DEFAULT false NOT NULL,
	"source" "line_item_source" DEFAULT 'manual' NOT NULL,
	"transcript_excerpt" text,
	"transcript_offset_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"walkthrough_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "estimate_status" DEFAULT 'draft' NOT NULL,
	"scope_summary" text,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"tax_rate_bp" integer DEFAULT 0 NOT NULL,
	"deposit_type" "deposit_type" DEFAULT 'none' NOT NULL,
	"deposit_value" integer DEFAULT 0 NOT NULL,
	"drafted_by_model" text,
	"prompt_version" text,
	"draft_duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text,
	"customer_phone" text,
	"address" text NOT NULL,
	"state_code" text,
	"trade" "trade" DEFAULT 'hvac' NOT NULL,
	"title" text NOT NULL,
	"status" "job_status" DEFAULT 'open' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"trade" "trade" DEFAULT 'hvac' NOT NULL,
	"plan" "plan" DEFAULT 'solo' NOT NULL,
	"subscription_status" "subscription_status" DEFAULT 'trialing' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"billing_stripe_customer_id" text,
	"billing_stripe_subscription_id" text,
	"stripe_connect_account_id" text,
	"stripe_connect_ready" boolean DEFAULT false NOT NULL,
	"license_number" text,
	"insurance_line" text,
	"brand_color" text DEFAULT '#CD7A29' NOT NULL,
	"logo_key" text,
	"phone" text,
	"address" text,
	"default_markup_pct" integer DEFAULT 35 NOT NULL,
	"tax_rate_bp" integer DEFAULT 0 NOT NULL,
	"default_deposit_type" "deposit_type" DEFAULT 'percent' NOT NULL,
	"default_deposit_value" integer DEFAULT 10 NOT NULL,
	"terms_text" text,
	"onboarded_at" timestamp with time zone,
	"quote_count_current_period" integer DEFAULT 0 NOT NULL,
	"period_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_book_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" "item_kind" DEFAULT 'material' NOT NULL,
	"unit" "unit" DEFAULT 'each' NOT NULL,
	"unit_cost_cents" integer NOT NULL,
	"markup_pct" integer,
	"search_text" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source" "item_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"type" "proposal_event_type" NOT NULL,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_nudges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"rung" integer NOT NULL,
	"sent_at" timestamp with time zone,
	"skipped_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"estimate_id" uuid NOT NULL,
	"token_id" text NOT NULL,
	"status" "proposal_status" DEFAULT 'sent' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"first_viewed_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"accepted_by_name" text,
	"acceptance_ip" text,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"deposit_cents" integer DEFAULT 0 NOT NULL,
	"scope_summary" text,
	"terms_text" text,
	"pdf_key" text,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" "role" DEFAULT 'owner' NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "walkthrough_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"walkthrough_id" uuid NOT NULL,
	"kind" "media_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"caption" text,
	"upload_status" "upload_status" DEFAULT 'pending' NOT NULL,
	"upload_attempts" integer DEFAULT 0 NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "walkthroughs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"recorded_by" uuid,
	"status" "walkthrough_status" DEFAULT 'capturing' NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"transcript" text,
	"transcript_source" "transcript_source",
	"transcript_confidence" integer,
	"failure_reason" text,
	"audio_seconds" integer DEFAULT 0 NOT NULL,
	"started_processing_at" timestamp with time zone,
	"drafted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text DEFAULT 'stripe' NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_line_items" ADD CONSTRAINT "estimate_line_items_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_line_items" ADD CONSTRAINT "estimate_line_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_line_items" ADD CONSTRAINT "estimate_line_items_price_book_item_id_price_book_items_id_fk" FOREIGN KEY ("price_book_item_id") REFERENCES "public"."price_book_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_walkthrough_id_walkthroughs_id_fk" FOREIGN KEY ("walkthrough_id") REFERENCES "public"."walkthroughs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_book_items" ADD CONSTRAINT "price_book_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_events" ADD CONSTRAINT "proposal_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_events" ADD CONSTRAINT "proposal_events_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_nudges" ADD CONSTRAINT "proposal_nudges_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_nudges" ADD CONSTRAINT "proposal_nudges_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walkthrough_media" ADD CONSTRAINT "walkthrough_media_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walkthrough_media" ADD CONSTRAINT "walkthrough_media_walkthrough_id_walkthroughs_id_fk" FOREIGN KEY ("walkthrough_id") REFERENCES "public"."walkthroughs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walkthroughs" ADD CONSTRAINT "walkthroughs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walkthroughs" ADD CONSTRAINT "walkthroughs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walkthroughs" ADD CONSTRAINT "walkthroughs_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_org_idx" ON "audit_log" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "dep_proposal_idx" ON "deposits" USING btree ("proposal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dep_session_key" ON "deposits" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE INDEX "eli_estimate_position_idx" ON "estimate_line_items" USING btree ("estimate_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "est_job_version_key" ON "estimates" USING btree ("job_id","version");--> statement-breakpoint
CREATE INDEX "est_org_status_idx" ON "estimates" USING btree ("organization_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "jobs_org_status_idx" ON "jobs" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "pbi_org_active_idx" ON "price_book_items" USING btree ("organization_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "pbi_org_category_name_key" ON "price_book_items" USING btree ("organization_id","category","name");--> statement-breakpoint
CREATE INDEX "pe_proposal_idx" ON "proposal_events" USING btree ("proposal_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pn_proposal_rung_key" ON "proposal_nudges" USING btree ("proposal_id","rung");--> statement-breakpoint
CREATE UNIQUE INDEX "prop_token_key" ON "proposals" USING btree ("token_id");--> statement-breakpoint
CREATE INDEX "prop_org_status_idx" ON "proposals" USING btree ("organization_id","status","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "wm_walkthrough_idx" ON "walkthrough_media" USING btree ("walkthrough_id","kind","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "wm_key_key" ON "walkthrough_media" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "wt_job_idx" ON "walkthroughs" USING btree ("job_id","created_at");