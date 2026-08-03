CREATE TABLE "alert_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"target" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"channel_kind" text NOT NULL,
	"channel_target" text NOT NULL,
	"status" text NOT NULL,
	"summary" text NOT NULL,
	"error" text,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anomalies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"service" text NOT NULL,
	"region" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delta_per_day_micros" bigint NOT NULL,
	"baseline_per_day_micros" bigint NOT NULL,
	"excess_micros" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"probable_resources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"correlated_deploy_id" uuid,
	"acked_by" text,
	"acked_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"last_evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"slack_channel_id" text,
	"slack_message_ts" text
);
--> statement-breakpoint
CREATE TABLE "aws_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"label" text NOT NULL,
	"role_arn" text NOT NULL,
	"external_id" text NOT NULL,
	"regions" text[] DEFAULT '{}'::text[] NOT NULL,
	"connect_status" text DEFAULT 'pending' NOT NULL,
	"connect_error" text,
	"verified_at" timestamp with time zone,
	"provider" text DEFAULT 'aws' NOT NULL,
	"cur_bucket" text,
	"cur_prefix" text,
	"cur_last_imported_at" timestamp with time zone,
	"cur_covered_through" timestamp with time zone,
	"backfilled_at" timestamp with time zone,
	"last_ingest_at" timestamp with time zone,
	"ingested_through" timestamp with time zone,
	"last_waste_scan_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "baselines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"service" text NOT NULL,
	"region" text DEFAULT 'global' NOT NULL,
	"dow" integer NOT NULL,
	"hour" integer NOT NULL,
	"mean_micros" bigint NOT NULL,
	"stddev_micros" bigint NOT NULL,
	"samples" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_id" uuid NOT NULL,
	"period_start" text NOT NULL,
	"threshold" integer NOT NULL,
	"spent_micros" bigint NOT NULL,
	"projected_micros" bigint NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"scope" text NOT NULL,
	"scope_value" text NOT NULL,
	"monthly_limit_micros" bigint NOT NULL,
	"thresholds" integer[] DEFAULT '{80,100}'::integer[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"service" text NOT NULL,
	"region" text NOT NULL,
	"usage_type" text NOT NULL,
	"tag_hash" text DEFAULT '-' NOT NULL,
	"resource_id" text DEFAULT '' NOT NULL,
	"amount_micros" bigint NOT NULL,
	"source" text DEFAULT 'ce' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deploys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"service_name" text NOT NULL,
	"sha" text NOT NULL,
	"deployed_at" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'webhook' NOT NULL,
	"repo" text,
	"commit_url" text,
	"actor" text,
	"environment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan" text DEFAULT 'solo' NOT NULL,
	"billing_status" text DEFAULT 'trialing' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"slack_team_id" text,
	"slack_team_name" text,
	"slack_bot_token" text,
	"slack_channel_id" text,
	"slack_channel_name" text,
	"deploy_webhook_token" text NOT NULL,
	"deploy_webhook_secret" text NOT NULL,
	"digest_frequency" text DEFAULT 'daily' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orgs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tag_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"hash" text NOT NULL,
	"tags" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "waste_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"resource_key" text NOT NULL,
	"title" text NOT NULL,
	"remedy" text NOT NULL,
	"region" text NOT NULL,
	"evidence" text NOT NULL,
	"resource_count" integer DEFAULT 1 NOT NULL,
	"est_monthly_saving_micros" bigint NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "alert_channels" ADD CONSTRAINT "alert_channels_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_log" ADD CONSTRAINT "alert_log_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_account_id_aws_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."aws_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aws_accounts" ADD CONSTRAINT "aws_accounts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_account_id_aws_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."aws_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_facts" ADD CONSTRAINT "cost_facts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_facts" ADD CONSTRAINT "cost_facts_account_id_aws_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."aws_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploys" ADD CONSTRAINT "deploys_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_sets" ADD CONSTRAINT "tag_sets_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waste_findings" ADD CONSTRAINT "waste_findings_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waste_findings" ADD CONSTRAINT "waste_findings_account_id_aws_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."aws_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_channels_target_idx" ON "alert_channels" USING btree ("org_id","kind","target");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_log_dedupe_idx" ON "alert_log" USING btree ("org_id","dedupe_key","channel_target");--> statement-breakpoint
CREATE INDEX "alert_log_org_time_idx" ON "alert_log" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "anomalies_live_idx" ON "anomalies" USING btree ("account_id","service","region") WHERE resolved_at is null;--> statement-breakpoint
CREATE INDEX "anomalies_org_status_idx" ON "anomalies" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "aws_accounts_org_account_idx" ON "aws_accounts" USING btree ("org_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "baselines_grain_idx" ON "baselines" USING btree ("account_id","service","region","dow","hour");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_alerts_rung_idx" ON "budget_alerts" USING btree ("budget_id","period_start","threshold");--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_org_scope_idx" ON "budgets" USING btree ("org_id","scope","scope_value");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_facts_grain_idx" ON "cost_facts" USING btree ("account_id","ts","service","region","usage_type","tag_hash","resource_id","source");--> statement-breakpoint
CREATE INDEX "cost_facts_account_ts_idx" ON "cost_facts" USING btree ("account_id","ts");--> statement-breakpoint
CREATE INDEX "cost_facts_org_ts_idx" ON "cost_facts" USING btree ("org_id","ts");--> statement-breakpoint
CREATE UNIQUE INDEX "deploys_org_sha_idx" ON "deploys" USING btree ("org_id","service_name","sha","deployed_at");--> statement-breakpoint
CREATE INDEX "deploys_org_time_idx" ON "deploys" USING btree ("org_id","deployed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "members_org_user_idx" ON "members" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_sets_org_hash_idx" ON "tag_sets" USING btree ("org_id","hash");--> statement-breakpoint
CREATE UNIQUE INDEX "waste_findings_resource_idx" ON "waste_findings" USING btree ("account_id","kind","resource_key");