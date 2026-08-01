-- pg_trgm powers the participant search the product is sold on (the GIN
-- indexes at the bottom of this file need it). Neon and vanilla Postgres both
-- allow this from a normal role.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."signing_channel" AS ENUM('qr', 'kiosk', 'link');--> statement-breakpoint
CREATE TYPE "public"."expiry_rule" AS ENUM('visit', 'days_365', 'forever');--> statement-breakpoint
CREATE TYPE "public"."export_kind" AS ENUM('signature_pdf', 'bulk_pdf', 'incident_pdf', 'csv');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('counter', 'front_desk', 'operator');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'manager', 'staff');--> statement-breakpoint
CREATE TYPE "public"."signature_kind" AS ENUM('typed', 'drawn');--> statement-breakpoint
CREATE TYPE "public"."waiver_status" AS ENUM('draft', 'live', 'archived');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"plan" "plan" DEFAULT 'counter' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"subscription_status" text,
	"settings" jsonb DEFAULT '{"posterFooter":true,"retentionYears":7,"digestHour":19}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"signature_id" uuid,
	"checked_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid,
	"kind" "export_kind" NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"s3_key" text,
	"byte_size" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"signature_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"where_text" text,
	"status" "incident_status" DEFAULT 'open' NOT NULL,
	"logged_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'America/Denver' NOT NULL,
	"kiosk_pin" text DEFAULT '2468' NOT NULL,
	"qr_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"dob" text,
	"is_minor" boolean DEFAULT false NOT NULL,
	"guardian_participant_id" uuid,
	"emergency_contact" jsonb,
	"flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"waiver_version_id" uuid NOT NULL,
	"waiver_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"waiver_title" text NOT NULL,
	"waiver_version" integer NOT NULL,
	"signed_text" text NOT NULL,
	"signed_blocks" jsonb NOT NULL,
	"text_hash" text NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"initials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"disclosure_text" text NOT NULL,
	"disclosure_accepted_at" timestamp with time zone NOT NULL,
	"signer_name" text NOT NULL,
	"signed_by_participant_id" uuid,
	"guardian_relationship" text,
	"signer_age_years" integer,
	"minor_at_signing" boolean DEFAULT false NOT NULL,
	"age_of_majority_at_signing" integer DEFAULT 18 NOT NULL,
	"resign_at_majority" boolean DEFAULT true NOT NULL,
	"signature_kind" "signature_kind" NOT NULL,
	"signature_data" text NOT NULL,
	"signature_asset_key" text,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"expiry_rule" "expiry_rule" NOT NULL,
	"ip" text,
	"user_agent" text,
	"channel" "signing_channel" NOT NULL,
	"offline_key" text,
	"captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waiver_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"waiver_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"body_blocks" jsonb NOT NULL,
	"expiry_rule" "expiry_rule" NOT NULL,
	"minor_rule" jsonb NOT NULL,
	"text_hash" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "waiver_status" DEFAULT 'draft' NOT NULL,
	"expiry_rule" "expiry_rule" DEFAULT 'days_365' NOT NULL,
	"minor_rule" jsonb DEFAULT '{"ageOfMajority":18,"relationshipOptions":["Parent","Legal guardian","Grandparent","Adult sibling"],"guardianSignsForSelf":false,"resignAtMajority":true}'::jsonb NOT NULL,
	"activity_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"draft_blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_signature_id_signatures_id_fk" FOREIGN KEY ("signature_id") REFERENCES "public"."signatures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_by_user_id_users_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_participants" ADD CONSTRAINT "incident_participants_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_participants" ADD CONSTRAINT "incident_participants_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_participants" ADD CONSTRAINT "incident_participants_signature_id_signatures_id_fk" FOREIGN KEY ("signature_id") REFERENCES "public"."signatures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_logged_by_user_id_users_id_fk" FOREIGN KEY ("logged_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_waiver_version_id_waiver_versions_id_fk" FOREIGN KEY ("waiver_version_id") REFERENCES "public"."waiver_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_waiver_id_waivers_id_fk" FOREIGN KEY ("waiver_id") REFERENCES "public"."waivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_signed_by_participant_id_participants_id_fk" FOREIGN KEY ("signed_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiver_versions" ADD CONSTRAINT "waiver_versions_waiver_id_waivers_id_fk" FOREIGN KEY ("waiver_id") REFERENCES "public"."waivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiver_versions" ADD CONSTRAINT "waiver_versions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waivers" ADD CONSTRAINT "waivers_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkins_location_time_idx" ON "checkins" USING btree ("location_id","checked_in_at");--> statement-breakpoint
CREATE UNIQUE INDEX "incident_participants_uq" ON "incident_participants" USING btree ("incident_id","participant_id");--> statement-breakpoint
CREATE INDEX "incidents_account_time_idx" ON "incidents" USING btree ("account_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_qr_token_uq" ON "locations" USING btree ("qr_token");--> statement-breakpoint
CREATE INDEX "locations_account_idx" ON "locations" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "participants_account_idx" ON "participants" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "participants_guardian_idx" ON "participants" USING btree ("guardian_participant_id");--> statement-breakpoint
CREATE INDEX "participants_name_trgm" ON "participants" USING gin ((lower("first_name") || ' ' || lower("last_name")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "participants_email_trgm" ON "participants" USING gin (lower(coalesce("email", '')) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "participants_phone_trgm" ON "participants" USING gin (coalesce("phone", '') gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "signatures_offline_key_uq" ON "signatures" USING btree ("offline_key");--> statement-breakpoint
CREATE INDEX "signatures_participant_idx" ON "signatures" USING btree ("participant_id","signed_at");--> statement-breakpoint
CREATE INDEX "signatures_account_signed_idx" ON "signatures" USING btree ("account_id","signed_at");--> statement-breakpoint
CREATE INDEX "signatures_expires_idx" ON "signatures" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "signatures_location_signed_idx" ON "signatures" USING btree ("location_id","signed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "waiver_versions_waiver_version_uq" ON "waiver_versions" USING btree ("waiver_id","version");--> statement-breakpoint
CREATE INDEX "waiver_versions_waiver_idx" ON "waiver_versions" USING btree ("waiver_id");--> statement-breakpoint
CREATE INDEX "waivers_account_idx" ON "waivers" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_stripe_id_uq" ON "webhook_events" USING btree ("stripe_event_id");