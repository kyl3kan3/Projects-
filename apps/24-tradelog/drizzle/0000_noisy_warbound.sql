CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"broker" text NOT NULL,
	"label" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"sync_secret_encrypted" text,
	"sync_query_id" text,
	"last_synced_at" timestamp with time zone,
	"last_sync_error" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"import_batch_id" uuid,
	"symbol" text NOT NULL,
	"display_symbol" text NOT NULL,
	"asset_class" text NOT NULL,
	"side" text NOT NULL,
	"qty" numeric(28, 8) NOT NULL,
	"price" numeric(28, 8) NOT NULL,
	"fees" numeric(38, 19) NOT NULL,
	"multiplier_milli" integer NOT NULL,
	"executed_at" timestamp with time zone NOT NULL,
	"broker_ref" text,
	"dedupe_hash" text NOT NULL,
	"source_row" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"statement" text NOT NULL,
	"detail" text NOT NULL,
	"dollar_impact_cents" bigint NOT NULL,
	"monthly_impact_cents" bigint,
	"sample_size" integer NOT NULL,
	"trade_ids" uuid[] DEFAULT '{}' NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"rank" integer DEFAULT 0 NOT NULL,
	"dismissed_at" timestamp with time zone,
	"watching" boolean DEFAULT false NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"byte_size" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'upload' NOT NULL,
	"parser_id" text NOT NULL,
	"parser_version" text NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rules_notes" text,
	"color" text DEFAULT 'blue' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"price_id" text,
	"plan" text NOT NULL,
	"status" text NOT NULL,
	"interval" text,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_executions" (
	"trade_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"role" text NOT NULL,
	"qty" numeric(28, 8) NOT NULL,
	"price" numeric(28, 8) NOT NULL,
	"fees_cents" bigint NOT NULL,
	"executed_at" timestamp with time zone NOT NULL,
	"seq" integer NOT NULL,
	CONSTRAINT "trade_executions_trade_id_execution_id_seq_pk" PRIMARY KEY("trade_id","execution_id","seq")
);
--> statement-breakpoint
CREATE TABLE "trade_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"caption" text,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"match_key" text NOT NULL,
	"symbol" text NOT NULL,
	"display_symbol" text NOT NULL,
	"asset_class" text NOT NULL,
	"direction" text NOT NULL,
	"multiplier_milli" integer NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"status" text NOT NULL,
	"hold_seconds" integer,
	"qty_opened" numeric(28, 8) NOT NULL,
	"qty_max" numeric(28, 8) NOT NULL,
	"qty_open" numeric(28, 8) NOT NULL,
	"avg_entry" numeric(28, 8) NOT NULL,
	"avg_exit" numeric(28, 8),
	"gross_pnl_cents" bigint NOT NULL,
	"fees_cents" bigint NOT NULL,
	"net_pnl_cents" bigint NOT NULL,
	"position_cost_cents" bigint NOT NULL,
	"mark_price" numeric(28, 8),
	"unrealized_pnl_cents" bigint,
	"setup_id" uuid,
	"stop_price" numeric(28, 8),
	"r_multiple" numeric(14, 4),
	"notes" text,
	"emotion_tags" text[] DEFAULT '{}' NOT NULL,
	"reviewed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"password_hash" text NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"stripe_customer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "weekly_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"week_start" text NOT NULL,
	"went_well" text,
	"went_wrong" text,
	"one_change" text,
	"finding_kind" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setups" ADD CONSTRAINT "setups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_executions" ADD CONSTRAINT "trade_executions_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_executions" ADD CONSTRAINT "trade_executions_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_images" ADD CONSTRAINT "trade_images_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_images" ADD CONSTRAINT "trade_images_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reviews" ADD CONSTRAINT "weekly_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "executions_dedupe_idx" ON "executions" USING btree ("account_id","dedupe_hash");--> statement-breakpoint
CREATE INDEX "executions_account_time_idx" ON "executions" USING btree ("account_id","executed_at");--> statement-breakpoint
CREATE INDEX "executions_symbol_idx" ON "executions" USING btree ("account_id","symbol","executed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "findings_user_kind_idx" ON "findings" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "findings_user_rank_idx" ON "findings" USING btree ("user_id","rank");--> statement-breakpoint
CREATE INDEX "import_batches_account_idx" ON "import_batches" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "setups_user_name_idx" ON "setups" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "trade_executions_execution_idx" ON "trade_executions" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "trade_images_trade_idx" ON "trade_images" USING btree ("trade_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trades_match_idx" ON "trades" USING btree ("account_id","match_key");--> statement-breakpoint
CREATE INDEX "trades_user_closed_idx" ON "trades" USING btree ("user_id","closed_at");--> statement-breakpoint
CREATE INDEX "trades_account_opened_idx" ON "trades" USING btree ("account_id","opened_at");--> statement-breakpoint
CREATE INDEX "trades_setup_idx" ON "trades" USING btree ("setup_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_reviews_user_week_idx" ON "weekly_reviews" USING btree ("user_id","week_start");