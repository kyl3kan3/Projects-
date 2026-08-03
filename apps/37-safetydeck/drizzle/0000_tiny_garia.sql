CREATE TYPE "public"."case_outcome" AS ENUM('death', 'days_away', 'restricted', 'other_recordable');--> statement-breakpoint
CREATE TYPE "public"."cert_kind" AS ENUM('osha_10', 'osha_30', 'first_aid_cpr', 'fit_test', 'license', 'custom');--> statement-breakpoint
CREATE TYPE "public"."illness_category" AS ENUM('injury', 'skin_disorder', 'respiratory', 'poisoning', 'hearing_loss', 'other_illness');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('en', 'es');--> statement-breakpoint
CREATE TYPE "public"."osha_form_kind" AS ENUM('form_300', 'form_301', 'form_300a');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('crew', 'company', 'fleet');--> statement-breakpoint
CREATE TYPE "public"."reminder_channel" AS ENUM('email', 'sms');--> statement-breakpoint
CREATE TYPE "public"."reminder_rung" AS ENUM('60d', '30d', '7d', 'overdue', '300a_jan15', '300a_feb1', '300a_apr30');--> statement-breakpoint
CREATE TYPE "public"."reminder_target_kind" AS ENUM('cert', 'talk_missed', 'form_300a');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."talk_instance_status" AS ENUM('scheduled', 'delivered', 'in_progress', 'completed', 'missed');--> statement-breakpoint
CREATE TYPE "public"."talk_source" AS ENUM('seed', 'custom');--> statement-breakpoint
CREATE TYPE "public"."treatment" AS ENUM('none', 'first_aid', 'observation', 'medical', 'er', 'hospitalized', 'fatality');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'admin', 'viewer');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "binder_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"range_start" date NOT NULL,
	"range_end" date NOT NULL,
	"storage_key" text NOT NULL,
	"page_count" integer NOT NULL,
	"requested_by" text NOT NULL,
	"contents" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"kind" "cert_kind" NOT NULL,
	"label" text NOT NULL,
	"issued_on" date,
	"expires_on" date,
	"card_photo_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"plan" "plan" DEFAULT 'crew' NOT NULL,
	"subscription_status" "subscription_status" DEFAULT 'trialing' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"read_only" boolean DEFAULT false NOT NULL,
	"establishment_name" text,
	"street_address" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"naics_code" text,
	"industry_description" text,
	"settings" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"annual_avg_employees" integer,
	"total_hours_worked" integer,
	"certified_by_name" text,
	"certified_by_title" text,
	"certified_by_phone" text,
	"certified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"site_label" text,
	"foreman_name" text NOT NULL,
	"foreman_phone" text,
	"foreman_email" text,
	"talk_day" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"crew_id" uuid,
	"name" text NOT NULL,
	"job_title" text,
	"hire_date" date,
	"language" "language" DEFAULT 'en' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"case_number" integer NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"learned_at" timestamp with time zone NOT NULL,
	"site_label" text NOT NULL,
	"where_occurred" text,
	"description" text NOT NULL,
	"object_substance" text,
	"injury_type" text NOT NULL,
	"body_part" text,
	"illness_category" "illness_category" DEFAULT 'injury' NOT NULL,
	"treatment" "treatment" NOT NULL,
	"lost_consciousness" boolean DEFAULT false NOT NULL,
	"significant_diagnosis" boolean DEFAULT false NOT NULL,
	"days_away" integer DEFAULT 0 NOT NULL,
	"days_restricted" integer DEFAULT 0 NOT NULL,
	"still_counting" boolean DEFAULT false NOT NULL,
	"recordable" boolean NOT NULL,
	"needs_judgment" boolean DEFAULT false NOT NULL,
	"outcome" "case_outcome",
	"recordability_basis" jsonb NOT NULL,
	"form_logic_version" text NOT NULL,
	"privacy_case" boolean DEFAULT false NOT NULL,
	"privacy_reason" text,
	"reported_to_osha_at" timestamp with time zone,
	"osha_report_note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "osha_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"kind" "osha_form_kind" NOT NULL,
	"incident_id" uuid,
	"storage_key" text NOT NULL,
	"page_count" integer DEFAULT 1 NOT NULL,
	"form_logic_version" text NOT NULL,
	"certified_by" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"target_kind" "reminder_target_kind" NOT NULL,
	"target_id" text NOT NULL,
	"rung" "reminder_rung" NOT NULL,
	"channel" "reminder_channel" NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "sign_off_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"sign_off_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sign_offs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"talk_instance_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"signature_path" text NOT NULL,
	"signature_width" integer DEFAULT 320 NOT NULL,
	"signature_height" integer DEFAULT 160 NOT NULL,
	"signed_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"device_id" text NOT NULL,
	"captured_offline" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stored_objects" (
	"key" text PRIMARY KEY NOT NULL,
	"company_id" uuid,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "talk_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"crew_id" uuid NOT NULL,
	"talk_id" uuid NOT NULL,
	"week_of" date NOT NULL,
	"scheduled_for" date NOT NULL,
	"status" "talk_instance_status" DEFAULT 'scheduled' NOT NULL,
	"token_hash" text NOT NULL,
	"delivered_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"closed_by_foreman" boolean DEFAULT false NOT NULL,
	"absent_employee_ids" uuid[],
	"gps_lat" double precision,
	"gps_lng" double precision,
	"site_photo_key" text,
	"synced_from_offline" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "talks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"body_md" text NOT NULL,
	"hazard_tags" text[] DEFAULT '{}' NOT NULL,
	"language" "language" DEFAULT 'en' NOT NULL,
	"est_minutes" integer DEFAULT 5 NOT NULL,
	"source" "talk_source" DEFAULT 'seed' NOT NULL,
	"rotation_order" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "binder_exports" ADD CONSTRAINT "binder_exports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certs" ADD CONSTRAINT "certs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certs" ADD CONSTRAINT "certs_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_years" ADD CONSTRAINT "company_years_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crews" ADD CONSTRAINT "crews_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_crew_id_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "osha_forms" ADD CONSTRAINT "osha_forms_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "osha_forms" ADD CONSTRAINT "osha_forms_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sign_off_corrections" ADD CONSTRAINT "sign_off_corrections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sign_off_corrections" ADD CONSTRAINT "sign_off_corrections_sign_off_id_sign_offs_id_fk" FOREIGN KEY ("sign_off_id") REFERENCES "public"."sign_offs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sign_offs" ADD CONSTRAINT "sign_offs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sign_offs" ADD CONSTRAINT "sign_offs_talk_instance_id_talk_instances_id_fk" FOREIGN KEY ("talk_instance_id") REFERENCES "public"."talk_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sign_offs" ADD CONSTRAINT "sign_offs_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_objects" ADD CONSTRAINT "stored_objects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talk_instances" ADD CONSTRAINT "talk_instances_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talk_instances" ADD CONSTRAINT "talk_instances_crew_id_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talk_instances" ADD CONSTRAINT "talk_instances_talk_id_talks_id_fk" FOREIGN KEY ("talk_id") REFERENCES "public"."talks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talks" ADD CONSTRAINT "talks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_company_idx" ON "audit_log" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "binder_exports_company_idx" ON "binder_exports" USING btree ("company_id","generated_at");--> statement-breakpoint
