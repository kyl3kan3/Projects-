CREATE TYPE "public"."clause_type" AS ENUM('payment_terms', 'ip_assignment', 'indemnity', 'non_compete', 'auto_renewal', 'termination', 'liability_cap', 'confidentiality', 'warranties', 'governing_law', 'late_fees', 'scope_revisions', 'boilerplate', 'other');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('uploaded', 'parsing', 'extracting', 'scoring', 'explaining', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."contract_type" AS ENUM('msa', 'sow', 'nda', 'vendor', 'lease', 'other');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('per_contract', 'freelancer', 'studio');--> statement-breakpoint
CREATE TYPE "public"."purchase_kind" AS ENUM('subscription_grant', 'one_time', 'overage', 'trial');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('ok', 'caution', 'high');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('pdf', 'docx', 'text');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"plan" "plan" DEFAULT 'per_contract' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"disclaimer_ack_at" timestamp with time zone,
	"retention_days" integer DEFAULT 90 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checker_hits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"clause_type" "clause_type" NOT NULL,
	"heading" text,
	"section_ref" text,
	"source_spans" jsonb NOT NULL,
	"extracted_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence" real DEFAULT 1 NOT NULL,
	"raw_model_output" jsonb,
	"model_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_texts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"full_text" text NOT NULL,
	"blocks" jsonb NOT NULL,
	"section_map" jsonb NOT NULL,
	"parse_warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"coverage" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"char_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"title" text NOT NULL,
	"counterparty" text,
	"contract_type" "contract_type" DEFAULT 'other' NOT NULL,
	"type_confirmed" boolean DEFAULT false NOT NULL,
	"status" "contract_status" DEFAULT 'uploaded' NOT NULL,
	"source_kind" "source_kind" NOT NULL,
	"source_filename" text,
	"sha256" text NOT NULL,
	"page_count" integer DEFAULT 1 NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"playbook_id" uuid,
	"playbook_version" integer,
	"playbook_name" text,
	"model_version" text,
	"credit_purchase_id" uuid,
	"failure_reason" text,
	"stage_started_at" timestamp with time zone,
	"stage_attempts" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" integer DEFAULT 0 NOT NULL,
	"retention_expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "eval_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fixture_key" text NOT NULL,
	"name" text NOT NULL,
	"contract_type" "contract_type" NOT NULL,
	"expected_flags" jsonb NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_result" jsonb
);
--> statement-breakpoint
CREATE TABLE "flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"clause_id" uuid,
	"rule_id" uuid,
	"rule_key" text NOT NULL,
	"clause_type" "clause_type" NOT NULL,
	"severity" "severity" NOT NULL,
	"title" text NOT NULL,
	"fired_because" text NOT NULL,
	"explanation" text,
	"for_you" text,
	"market" text,
	"lawyer_pointer" boolean DEFAULT false NOT NULL,
	"explanation_source" text DEFAULT 'template' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playbook_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playbook_id" uuid NOT NULL,
	"clause_type" "clause_type" NOT NULL,
	"rule_key" text NOT NULL,
	"title" text NOT NULL,
	"comparator" jsonb NOT NULL,
	"severity_on_fail" "severity" NOT NULL,
	"fired_template" text NOT NULL,
	"explanation_template" text NOT NULL,
	"for_you_template" text NOT NULL,
	"market_note" text NOT NULL,
	"redline_template" text NOT NULL,
	"threshold" real,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playbooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" "purchase_kind" NOT NULL,
	"credits" integer NOT NULL,
	"credits_used" integer DEFAULT 0 NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"stripe_ref" text,
	"note" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redlines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flag_id" uuid NOT NULL,
	"original_phrase" text NOT NULL,
	"suggested_text" text NOT NULL,
	"rationale" text NOT NULL,
	"email_snippet" text NOT NULL,
	"accepted" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"share_token" text,
	"share_revoked_at" timestamp with time zone,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"playbook_version" integer NOT NULL,
	"playbook_name" text NOT NULL,
	"model_version" text NOT NULL,
	"coverage" jsonb NOT NULL,
	"summary" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clauses" ADD CONSTRAINT "clauses_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_texts" ADD CONSTRAINT "contract_texts_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_playbook_id_playbooks_id_fk" FOREIGN KEY ("playbook_id") REFERENCES "public"."playbooks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_clause_id_clauses_id_fk" FOREIGN KEY ("clause_id") REFERENCES "public"."clauses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_rule_id_playbook_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."playbook_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_rules" ADD CONSTRAINT "playbook_rules_playbook_id_playbooks_id_fk" FOREIGN KEY ("playbook_id") REFERENCES "public"."playbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbooks" ADD CONSTRAINT "playbooks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redlines" ADD CONSTRAINT "redlines_flag_id_flags_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."flags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_account_idx" ON "audit_log" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "checker_hits_ip_idx" ON "checker_hits" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "clauses_contract_idx" ON "clauses" USING btree ("contract_id","clause_type");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_texts_contract_key" ON "contract_texts" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "contracts_account_status_idx" ON "contracts" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "contracts_retention_idx" ON "contracts" USING btree ("retention_expires_at");--> statement-breakpoint
CREATE INDEX "contracts_sha_idx" ON "contracts" USING btree ("account_id","sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_cases_key" ON "eval_cases" USING btree ("fixture_key");--> statement-breakpoint
CREATE INDEX "flags_contract_severity_idx" ON "flags" USING btree ("contract_id","severity");--> statement-breakpoint
CREATE UNIQUE INDEX "playbook_rules_key" ON "playbook_rules" USING btree ("playbook_id","rule_key");--> statement-breakpoint
CREATE INDEX "playbook_rules_playbook_idx" ON "playbook_rules" USING btree ("playbook_id");--> statement-breakpoint
CREATE INDEX "playbooks_account_idx" ON "playbooks" USING btree ("account_id","active");--> statement-breakpoint
CREATE INDEX "purchases_account_idx" ON "purchases" USING btree ("account_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_stripe_ref_key" ON "purchases" USING btree ("stripe_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "redlines_flag_key" ON "redlines" USING btree ("flag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_contract_key" ON "reports" USING btree ("contract_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_share_token_key" ON "reports" USING btree ("share_token");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_account_idx" ON "users" USING btree ("account_id");