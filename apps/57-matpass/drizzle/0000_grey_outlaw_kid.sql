CREATE TYPE "public"."billing_status" AS ENUM('trialing', 'active', 'past_due', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."candidate_status" AS ENUM('eligible', 'near_miss', 'invited', 'confirmed', 'promoted', 'held_back', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."checkin_source" AS ENUM('kiosk', 'desk', 'import');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('queued', 'sent', 'delivered', 'bounced', 'failed');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('active', 'paused', 'ended');--> statement-breakpoint
CREATE TYPE "public"."flag_status" AS ENUM('open', 'contacted', 'recovered', 'lost');--> statement-breakpoint
CREATE TYPE "public"."grading_event_status" AS ENUM('draft', 'inviting', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."kiosk_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('dojo', 'academy', 'federation');--> statement-breakpoint
CREATE TYPE "public"."membership_plan_interval" AS ENUM('month', 'year');--> statement-breakpoint
CREATE TYPE "public"."membership_plan_kind" AS ENUM('per_student', 'family_flat');--> statement-breakpoint
CREATE TYPE "public"."program_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('active', 'paused', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'past_due', 'paused', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'instructor', 'front_desk');--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"body_md" text NOT NULL,
	"audience" jsonb DEFAULT '{"all":true}'::jsonb NOT NULL,
	"sent_by" uuid,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"class_schedule_id" uuid,
	"checked_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" "checkin_source" DEFAULT 'kiosk' NOT NULL,
	"device_id" uuid,
	"client_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"location_id" uuid,
	"weekday" integer NOT NULL,
	"starts_at_minutes" integer NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"name" text NOT NULL,
	"instructor_id" uuid,
	"status" "program_status" DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"announcement_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"provider_message_id" text,
	"status" "delivery_status" DEFAULT 'queued' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"current_rank_id" uuid NOT NULL,
	"current_stripes" integer DEFAULT 0 NOT NULL,
	"promoted_at" timestamp with time zone NOT NULL,
	"status" "enrollment_status" DEFAULT 'active' NOT NULL,
	"signoff_by" uuid,
	"signoff_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"stripe_customer_id" text,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grading_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grading_event_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"eligibility" jsonb NOT NULL,
	"status" "candidate_status" DEFAULT 'eligible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grading_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"location_id" uuid,
	"name" text NOT NULL,
	"held_on" timestamp with time zone NOT NULL,
	"program_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "grading_event_status" DEFAULT 'draft' NOT NULL,
	"graded_by" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kiosk_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"location_id" uuid,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" "kiosk_status" DEFAULT 'active' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"interval" "membership_plan_interval" DEFAULT 'month' NOT NULL,
	"kind" "membership_plan_kind" DEFAULT 'per_student' NOT NULL,
	"stripe_price_id" text,
	"status" "program_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "program_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"from_rank_id" uuid NOT NULL,
	"from_stripes" integer NOT NULL,
	"to_rank_id" uuid NOT NULL,
	"to_stripes" integer NOT NULL,
	"promoted_on" timestamp with time zone NOT NULL,
	"grading_event_id" uuid,
	"graded_by" uuid,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ranks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"name" text NOT NULL,
	"display_order" integer NOT NULL,
	"belt_color_hex" text DEFAULT '#FFFFFF' NOT NULL,
	"stripes" integer DEFAULT 4 NOT NULL,
	"min_classes" integer DEFAULT 0 NOT NULL,
	"min_days_in_rank" integer DEFAULT 0 NOT NULL,
	"requires_signoff" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retention_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"flagged_on" timestamp with time zone DEFAULT now() NOT NULL,
	"baseline_per_week" numeric(4, 2) NOT NULL,
	"recent_per_week" numeric(4, 2) NOT NULL,
	"last_seen_on" timestamp with time zone,
	"status" "flag_status" DEFAULT 'open' NOT NULL,
	"outcome_note" text DEFAULT '' NOT NULL,
	"handled_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"plan" "plan" DEFAULT 'dojo' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_account_id" text,
	"billing_status" "billing_status" DEFAULT 'trialing' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"timezone" text DEFAULT 'America/Chicago' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"birthdate" timestamp with time zone,
	"photo_key" text,
	"kiosk_pin" text,
	"status" "student_status" DEFAULT 'active' NOT NULL,
	"joined_on" timestamp with time zone,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"membership_plan_id" uuid NOT NULL,
	"stripe_subscription_id" text,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"student_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_period_end" timestamp with time zone,
	"past_due_since" timestamp with time zone,
	"failed_payments" integer DEFAULT 0 NOT NULL,
	"last_dunning_on" text,
	"escalated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'front_desk' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_class_schedule_id_class_schedule_id_fk" FOREIGN KEY ("class_schedule_id") REFERENCES "public"."class_schedule"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_schedule" ADD CONSTRAINT "class_schedule_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_schedule" ADD CONSTRAINT "class_schedule_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_schedule" ADD CONSTRAINT "class_schedule_instructor_id_users_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_current_rank_id_ranks_id_fk" FOREIGN KEY ("current_rank_id") REFERENCES "public"."ranks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_signoff_by_users_id_fk" FOREIGN KEY ("signoff_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_candidates" ADD CONSTRAINT "grading_candidates_grading_event_id_grading_events_id_fk" FOREIGN KEY ("grading_event_id") REFERENCES "public"."grading_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_candidates" ADD CONSTRAINT "grading_candidates_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_events" ADD CONSTRAINT "grading_events_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_events" ADD CONSTRAINT "grading_events_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_events" ADD CONSTRAINT "grading_events_graded_by_users_id_fk" FOREIGN KEY ("graded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kiosk_devices" ADD CONSTRAINT "kiosk_devices_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kiosk_devices" ADD CONSTRAINT "kiosk_devices_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_from_rank_id_ranks_id_fk" FOREIGN KEY ("from_rank_id") REFERENCES "public"."ranks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_to_rank_id_ranks_id_fk" FOREIGN KEY ("to_rank_id") REFERENCES "public"."ranks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_grading_event_id_grading_events_id_fk" FOREIGN KEY ("grading_event_id") REFERENCES "public"."grading_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_graded_by_users_id_fk" FOREIGN KEY ("graded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranks" ADD CONSTRAINT "ranks_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_flags" ADD CONSTRAINT "retention_flags_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_flags" ADD CONSTRAINT "retention_flags_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_membership_plan_id_membership_plans_id_fk" FOREIGN KEY ("membership_plan_id") REFERENCES "public"."membership_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcements_school_idx" ON "announcements" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "audit_school_time_idx" ON "audit_log" USING btree ("school_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "checkins_client_key_unique" ON "checkins" USING btree ("client_key");--> statement-breakpoint
CREATE INDEX "checkins_enrollment_time_idx" ON "checkins" USING btree ("enrollment_id","checked_in_at");--> statement-breakpoint
CREATE INDEX "checkins_student_time_idx" ON "checkins" USING btree ("student_id","checked_in_at");--> statement-breakpoint
CREATE INDEX "schedule_program_idx" ON "class_schedule" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "deliveries_announcement_idx" ON "deliveries" USING btree ("announcement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_unique" ON "deliveries" USING btree ("announcement_id","family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_unique" ON "enrollments" USING btree ("student_id","program_id");--> statement-breakpoint
CREATE INDEX "enrollments_program_idx" ON "enrollments" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "families_school_idx" ON "families" USING btree ("school_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidates_unique" ON "grading_candidates" USING btree ("grading_event_id","enrollment_id");--> statement-breakpoint
CREATE INDEX "gradings_school_time_idx" ON "grading_events" USING btree ("school_id","held_on");--> statement-breakpoint
CREATE INDEX "kiosk_school_idx" ON "kiosk_devices" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "locations_school_idx" ON "locations" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "plans_school_idx" ON "membership_plans" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "programs_school_idx" ON "programs" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "promotions_enrollment_time_idx" ON "promotions" USING btree ("enrollment_id","promoted_on");--> statement-breakpoint
CREATE UNIQUE INDEX "ranks_order_unique" ON "ranks" USING btree ("program_id","display_order");--> statement-breakpoint
CREATE INDEX "flags_student_status_idx" ON "retention_flags" USING btree ("student_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "flags_one_open_per_student" ON "retention_flags" USING btree ("student_id") WHERE "retention_flags"."status" = 'open';--> statement-breakpoint
CREATE INDEX "students_school_status_idx" ON "students" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX "students_family_idx" ON "students" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "students_pin_unique" ON "students" USING btree ("school_id","kiosk_pin");--> statement-breakpoint
CREATE INDEX "subscriptions_family_idx" ON "subscriptions" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_school_idx" ON "users" USING btree ("school_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_external_unique" ON "webhook_events" USING btree ("provider","external_id");