CREATE INDEX "certs_company_expiry_idx" ON "certs" USING btree ("company_id","expires_on");--> statement-breakpoint
CREATE INDEX "certs_employee_idx" ON "certs" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_years_company_year_uq" ON "company_years" USING btree ("company_id","year");--> statement-breakpoint
CREATE INDEX "crews_company_idx" ON "crews" USING btree ("company_id","active");--> statement-breakpoint
CREATE INDEX "employees_company_idx" ON "employees" USING btree ("company_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "incidents_case_uq" ON "incidents" USING btree ("company_id","year","case_number");--> statement-breakpoint
CREATE INDEX "incidents_company_occurred_idx" ON "incidents" USING btree ("company_id","occurred_at");--> statement-breakpoint
CREATE INDEX "osha_forms_company_year_idx" ON "osha_forms" USING btree ("company_id","year","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_rung_uq" ON "reminders" USING btree ("target_kind","target_id","rung","channel");--> statement-breakpoint
CREATE INDEX "reminders_company_idx" ON "reminders" USING btree ("company_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sign_offs_instance_employee_uq" ON "sign_offs" USING btree ("talk_instance_id","employee_id");--> statement-breakpoint
CREATE INDEX "sign_offs_company_idx" ON "sign_offs" USING btree ("company_id","signed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "talk_instances_crew_week_uq" ON "talk_instances" USING btree ("crew_id","week_of");--> statement-breakpoint
CREATE UNIQUE INDEX "talk_instances_token_uq" ON "talk_instances" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "talk_instances_crew_sched_idx" ON "talk_instances" USING btree ("crew_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "talk_instances_company_idx" ON "talk_instances" USING btree ("company_id","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "talks_slug_uq" ON "talks" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");