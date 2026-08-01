CREATE TABLE "alert_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backup_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"policy_id" uuid,
	"database_connection_id" uuid NOT NULL,
	"trigger" text DEFAULT 'scheduled' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"bytes_processed" bigint DEFAULT 0 NOT NULL,
	"stage" text DEFAULT 'dump' NOT NULL,
	"error_code" text,
	"error_detail" text,
	"attempt" integer DEFAULT 1 NOT NULL,
	"queue_job_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backup_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"database_connection_id" uuid NOT NULL,
	"storage_target_id" uuid NOT NULL,
	"frequency" text DEFAULT 'daily' NOT NULL,
	"schedule_cron" text DEFAULT '0 4 * * *' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"retention_days" integer DEFAULT 30 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"missed_since" timestamp with time zone,
	"drill_frequency" text DEFAULT 'none' NOT NULL,
	"next_drill_at" timestamp with time zone,
	"last_drill_at" timestamp with time zone,
	"last_prune_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "backup_policies_database_connection_id_unique" UNIQUE("database_connection_id")
);
--> statement-breakpoint
CREATE TABLE "database_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"provider" text DEFAULT 'generic' NOT NULL,
	"encrypted_connection_string" "bytea" NOT NULL,
	"host_fingerprint" text NOT NULL,
	"pooled" boolean DEFAULT false NOT NULL,
	"postgres_version" text,
	"approx_size_bytes" bigint,
	"table_count" integer,
	"role_is_superuser" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_check_error" text,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_members_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"plan" text DEFAULT 'hobby' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"stripe_customer_id" text,
	"alert_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "restore_drills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"policy_id" uuid,
	"database_connection_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"trigger" text DEFAULT 'scheduled' NOT NULL,
	"scratch_instance" text,
	"tables_expected" integer DEFAULT 0 NOT NULL,
	"tables_restored" integer DEFAULT 0 NOT NULL,
	"rows_expected" bigint DEFAULT 0 NOT NULL,
	"rows_restored" bigint DEFAULT 0 NOT NULL,
	"rowcount_checks" jsonb,
	"checksum_verified" boolean DEFAULT false NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"error_detail" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restore_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"target_fingerprint" text NOT NULL,
	"encrypted_target" "bytea",
	"allow_non_empty" boolean DEFAULT false NOT NULL,
	"statements_total" integer DEFAULT 0 NOT NULL,
	"statements_applied" integer DEFAULT 0 NOT NULL,
	"tables_restored" integer DEFAULT 0 NOT NULL,
	"rows_restored" bigint DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"error_detail" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"backup_job_id" uuid NOT NULL,
	"database_connection_id" uuid NOT NULL,
	"storage_target_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"compressed_size_bytes" bigint DEFAULT 0 NOT NULL,
	"sha256" text NOT NULL,
	"wrapped_data_key" "bytea" NOT NULL,
	"key_id" text NOT NULL,
	"dump_engine" text DEFAULT 'pg_dump' NOT NULL,
	"pg_dump_version" text,
	"manifest" jsonb,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'managed' NOT NULL,
	"bucket" text DEFAULT '' NOT NULL,
	"region" text DEFAULT 'auto' NOT NULL,
	"endpoint" text,
	"prefix" text DEFAULT '' NOT NULL,
	"encrypted_credentials" "bytea",
	"is_default" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"last_check_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"price_id" text,
	"plan" text DEFAULT 'hobby' NOT NULL,
	"status" text DEFAULT 'trialing' NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_org_id_unique" UNIQUE("org_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"avatar_url" text,
	"password_hash" text,
	"github_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_github_id_unique" UNIQUE("github_id")
);
--> statement-breakpoint
ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_jobs" ADD CONSTRAINT "backup_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_jobs" ADD CONSTRAINT "backup_jobs_policy_id_backup_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."backup_policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_jobs" ADD CONSTRAINT "backup_jobs_database_connection_id_database_connections_id_fk" FOREIGN KEY ("database_connection_id") REFERENCES "public"."database_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_policies" ADD CONSTRAINT "backup_policies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_policies" ADD CONSTRAINT "backup_policies_database_connection_id_database_connections_id_fk" FOREIGN KEY ("database_connection_id") REFERENCES "public"."database_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_policies" ADD CONSTRAINT "backup_policies_storage_target_id_storage_targets_id_fk" FOREIGN KEY ("storage_target_id") REFERENCES "public"."storage_targets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_connections" ADD CONSTRAINT "database_connections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restore_drills" ADD CONSTRAINT "restore_drills_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restore_drills" ADD CONSTRAINT "restore_drills_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restore_drills" ADD CONSTRAINT "restore_drills_policy_id_backup_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."backup_policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restore_drills" ADD CONSTRAINT "restore_drills_database_connection_id_database_connections_id_fk" FOREIGN KEY ("database_connection_id") REFERENCES "public"."database_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restore_runs" ADD CONSTRAINT "restore_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restore_runs" ADD CONSTRAINT "restore_runs_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restore_runs" ADD CONSTRAINT "restore_runs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_backup_job_id_backup_jobs_id_fk" FOREIGN KEY ("backup_job_id") REFERENCES "public"."backup_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_database_connection_id_database_connections_id_fk" FOREIGN KEY ("database_connection_id") REFERENCES "public"."database_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_storage_target_id_storage_targets_id_fk" FOREIGN KEY ("storage_target_id") REFERENCES "public"."storage_targets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_targets" ADD CONSTRAINT "storage_targets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_deliveries_dedupe_idx" ON "alert_deliveries" USING btree ("org_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "audit_log_org_idx" ON "audit_log" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "backup_jobs_conn_idx" ON "backup_jobs" USING btree ("database_connection_id","created_at");--> statement-breakpoint
CREATE INDEX "backup_jobs_org_idx" ON "backup_jobs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "backup_jobs_slot_idx" ON "backup_jobs" USING btree ("policy_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "backup_policies_due_idx" ON "backup_policies" USING btree ("next_run_at","enabled");--> statement-breakpoint
CREATE INDEX "backup_policies_org_idx" ON "backup_policies" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "database_connections_org_idx" ON "database_connections" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "restore_drills_conn_idx" ON "restore_drills" USING btree ("database_connection_id","created_at");--> statement-breakpoint
CREATE INDEX "restore_drills_org_idx" ON "restore_drills" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "restore_runs_org_idx" ON "restore_runs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "snapshots_conn_idx" ON "snapshots" USING btree ("database_connection_id","created_at");--> statement-breakpoint
CREATE INDEX "snapshots_expiry_idx" ON "snapshots" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "storage_targets_org_idx" ON "storage_targets" USING btree ("org_id");