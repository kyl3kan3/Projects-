CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text DEFAULT '' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crew_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "export_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payroll_export_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"regular_centihours" integer DEFAULT 0 NOT NULL,
	"overtime_centihours" integer DEFAULT 0 NOT NULL,
	"time_entry_ids" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"label" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"radius_m" integer DEFAULT 150 NOT NULL,
	"timezone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"job_site_id" uuid,
	"name" text NOT NULL,
	"client_name" text DEFAULT '' NOT NULL,
	"bid_labor_minutes" integer,
	"bid_labor_cost_cents" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone,
	"budget_alert_80_sent_at" timestamp with time zone,
	"budget_alert_100_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"plan" text DEFAULT 'crew' NOT NULL,
	"timezone" text DEFAULT 'America/Chicago' NOT NULL,
	"week_starts_on" integer DEFAULT 0 NOT NULL,
	"ot_weekly_threshold_hours" integer DEFAULT 40 NOT NULL,
	"max_shift_hours" integer DEFAULT 14 NOT NULL,
	"auto_break_minutes" integer DEFAULT 0 NOT NULL,
	"auto_break_after_hours" integer DEFAULT 6 NOT NULL,
	"pay_period" text DEFAULT 'weekly' NOT NULL,
	"default_locale" text DEFAULT 'en' NOT NULL,
	"alert_email" text,
	"alert_phone" text,
	"sms_alerts_enabled" boolean DEFAULT false NOT NULL,
	"adp_company_code" text,
	"stripe_customer_id" text,
	"trial_ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overtime_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"hours_to_date" double precision NOT NULL,
	"projected_hours" double precision NOT NULL,
	"threshold_hours" double precision NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"sent_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pay_period_approvals" (
	"organization_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entry_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "pay_period_approvals_organization_id_period_start_period_end_pk" PRIMARY KEY("organization_id","period_start","period_end")
);
--> statement-breakpoint
CREATE TABLE "payroll_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"format" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"file_key" text DEFAULT '' NOT NULL,
	"csv" text,
	"checksum" text,
	"row_count" integer DEFAULT 0 NOT NULL,
	"total_centihours" integer DEFAULT 0 NOT NULL,
	"generated_by" uuid,
	"delivered_to" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"price_id" text,
	"plan" text NOT NULL,
	"status" text NOT NULL,
	"seat_count" integer DEFAULT 1 NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"clock_in_at" timestamp with time zone NOT NULL,
	"clock_out_at" timestamp with time zone,
	"break_seconds" integer DEFAULT 0 NOT NULL,
	"break_started_at" timestamp with time zone,
	"in_lat" double precision,
	"in_lng" double precision,
	"in_accuracy_m" double precision,
	"in_distance_m" double precision,
	"geofence_status_in" text,
	"out_lat" double precision,
	"out_lng" double precision,
	"out_accuracy_m" double precision,
	"out_distance_m" double precision,
	"geofence_status_out" text,
	"source" text DEFAULT 'live' NOT NULL,
	"client_event_id" text NOT NULL,
	"device_fingerprint" text,
	"rate_cents_per_hour" integer DEFAULT 0 NOT NULL,
	"flags" text[] DEFAULT '{}' NOT NULL,
	"edited" boolean DEFAULT false NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entry_edits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"time_entry_id" uuid NOT NULL,
	"edited_by" uuid,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"reason" text NOT NULL,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"role" text DEFAULT 'crew' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"hourly_cost_cents" integer DEFAULT 0 NOT NULL,
	"overtime_rule" text DEFAULT 'weekly_40' NOT NULL,
	"password_hash" text,
	"crew_code" text,
	"pin_hash" text,
	"claimed_at" timestamp with time zone,
	"payroll_file_number" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_crew_code_unique" UNIQUE("crew_code")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb,
	"processed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_events_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_assignments" ADD CONSTRAINT "crew_assignments_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_assignments" ADD CONSTRAINT "crew_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_line_items" ADD CONSTRAINT "export_line_items_payroll_export_id_payroll_exports_id_fk" FOREIGN KEY ("payroll_export_id") REFERENCES "public"."payroll_exports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_line_items" ADD CONSTRAINT "export_line_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_sites" ADD CONSTRAINT "job_sites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_job_site_id_job_sites_id_fk" FOREIGN KEY ("job_site_id") REFERENCES "public"."job_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_alerts" ADD CONSTRAINT "overtime_alerts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_alerts" ADD CONSTRAINT "overtime_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_period_approvals" ADD CONSTRAINT "pay_period_approvals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_period_approvals" ADD CONSTRAINT "pay_period_approvals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_exports" ADD CONSTRAINT "payroll_exports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_exports" ADD CONSTRAINT "payroll_exports_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_edits" ADD CONSTRAINT "time_entry_edits_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_edits" ADD CONSTRAINT "time_entry_edits_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_org_idx" ON "audit_log" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crew_assignments_job_user_idx" ON "crew_assignments" USING btree ("job_id","user_id");--> statement-breakpoint
CREATE INDEX "export_line_items_export_idx" ON "export_line_items" USING btree ("payroll_export_id");--> statement-breakpoint
CREATE INDEX "job_sites_org_idx" ON "job_sites" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "jobs_org_status_idx" ON "jobs" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "overtime_alerts_user_week_idx" ON "overtime_alerts" USING btree ("user_id","week_start");--> statement-breakpoint
CREATE INDEX "payroll_exports_org_idx" ON "payroll_exports" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "time_entries_client_event_idx" ON "time_entries" USING btree ("organization_id","client_event_id");--> statement-breakpoint
CREATE INDEX "time_entries_user_time_idx" ON "time_entries" USING btree ("user_id","clock_in_at");--> statement-breakpoint
CREATE INDEX "time_entries_job_time_idx" ON "time_entries" USING btree ("job_id","clock_in_at");--> statement-breakpoint
CREATE INDEX "time_entries_org_time_idx" ON "time_entries" USING btree ("organization_id","clock_in_at");--> statement-breakpoint
CREATE INDEX "time_entry_edits_entry_idx" ON "time_entry_edits" USING btree ("time_entry_id","edited_at");--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("organization_id","active");