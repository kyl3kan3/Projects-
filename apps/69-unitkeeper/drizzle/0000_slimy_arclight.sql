CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"state" text DEFAULT 'TX' NOT NULL,
	"timezone" text DEFAULT 'America/Chicago' NOT NULL,
	"gate_system" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ladder_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"cycle_key" text NOT NULL,
	"day" integer NOT NULL,
	"action" text NOT NULL,
	"fired_on" date NOT NULL,
	"ledger_entry_id" uuid,
	"reversed_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"description" text NOT NULL,
	"occurred_on" date NOT NULL,
	"stripe_payment_intent_id" text,
	"balance_after_cents" integer NOT NULL,
	"period" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lien_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"rule_version_id" uuid NOT NULL,
	"delinquent_since" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"current_step_key" text,
	"steps_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hard_stop_until" date,
	"resolved_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lien_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state" text NOT NULL,
	"version" integer NOT NULL,
	"steps" jsonb NOT NULL,
	"reviewed_on" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lien_case_id" uuid,
	"tenancy_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"r2_key" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_via" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"plan" text DEFAULT 'trial' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_account_id" text,
	"subscription_status" text,
	"current_period_end" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"tenancy_id" uuid,
	"old_cents" integer NOT NULL,
	"new_cents" integer NOT NULL,
	"effective_on" date NOT NULL,
	"notice_id" uuid,
	"status" text DEFAULT 'noticed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"rate_cents" integer NOT NULL,
	"started_on" date NOT NULL,
	"ended_on" date,
	"status" text DEFAULT 'active' NOT NULL,
	"lease_r2_key" text,
	"lease_hash" text,
	"signed_at" timestamp with time zone,
	"gate_code" text,
	"gate_code_status" text DEFAULT 'active' NOT NULL,
	"autopay" boolean DEFAULT true NOT NULL,
	"stripe_subscription_id" text,
	"stripe_payment_method_id" text,
	"paid_through" text,
	"make_ready" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"address" text,
	"alternate_contact" jsonb,
	"stripe_customer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"label" text NOT NULL,
	"size" text NOT NULL,
	"monthly_rate_cents" integer NOT NULL,
	"map_position" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'vacant' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'stripe' NOT NULL,
	"external_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ladder_events" ADD CONSTRAINT "ladder_events_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ladder_events" ADD CONSTRAINT "ladder_events_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lien_cases" ADD CONSTRAINT "lien_cases_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lien_cases" ADD CONSTRAINT "lien_cases_rule_version_id_lien_rules_id_fk" FOREIGN KEY ("rule_version_id") REFERENCES "public"."lien_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_lien_case_id_lien_cases_id_fk" FOREIGN KEY ("lien_case_id") REFERENCES "public"."lien_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_changes" ADD CONSTRAINT "rate_changes_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_changes" ADD CONSTRAINT "rate_changes_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_changes" ADD CONSTRAINT "rate_changes_notice_id_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."notices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ladder_events_rung_idx" ON "ladder_events" USING btree ("tenancy_id","cycle_key","day","action");--> statement-breakpoint
CREATE INDEX "ladder_events_tenancy_idx" ON "ladder_events" USING btree ("tenancy_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_tenancy_idx" ON "ledger_entries" USING btree ("tenancy_id","occurred_on");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_period_idx" ON "ledger_entries" USING btree ("tenancy_id","kind","period");--> statement-breakpoint
CREATE UNIQUE INDEX "lien_rules_state_version_idx" ON "lien_rules" USING btree ("state","version");--> statement-breakpoint
CREATE UNIQUE INDEX "owners_email_idx" ON "owners" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "units_facility_label_idx" ON "units" USING btree ("facility_id","label");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_external_idx" ON "webhook_events" USING btree ("external_id");