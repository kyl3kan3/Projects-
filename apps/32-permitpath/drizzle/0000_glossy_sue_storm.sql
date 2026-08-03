CREATE TYPE "public"."alert_state" AS ENUM('scheduled', 'sent', 'skipped', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('not_submitted', 'in_review', 'issued', 'expired', 'stop_work');--> statement-breakpoint
CREATE TYPE "public"."change_origin" AS ENUM('crawl_diff', 'contribution', 'curator');--> statement-breakpoint
CREATE TYPE "public"."checklist_item_kind" AS ENUM('permit', 'document', 'fee', 'inspection_note', 'license_check');--> statement-breakpoint
CREATE TYPE "public"."contribution_review_state" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."coverage_status" AS ENUM('curated', 'partial', 'requested');--> statement-breakpoint
CREATE TYPE "public"."credential_kind" AS ENUM('contractor_license', 'trade_registration', 'business_license', 'insurance_cert');--> statement-breakpoint
CREATE TYPE "public"."expiry_alert_tier" AS ENUM('t60', 't30', 't7', 't1');--> statement-breakpoint
CREATE TYPE "public"."expiry_subject_type" AS ENUM('license', 'permit_application');--> statement-breakpoint
CREATE TYPE "public"."inspection_result" AS ENUM('pending', 'passed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."jurisdiction_kind" AS ENUM('city', 'county', 'state', 'special_district');--> statement-breakpoint
CREATE TYPE "public"."org_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."permit_expiry_basis" AS ENUM('issuance', 'last_inspection');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('crew', 'company', 'regional');--> statement-breakpoint
CREATE TYPE "public"."plan_interval" AS ENUM('month', 'year');--> statement-breakpoint
CREATE TYPE "public"."review_state" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('official_page', 'phone_confirmation', 'contribution');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('active', 'broken', 'paused');--> statement-breakpoint
CREATE TYPE "public"."verification_state" AS ENUM('open', 'verified', 'na');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"actor" text NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"requirement_change_id" uuid NOT NULL,
	"state" "alert_state" DEFAULT 'scheduled' NOT NULL,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sent_at" timestamp with time zone,
	"resend_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checklist_id" uuid NOT NULL,
	"kind" "checklist_item_kind" NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"state" "verification_state" DEFAULT 'open' NOT NULL,
	"na_reason" text,
	"verified_by_user_id" uuid,
	"verified_at" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL,
	"slug" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"requirement_record_id" uuid NOT NULL,
	"proposed_changes" jsonb NOT NULL,
	"evidence" text NOT NULL,
	"review_state" "contribution_review_state" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"credit_cents_awarded" integer,
	"resulting_record_id" uuid,
	"reputation_at_submit" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coverage_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"jurisdiction_id" uuid,
	"jurisdiction_name" text,
	"job_type" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expiry_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subject_type" "expiry_subject_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"tier" "expiry_alert_tier" NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"subject_expires_at" timestamp with time zone NOT NULL,
	"state" "alert_state" DEFAULT 'scheduled' NOT NULL,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sent_at" timestamp with time zone,
	"resend_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"permit_application_id" uuid NOT NULL,
	"inspection_type" text NOT NULL,
	"scheduled_for" timestamp with time zone,
	"contact_notes" text,
	"lead_time_days" integer,
	"result" "inspection_result" DEFAULT 'pending' NOT NULL,
	"reinspection_fee_cents" integer,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"label" text NOT NULL,
	"site_address" text NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"job_type" text NOT NULL,
	"status" "job_status" DEFAULT 'active' NOT NULL,
	"assigned_user_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jurisdiction_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"url" text NOT NULL,
	"label" text NOT NULL,
	"selector" text,
	"crawl_frequency_hours" integer DEFAULT 72 NOT NULL,
	"last_crawled_at" timestamp with time zone,
	"last_snapshot_hash" text,
	"last_snapshot" text,
	"status" "source_status" DEFAULT 'active' NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jurisdiction_watches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jurisdictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"state" text NOT NULL,
	"county" text,
	"kind" "jurisdiction_kind" DEFAULT 'city' NOT NULL,
	"department_name" text NOT NULL,
	"contact" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"portal_url" text,
	"coverage_status" "coverage_status" DEFAULT 'requested' NOT NULL,
	"permit_valid_days" integer DEFAULT 180 NOT NULL,
	"permit_expiry_basis" "permit_expiry_basis" DEFAULT 'last_inspection' NOT NULL,
	"curated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "licenses_and_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "credential_kind" NOT NULL,
	"issuing_authority" text NOT NULL,
	"number" text NOT NULL,
	"holder" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"renewal_url" text,
	"assigned_user_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"plan" "plan" DEFAULT 'crew' NOT NULL,
	"plan_interval" "plan_interval" DEFAULT 'month' NOT NULL,
	"trade_focus" text,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"subscription_status" text,
	"current_period_end" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"contribution_credit_cents" integer DEFAULT 0 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permit_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"permit_name" text NOT NULL,
	"jurisdiction_ref_number" text,
	"status" "application_status" DEFAULT 'not_submitted' NOT NULL,
	"status_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"submitted_at" timestamp with time zone,
	"issued_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permit_checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"requirement_record_id" uuid NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fully_stamped_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "requirement_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"requirement_record_id" uuid,
	"previous_record_id" uuid,
	"source_id" uuid,
	"job_type" text,
	"origin" "change_origin" NOT NULL,
	"diff_summary" text NOT NULL,
	"raw_diff" text,
	"review_state" "review_state" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"alerted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requirement_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"job_type" text NOT NULL,
	"permits_required" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"submittal_requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"review_timeline" text NOT NULL,
	"quirks" text,
	"inspection_sequence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"inspection_contact" text,
	"inspection_lead_time_days" integer,
	"reinspection_fee_cents" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"source_id" uuid,
	"source_kind" "source_kind" DEFAULT 'official_page' NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_by" text NOT NULL,
	"verified_by_user_id" uuid,
	"superseded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"password_hash" text NOT NULL,
	"role" "org_role" DEFAULT 'member' NOT NULL,
	"is_curator" boolean DEFAULT false NOT NULL,
	"contributor_reputation" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_alerts" ADD CONSTRAINT "change_alerts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_alerts" ADD CONSTRAINT "change_alerts_requirement_change_id_requirement_changes_id_fk" FOREIGN KEY ("requirement_change_id") REFERENCES "public"."requirement_changes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_checklist_id_permit_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."permit_checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_requirement_record_id_requirement_records_id_fk" FOREIGN KEY ("requirement_record_id") REFERENCES "public"."requirement_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_resulting_record_id_requirement_records_id_fk" FOREIGN KEY ("resulting_record_id") REFERENCES "public"."requirement_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_requests" ADD CONSTRAINT "coverage_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_requests" ADD CONSTRAINT "coverage_requests_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expiry_alerts" ADD CONSTRAINT "expiry_alerts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_permit_application_id_permit_applications_id_fk" FOREIGN KEY ("permit_application_id") REFERENCES "public"."permit_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jurisdiction_sources" ADD CONSTRAINT "jurisdiction_sources_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jurisdiction_watches" ADD CONSTRAINT "jurisdiction_watches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jurisdiction_watches" ADD CONSTRAINT "jurisdiction_watches_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licenses_and_credentials" ADD CONSTRAINT "licenses_and_credentials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licenses_and_credentials" ADD CONSTRAINT "licenses_and_credentials_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permit_applications" ADD CONSTRAINT "permit_applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permit_checklists" ADD CONSTRAINT "permit_checklists_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permit_checklists" ADD CONSTRAINT "permit_checklists_requirement_record_id_requirement_records_id_fk" FOREIGN KEY ("requirement_record_id") REFERENCES "public"."requirement_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_changes" ADD CONSTRAINT "requirement_changes_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_changes" ADD CONSTRAINT "requirement_changes_requirement_record_id_requirement_records_id_fk" FOREIGN KEY ("requirement_record_id") REFERENCES "public"."requirement_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_changes" ADD CONSTRAINT "requirement_changes_previous_record_id_requirement_records_id_fk" FOREIGN KEY ("previous_record_id") REFERENCES "public"."requirement_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_changes" ADD CONSTRAINT "requirement_changes_source_id_jurisdiction_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."jurisdiction_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_changes" ADD CONSTRAINT "requirement_changes_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_records" ADD CONSTRAINT "requirement_records_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_records" ADD CONSTRAINT "requirement_records_source_id_jurisdiction_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."jurisdiction_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_records" ADD CONSTRAINT "requirement_records_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_records" ADD CONSTRAINT "requirement_records_superseded_by_requirement_records_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."requirement_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "audit_log" USING btree ("target");--> statement-breakpoint
CREATE UNIQUE INDEX "change_alert_unique" ON "change_alerts" USING btree ("organization_id","requirement_change_id");--> statement-breakpoint
CREATE INDEX "change_alert_due_idx" ON "change_alerts" USING btree ("state");--> statement-breakpoint
CREATE INDEX "checklist_items_checklist_idx" ON "checklist_items" USING btree ("checklist_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_items_slug_unique" ON "checklist_items" USING btree ("checklist_id","slug");--> statement-breakpoint
CREATE INDEX "contributions_state_idx" ON "contributions" USING btree ("review_state","created_at");--> statement-breakpoint
CREATE INDEX "contributions_record_idx" ON "contributions" USING btree ("requirement_record_id");--> statement-breakpoint
CREATE INDEX "coverage_requests_org_idx" ON "coverage_requests" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expiry_alert_rung_unique" ON "expiry_alerts" USING btree ("subject_type","subject_id","tier");--> statement-breakpoint
CREATE INDEX "expiry_alert_due_idx" ON "expiry_alerts" USING btree ("state","scheduled_for");--> statement-breakpoint
CREATE INDEX "inspections_application_idx" ON "inspections" USING btree ("permit_application_id");--> statement-breakpoint
CREATE INDEX "jobs_org_status_idx" ON "jobs" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "jobs_jurisdiction_idx" ON "jobs" USING btree ("jurisdiction_id");--> statement-breakpoint
CREATE INDEX "sources_due_idx" ON "jurisdiction_sources" USING btree ("status","last_crawled_at");--> statement-breakpoint
CREATE INDEX "sources_jurisdiction_idx" ON "jurisdiction_sources" USING btree ("jurisdiction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "watch_unique" ON "jurisdiction_watches" USING btree ("organization_id","jurisdiction_id");--> statement-breakpoint
CREATE INDEX "watch_jurisdiction_idx" ON "jurisdiction_watches" USING btree ("jurisdiction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jurisdictions_slug_unique" ON "jurisdictions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "licenses_org_expiry_idx" ON "licenses_and_credentials" USING btree ("organization_id","expires_at");--> statement-breakpoint
CREATE INDEX "applications_job_idx" ON "permit_applications" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "applications_expiry_idx" ON "permit_applications" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_job_unique" ON "permit_checklists" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "changes_review_idx" ON "requirement_changes" USING btree ("review_state","created_at");--> statement-breakpoint
CREATE INDEX "changes_jurisdiction_idx" ON "requirement_changes" USING btree ("jurisdiction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_current_unique" ON "requirement_records" USING btree ("jurisdiction_id","job_type") WHERE superseded_by is null;--> statement-breakpoint
CREATE INDEX "requirement_pair_idx" ON "requirement_records" USING btree ("jurisdiction_id","job_type");--> statement-breakpoint
CREATE INDEX "requirement_superseded_idx" ON "requirement_records" USING btree ("superseded_by");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_event_unique" ON "webhook_events" USING btree ("provider","provider_event_id");