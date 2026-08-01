CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" uuid,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"trade_package_id" uuid NOT NULL,
	"bid_id" uuid NOT NULL,
	"awarded_by" uuid,
	"award_note" text,
	"awarded_total_cents" integer DEFAULT 0 NOT NULL,
	"notifications_sent_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bid_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bid_id" uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"storage_driver" text DEFAULT 'db' NOT NULL,
	"filename" text NOT NULL,
	"content_type" text DEFAULT 'application/octet-stream' NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bid_form_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_package_id" uuid NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"unit" text,
	"quantity" text,
	"is_alternate" boolean DEFAULT false NOT NULL,
	"is_allowance" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bid_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bid_id" uuid NOT NULL,
	"bid_form_line_id" uuid,
	"raw_description" text NOT NULL,
	"state" text DEFAULT 'priced' NOT NULL,
	"amount_cents" integer,
	"mapping_status" text DEFAULT 'matched' NOT NULL,
	"mapped_by" text DEFAULT 'system' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"trade_package_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"kind" text DEFAULT 'itemized' NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"inclusions" text[] DEFAULT '{}' NOT NULL,
	"exclusions" text[] DEFAULT '{}' NOT NULL,
	"notes" text,
	"is_draft" boolean DEFAULT true NOT NULL,
	"submitted_at" timestamp with time zone,
	"superseded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"plan" text DEFAULT 'crew' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"reply_to_email" text,
	"logo_key" text,
	"settings" jsonb DEFAULT '{"reminderDays":[7,3,1],"portalNote":null}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"invitation_id" uuid,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"to_address" text NOT NULL,
	"subject" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"error" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_blobs" (
	"key" text PRIMARY KEY NOT NULL,
	"data" "bytea" NOT NULL,
	"size" integer NOT NULL,
	"content_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"trade_package_id" uuid NOT NULL,
	"sub_company_id" uuid NOT NULL,
	"sub_contact_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"token_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"status" text DEFAULT 'sent' NOT NULL,
	"personal_note" text,
	"opened_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"decline_reason" text,
	"last_reminder_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leveling_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"trade_package_id" uuid NOT NULL,
	"bid_id" uuid,
	"bid_form_line_id" uuid,
	"kind" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"trade_package_id" uuid,
	"storage_key" text NOT NULL,
	"storage_driver" text DEFAULT 'db' NOT NULL,
	"filename" text NOT NULL,
	"content_type" text DEFAULT 'application/octet-stream' NOT NULL,
	"version_label" text NOT NULL,
	"bytes" integer NOT NULL,
	"uploaded_by" uuid,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"bid_due_at" timestamp with time zone NOT NULL,
	"owner_meeting_at" timestamp with time zone,
	"status" text DEFAULT 'bidding' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"trade_package_id" uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"body" text NOT NULL,
	"answer_body" text,
	"answered_at" timestamp with time zone,
	"broadcast_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"trades" text[] DEFAULT '{}' NOT NULL,
	"city" text,
	"notes" text,
	"performance_note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"sub_company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_line_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"sub_company_id" uuid NOT NULL,
	"raw_key" text NOT NULL,
	"form_key" text NOT NULL,
	"form_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"csi_division" text NOT NULL,
	"trade_label" text NOT NULL,
	"scope_notes" text,
	"status" text DEFAULT 'open' NOT NULL,
	"awarded_bid_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'estimator' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "awards" ADD CONSTRAINT "awards_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "awards" ADD CONSTRAINT "awards_trade_package_id_trade_packages_id_fk" FOREIGN KEY ("trade_package_id") REFERENCES "public"."trade_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "awards" ADD CONSTRAINT "awards_bid_id_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."bids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "awards" ADD CONSTRAINT "awards_awarded_by_users_id_fk" FOREIGN KEY ("awarded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_attachments" ADD CONSTRAINT "bid_attachments_bid_id_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."bids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_attachments" ADD CONSTRAINT "bid_attachments_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_form_lines" ADD CONSTRAINT "bid_form_lines_trade_package_id_trade_packages_id_fk" FOREIGN KEY ("trade_package_id") REFERENCES "public"."trade_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_lines" ADD CONSTRAINT "bid_lines_bid_id_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."bids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_lines" ADD CONSTRAINT "bid_lines_bid_form_line_id_bid_form_lines_id_fk" FOREIGN KEY ("bid_form_line_id") REFERENCES "public"."bid_form_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_trade_package_id_trade_packages_id_fk" FOREIGN KEY ("trade_package_id") REFERENCES "public"."trade_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_trade_package_id_trade_packages_id_fk" FOREIGN KEY ("trade_package_id") REFERENCES "public"."trade_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_sub_company_id_sub_companies_id_fk" FOREIGN KEY ("sub_company_id") REFERENCES "public"."sub_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_sub_contact_id_sub_contacts_id_fk" FOREIGN KEY ("sub_contact_id") REFERENCES "public"."sub_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leveling_adjustments" ADD CONSTRAINT "leveling_adjustments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leveling_adjustments" ADD CONSTRAINT "leveling_adjustments_trade_package_id_trade_packages_id_fk" FOREIGN KEY ("trade_package_id") REFERENCES "public"."trade_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leveling_adjustments" ADD CONSTRAINT "leveling_adjustments_bid_id_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."bids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leveling_adjustments" ADD CONSTRAINT "leveling_adjustments_bid_form_line_id_bid_form_lines_id_fk" FOREIGN KEY ("bid_form_line_id") REFERENCES "public"."bid_form_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leveling_adjustments" ADD CONSTRAINT "leveling_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_files" ADD CONSTRAINT "plan_files_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_files" ADD CONSTRAINT "plan_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_files" ADD CONSTRAINT "plan_files_trade_package_id_trade_packages_id_fk" FOREIGN KEY ("trade_package_id") REFERENCES "public"."trade_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_files" ADD CONSTRAINT "plan_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_trade_package_id_trade_packages_id_fk" FOREIGN KEY ("trade_package_id") REFERENCES "public"."trade_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_companies" ADD CONSTRAINT "sub_companies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_contacts" ADD CONSTRAINT "sub_contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_contacts" ADD CONSTRAINT "sub_contacts_sub_company_id_sub_companies_id_fk" FOREIGN KEY ("sub_company_id") REFERENCES "public"."sub_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_line_aliases" ADD CONSTRAINT "sub_line_aliases_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_line_aliases" ADD CONSTRAINT "sub_line_aliases_sub_company_id_sub_companies_id_fk" FOREIGN KEY ("sub_company_id") REFERENCES "public"."sub_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_packages" ADD CONSTRAINT "trade_packages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_packages" ADD CONSTRAINT "trade_packages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_company_idx" ON "audit_log" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "awards_package_idx" ON "awards" USING btree ("trade_package_id");--> statement-breakpoint
