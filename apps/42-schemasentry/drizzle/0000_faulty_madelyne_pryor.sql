CREATE TYPE "public"."ack_scope" AS ENUM('pr', 'api');--> statement-breakpoint
CREATE TYPE "public"."changelog_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."check_conclusion" AS ENUM('success', 'neutral', 'failure');--> statement-breakpoint
CREATE TYPE "public"."check_provider" AS ENUM('github', 'generic');--> statement-breakpoint
CREATE TYPE "public"."delivery_channel" AS ENUM('slack', 'webhook', 'email');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'sent', 'failed', 'dead');--> statement-breakpoint
CREATE TYPE "public"."environment" AS ENUM('prod', 'staging', 'pr');--> statement-breakpoint
CREATE TYPE "public"."finding_level" AS ENUM('breaking', 'risky', 'compatible', 'info');--> statement-breakpoint
CREATE TYPE "public"."test_framework" AS ENUM('vitest', 'jest');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('trial', 'solo', 'team', 'platform');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."contract_side" AS ENUM('request', 'response', 'operation');--> statement-breakpoint
CREATE TYPE "public"."verdict" AS ENUM('breaking', 'risky', 'compatible');--> statement-breakpoint
CREATE TYPE "public"."api_visibility" AS ENUM('public', 'unlisted', 'private');--> statement-breakpoint
CREATE TABLE "acknowledgements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_id" uuid NOT NULL,
	"rule_id" text NOT NULL,
	"json_pointer" text NOT NULL,
	"scope" "ack_scope" NOT NULL,
	"scope_key" text NOT NULL,
	"note" text NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_id" uuid,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"label" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "apis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"visibility" "api_visibility" DEFAULT 'unlisted' NOT NULL,
	"policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"baseline_deploy_id" uuid,
	"slack_webhook_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "changelog_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_id" uuid NOT NULL,
	"diff_id" uuid,
	"status" "changelog_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"body_md" text NOT NULL,
	"breaking" boolean DEFAULT false NOT NULL,
	"version_label" text NOT NULL,
	"anchor" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_id" uuid NOT NULL,
	"diff_id" uuid,
	"provider" "check_provider" NOT NULL,
	"external_ref" text,
	"conclusion" "check_conclusion" NOT NULL,
	"pr_number" integer,
	"repository" text,
	"head_sha" text,
	"comment_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_impacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diff_id" uuid NOT NULL,
	"consumer_id" uuid NOT NULL,
	"impacted" boolean NOT NULL,
	"worst" "verdict",
	"details" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_id" uuid NOT NULL,
	"name" text NOT NULL,
	"contact" text,
	"declared_usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notify" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_suites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_id" uuid NOT NULL,
	"consumer_id" uuid,
	"framework" "test_framework" DEFAULT 'vitest' NOT NULL,
	"source_deploy_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"content" text NOT NULL,
	"assertions" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deploys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_id" uuid NOT NULL,
	"version_label" text NOT NULL,
	"environment" "environment" DEFAULT 'prod' NOT NULL,
	"spec_canonical" jsonb NOT NULL,
	"raw_spec" text NOT NULL,
	"spec_health" jsonb NOT NULL,
	"spec_title" text NOT NULL,
	"openapi_version" text NOT NULL,
	"pushed_by" text NOT NULL,
	"pushed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_id" uuid NOT NULL,
	"from_deploy_id" uuid NOT NULL,
	"to_deploy_id" uuid NOT NULL,
	"engine_version" text NOT NULL,
	"verdict" "verdict" NOT NULL,
	"summary" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diff_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"rule_id" text NOT NULL,
	"level" "finding_level" NOT NULL,
	"default_level" "finding_level" NOT NULL,
	"json_pointer" text NOT NULL,
	"endpoint" text,
	"method" text,
	"side" "contract_side" NOT NULL,
	"field_path" text,
	"message" text NOT NULL,
	"why" text NOT NULL,
	"diff_lines" jsonb NOT NULL,
	"vars" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_id" uuid,
	"diff_id" uuid,
	"channel" "delivery_channel" NOT NULL,
	"target" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan" "plan" DEFAULT 'trial' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_id" uuid NOT NULL,
	"email" text NOT NULL,
	"rss_token" text NOT NULL,
	"verified_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text,
	"github_login" text,
	"role" "member_role" DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "acknowledgements" ADD CONSTRAINT "acknowledgements_api_id_apis_id_fk" FOREIGN KEY ("api_id") REFERENCES "public"."apis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apis" ADD CONSTRAINT "apis_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changelog_entries" ADD CONSTRAINT "changelog_entries_api_id_apis_id_fk" FOREIGN KEY ("api_id") REFERENCES "public"."apis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changelog_entries" ADD CONSTRAINT "changelog_entries_diff_id_diffs_id_fk" FOREIGN KEY ("diff_id") REFERENCES "public"."diffs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_runs" ADD CONSTRAINT "check_runs_api_id_apis_id_fk" FOREIGN KEY ("api_id") REFERENCES "public"."apis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_runs" ADD CONSTRAINT "check_runs_diff_id_diffs_id_fk" FOREIGN KEY ("diff_id") REFERENCES "public"."diffs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_impacts" ADD CONSTRAINT "consumer_impacts_diff_id_diffs_id_fk" FOREIGN KEY ("diff_id") REFERENCES "public"."diffs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_impacts" ADD CONSTRAINT "consumer_impacts_consumer_id_consumers_id_fk" FOREIGN KEY ("consumer_id") REFERENCES "public"."consumers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumers" ADD CONSTRAINT "consumers_api_id_apis_id_fk" FOREIGN KEY ("api_id") REFERENCES "public"."apis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_suites" ADD CONSTRAINT "contract_suites_api_id_apis_id_fk" FOREIGN KEY ("api_id") REFERENCES "public"."apis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_suites" ADD CONSTRAINT "contract_suites_consumer_id_consumers_id_fk" FOREIGN KEY ("consumer_id") REFERENCES "public"."consumers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_suites" ADD CONSTRAINT "contract_suites_source_deploy_id_deploys_id_fk" FOREIGN KEY ("source_deploy_id") REFERENCES "public"."deploys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploys" ADD CONSTRAINT "deploys_api_id_apis_id_fk" FOREIGN KEY ("api_id") REFERENCES "public"."apis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diffs" ADD CONSTRAINT "diffs_api_id_apis_id_fk" FOREIGN KEY ("api_id") REFERENCES "public"."apis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diffs" ADD CONSTRAINT "diffs_from_deploy_id_deploys_id_fk" FOREIGN KEY ("from_deploy_id") REFERENCES "public"."deploys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diffs" ADD CONSTRAINT "diffs_to_deploy_id_deploys_id_fk" FOREIGN KEY ("to_deploy_id") REFERENCES "public"."deploys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_diff_id_diffs_id_fk" FOREIGN KEY ("diff_id") REFERENCES "public"."diffs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_api_id_apis_id_fk" FOREIGN KEY ("api_id") REFERENCES "public"."apis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_diff_id_diffs_id_fk" FOREIGN KEY ("diff_id") REFERENCES "public"."diffs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_api_id_apis_id_fk" FOREIGN KEY ("api_id") REFERENCES "public"."apis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "acks_unique_idx" ON "acknowledgements" USING btree ("api_id","rule_id","json_pointer","scope_key");--> statement-breakpoint
