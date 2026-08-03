CREATE TYPE "public"."actor_kind" AS ENUM('user', 'system');--> statement-breakpoint
CREATE TYPE "public"."capture_kind" AS ENUM('recording', 'upload', 'shorthand');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."modality" AS ENUM('general', 'cbt', 'emdr', 'couples', 'play', 'sfbt');--> statement-breakpoint
CREATE TYPE "public"."note_format" AS ENUM('soap', 'dap');--> statement-breakpoint
CREATE TYPE "public"."note_status" AS ENUM('drafting', 'draft', 'signed', 'amended');--> statement-breakpoint
CREATE TYPE "public"."note_version_reason" AS ENUM('draft', 'edit', 'amendment');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('solo', 'caseload', 'group');--> statement-breakpoint
CREATE TYPE "public"."recording_consent" AS ENUM('none', 'verbal', 'written');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('captured', 'transcribing', 'drafting', 'ready', 'signed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."signature_kind" AS ENUM('author', 'cosign');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('clinician', 'supervisor', 'admin');--> statement-breakpoint
CREATE TABLE "audio_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"bytes" "bytea",
	"mime" text NOT NULL,
	"duration_seconds" integer,
	"byte_size" integer,
	"purge_at" timestamp with time zone NOT NULL,
	"purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_kind" "actor_kind" DEFAULT 'user' NOT NULL,
	"action" text NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" uuid,
	"ip" text,
	"user_agent" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" uuid NOT NULL,
	"clinician_id" uuid NOT NULL,
	"display_label" text NOT NULL,
	"modality" "modality" DEFAULT 'general' NOT NULL,
	"default_template_id" uuid,
	"recording_consent" "recording_consent" DEFAULT 'none' NOT NULL,
	"consent_noted_at" timestamp with time zone,
	"status" "client_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"sections" jsonb NOT NULL,
	"reason" "note_version_reason" NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"clinician_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"format" "note_format" NOT NULL,
	"status" "note_status" DEFAULT 'drafting' NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text,
	"draft_generated_at" timestamp with time zone,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" integer DEFAULT 0 NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"plan" "plan" DEFAULT 'solo' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"trial_ends_at" timestamp with time zone,
	"baa_accepted_at" timestamp with time zone,
	"retention_days" integer DEFAULT 30 NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"clinician_id" uuid NOT NULL,
	"held_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer,
	"capture_kind" "capture_kind" NOT NULL,
	"shorthand_text" text,
	"status" "session_status" DEFAULT 'captured' NOT NULL,
	"failure_reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"signer_id" uuid NOT NULL,
	"signer_credentials" text NOT NULL,
	"kind" "signature_kind" DEFAULT 'author' NOT NULL,
	"content_hash" text NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" uuid,
	"name" text NOT NULL,
	"format" "note_format" NOT NULL,
	"modality" "modality" DEFAULT 'general' NOT NULL,
	"sections" jsonb NOT NULL,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"provider" text DEFAULT 'deepgram' NOT NULL,
	"segments" jsonb NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"purge_at" timestamp with time zone NOT NULL,
	"purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" uuid NOT NULL,
	"period" text NOT NULL,
	"notes_drafted" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" uuid NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"credentials" text DEFAULT '' NOT NULL,
	"role" "user_role" DEFAULT 'clinician' NOT NULL,
	"default_format" "note_format" DEFAULT 'soap' NOT NULL,
	"signature_block" text DEFAULT '' NOT NULL,
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
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audio_artifacts" ADD CONSTRAINT "audio_artifacts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_clinician_id_users_id_fk" FOREIGN KEY ("clinician_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_default_template_id_templates_id_fk" FOREIGN KEY ("default_template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_versions" ADD CONSTRAINT "note_versions_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_versions" ADD CONSTRAINT "note_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_clinician_id_users_id_fk" FOREIGN KEY ("clinician_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_clinician_id_users_id_fk" FOREIGN KEY ("clinician_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_signer_id_users_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audio_session_idx" ON "audio_artifacts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "audio_purge_idx" ON "audio_artifacts" USING btree ("purge_at");--> statement-breakpoint
CREATE INDEX "audit_practice_time_idx" ON "audit_events" USING btree ("practice_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "audit_events" USING btree ("target_kind","target_id");--> statement-breakpoint
CREATE INDEX "clients_practice_idx" ON "clients" USING btree ("practice_id");--> statement-breakpoint
CREATE INDEX "clients_clinician_idx" ON "clients" USING btree ("clinician_id");--> statement-breakpoint
CREATE UNIQUE INDEX "note_versions_unique" ON "note_versions" USING btree ("note_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "notes_session_unique" ON "notes" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "notes_clinician_status_idx" ON "notes" USING btree ("clinician_id","status");--> statement-breakpoint
CREATE INDEX "sessions_client_idx" ON "sessions" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "sessions_clinician_held_idx" ON "sessions" USING btree ("clinician_id","held_at");--> statement-breakpoint
CREATE INDEX "sessions_status_idx" ON "sessions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "signatures_unique" ON "signatures" USING btree ("note_id","version","kind");--> statement-breakpoint
CREATE INDEX "signatures_signer_idx" ON "signatures" USING btree ("signer_id");--> statement-breakpoint
CREATE INDEX "templates_practice_idx" ON "templates" USING btree ("practice_id");--> statement-breakpoint
CREATE INDEX "transcripts_session_idx" ON "transcripts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "transcripts_purge_idx" ON "transcripts" USING btree ("purge_at");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_period_unique" ON "usage_counters" USING btree ("practice_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_practice_idx" ON "users" USING btree ("practice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_external_unique" ON "webhook_events" USING btree ("provider","external_id");