CREATE INDEX "bid_attachments_bid_idx" ON "bid_attachments" USING btree ("bid_id");--> statement-breakpoint
CREATE INDEX "bid_form_lines_package_idx" ON "bid_form_lines" USING btree ("trade_package_id","sort");--> statement-breakpoint
CREATE INDEX "bid_lines_bid_form_idx" ON "bid_lines" USING btree ("bid_id","bid_form_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bids_invitation_revision_unique" ON "bids" USING btree ("invitation_id","revision");--> statement-breakpoint
CREATE INDEX "bids_package_idx" ON "bids" USING btree ("trade_package_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_events_dedupe_unique" ON "email_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "email_events_invitation_idx" ON "email_events" USING btree ("invitation_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_package_contact_unique" ON "invitations" USING btree ("trade_package_id","sub_contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_unique" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invitations_package_status_idx" ON "invitations" USING btree ("trade_package_id","status");--> statement-breakpoint
CREATE INDEX "leveling_adjustments_package_idx" ON "leveling_adjustments" USING btree ("trade_package_id");--> statement-breakpoint
CREATE INDEX "plan_files_project_idx" ON "plan_files" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "projects_company_idx" ON "projects" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "questions_package_idx" ON "questions" USING btree ("trade_package_id");--> statement-breakpoint
CREATE INDEX "sub_companies_company_idx" ON "sub_companies" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sub_companies_company_name_unique" ON "sub_companies" USING btree ("company_id","name");--> statement-breakpoint
CREATE INDEX "sub_contacts_sub_idx" ON "sub_contacts" USING btree ("sub_company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sub_contacts_sub_email_unique" ON "sub_contacts" USING btree ("sub_company_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "sub_line_aliases_unique" ON "sub_line_aliases" USING btree ("sub_company_id","raw_key");--> statement-breakpoint
CREATE INDEX "trade_packages_project_idx" ON "trade_packages" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trade_packages_project_division_unique" ON "trade_packages" USING btree ("project_id","csi_division");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");