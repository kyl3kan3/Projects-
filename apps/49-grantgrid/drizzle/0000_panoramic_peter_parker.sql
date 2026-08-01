CREATE TYPE "public"."answer_kind" AS ENUM('mission_short', 'mission_long', 'program', 'budget', 'board_list', 'attachment', 'custom');--> statement-breakpoint
CREATE TYPE "public"."curation_status" AS ENUM('proposed', 'approved', 'retired');--> statement-breakpoint
CREATE TYPE "public"."deadline_kind" AS ENUM('loi', 'application', 'report', 'renewal', 'custom');--> statement-breakpoint
CREATE TYPE "public"."funder_kind" AS ENUM('private_foundation', 'community', 'corporate');--> statement-breakpoint
CREATE TYPE "public"."grant_source" AS ENUM('discovery', 'manual');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('seed', 'grow', 'field');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('sent', 'failed', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."grant_stage" AS ENUM('researching', 'loi', 'applying', 'submitted', 'awarded', 'declined', 'reporting', 'closed');--> statement-breakpoint
CREATE TYPE "public"."workspace_status" AS ENUM('todo', 'drafted', 'final');--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"grant_id" uuid,
	"actor" text NOT NULL,
	"event" text NOT NULL,
	"summary" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "answer_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"file_ref" text,
	"version" integer DEFAULT 1 NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deadlines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"grant_id" uuid NOT NULL,
	"kind" "deadline_kind" NOT NULL,
	"due_on" date NOT NULL,
	"label" text NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funder_awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"funder_id" uuid NOT NULL,
	"tax_year" integer NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_state" text,
	"amount_cents" bigint NOT NULL,
	"purpose_excerpt" text
);
--> statement-breakpoint
CREATE TABLE "funder_change_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"funder_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"note" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"ein" text NOT NULL,
	"kind" "funder_kind" NOT NULL,
	"city" text,
	"state" text,
	"states_funded" text[] DEFAULT '{}'::text[] NOT NULL,
	"cause_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"grant_size_min_cents" bigint,
	"grant_size_max_cents" bigint,
	"accepts_unsolicited" boolean,
	"application_url" text,
	"deadlines_note" text,
	"new_grantee_share" real,
	"data_freshness_at" date,
	"curation_status" "curation_status" DEFAULT 'proposed' NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"funder_id" uuid,
	"title" text NOT NULL,
	"funder_name" text NOT NULL,
	"stage" "grant_stage" DEFAULT 'researching' NOT NULL,
	"ask_amount_cents" bigint,
	"awarded_amount_cents" bigint,
	"award_restrictions" text,
	"owner_user_id" uuid,
	"notes" text,
	"source" "grant_source" DEFAULT 'manual' NOT NULL,
	"fit_score_at_add" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"plan" "plan" DEFAULT 'seed' NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"subscription_status" text,
	"profile" jsonb DEFAULT '{"mission":"","programs":"","budgetBand":"","serviceStates":[],"causeCodes":[],"ein":"","typicalAskCents":null}'::jsonb NOT NULL,
	"profile_version" integer DEFAULT 1 NOT NULL,
	"reminder_offsets" integer[] DEFAULT '{14,7,1}' NOT NULL,
	"ics_token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"deadline_id" uuid NOT NULL,
	"offset_days" integer NOT NULL,
	"scheduled_for" date NOT NULL,
	"sent_at" timestamp with time zone,
	"recipients" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "reminder_status" DEFAULT 'sent' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"grant_id" uuid NOT NULL,
	"requirement" text NOT NULL,
	"answer_id" uuid,
	"answer_source" text,
	"status" "workspace_status" DEFAULT 'todo' NOT NULL,
	"draft_body" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funder_awards" ADD CONSTRAINT "funder_awards_funder_id_funders_id_fk" FOREIGN KEY ("funder_id") REFERENCES "public"."funders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funder_change_reports" ADD CONSTRAINT "funder_change_reports_funder_id_funders_id_fk" FOREIGN KEY ("funder_id") REFERENCES "public"."funders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funder_change_reports" ADD CONSTRAINT "funder_change_reports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_funder_id_funders_id_fk" FOREIGN KEY ("funder_id") REFERENCES "public"."funders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_deadline_id_deadlines_id_fk" FOREIGN KEY ("deadline_id") REFERENCES "public"."deadlines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_items" ADD CONSTRAINT "workspace_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_items" ADD CONSTRAINT "workspace_items_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_items" ADD CONSTRAINT "workspace_items_answer_id_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."answers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_org_idx" ON "activity_log" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "answers_org_idx" ON "answers" USING btree ("organization_id","kind");--> statement-breakpoint
CREATE INDEX "deadlines_due_idx" ON "deadlines" USING btree ("due_on","completed_at");--> statement-breakpoint
CREATE INDEX "deadlines_grant_idx" ON "deadlines" USING btree ("grant_id");--> statement-breakpoint
CREATE INDEX "deadlines_org_idx" ON "deadlines" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "funder_awards_dedupe_key" ON "funder_awards" USING btree ("funder_id","tax_year","recipient_name","amount_cents");--> statement-breakpoint
CREATE INDEX "funder_awards_funder_idx" ON "funder_awards" USING btree ("funder_id","tax_year");--> statement-breakpoint
CREATE UNIQUE INDEX "funders_ein_key" ON "funders" USING btree ("ein");--> statement-breakpoint
CREATE INDEX "funders_curation_idx" ON "funders" USING btree ("curation_status");--> statement-breakpoint
CREATE INDEX "grants_org_stage_idx" ON "grants" USING btree ("organization_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_org_user_key" ON "memberships" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_deadline_offset_key" ON "reminders" USING btree ("deadline_id","offset_days");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "workspace_items_grant_idx" ON "workspace_items" USING btree ("grant_id","position");