CREATE INDEX "acks_api_idx" ON "acknowledgements" USING btree ("api_id");--> statement-breakpoint
CREATE INDEX "api_tokens_org_idx" ON "api_tokens" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "apis_org_slug_idx" ON "apis" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "audit_org_created_idx" ON "audit_log" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "changelog_diff_idx" ON "changelog_entries" USING btree ("diff_id");--> statement-breakpoint
CREATE INDEX "changelog_api_status_idx" ON "changelog_entries" USING btree ("api_id","status");--> statement-breakpoint
CREATE INDEX "check_runs_api_idx" ON "check_runs" USING btree ("api_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "check_runs_pr_idx" ON "check_runs" USING btree ("api_id","repository","pr_number");--> statement-breakpoint
CREATE UNIQUE INDEX "consumer_impacts_unique_idx" ON "consumer_impacts" USING btree ("diff_id","consumer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "consumers_api_name_idx" ON "consumers" USING btree ("api_id","name");--> statement-breakpoint
CREATE INDEX "contract_suites_api_idx" ON "contract_suites" USING btree ("api_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deploys_api_version_env_idx" ON "deploys" USING btree ("api_id","version_label","environment");--> statement-breakpoint
CREATE INDEX "deploys_api_pushed_idx" ON "deploys" USING btree ("api_id","pushed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "diffs_pair_idx" ON "diffs" USING btree ("from_deploy_id","to_deploy_id");--> statement-breakpoint
CREATE INDEX "diffs_api_computed_idx" ON "diffs" USING btree ("api_id","computed_at");--> statement-breakpoint
CREATE INDEX "findings_diff_level_idx" ON "findings" USING btree ("diff_id","level");--> statement-breakpoint
CREATE INDEX "findings_diff_ordinal_idx" ON "findings" USING btree ("diff_id","ordinal");--> statement-breakpoint
CREATE INDEX "deliveries_due_idx" ON "notification_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_api_email_idx" ON "subscriptions" USING btree ("api_id","email");--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("organization_id");