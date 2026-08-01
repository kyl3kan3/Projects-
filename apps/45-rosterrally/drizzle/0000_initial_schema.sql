CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"season_id" uuid,
	"audience" jsonb NOT NULL,
	"audience_label" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"channels" text[] NOT NULL,
	"purpose" text DEFAULT 'announcement' NOT NULL,
	"sent_by_user_id" uuid,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sport" text DEFAULT 'soccer' NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"plan" text DEFAULT 'per_registration' NOT NULL,
	"stripe_account_id" text,
	"stripe_account_ready" boolean DEFAULT false NOT NULL,
	"stripe_customer_id" text,
	"settings" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"announcement_id" uuid,
	"household_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"destination" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"resend_of_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "divisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"name" text NOT NULL,
	"birth_year_from" integer,
	"birth_year_to" integer,
	"capacity" integer NOT NULL,
	"fee_cents" integer NOT NULL,
	"early_bird" jsonb,
	"waitlist_enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"rung" text NOT NULL,
	"channel" text NOT NULL,
	"send_after" timestamp with time zone NOT NULL,
	"game_revision" integer NOT NULL,
	"sent_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"division_id" uuid NOT NULL,
	"home_team_id" uuid NOT NULL,
	"away_team_id" uuid,
	"venue_id" uuid NOT NULL,
	"field" text NOT NULL,
	"kind" text DEFAULT 'game' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"local_date" date NOT NULL,
	"local_time" text NOT NULL,
	"duration_minutes" integer DEFAULT 90 NOT NULL,
	"note" text,
	"published_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"sms_consent" boolean DEFAULT false NOT NULL,
	"sms_consent_at" timestamp with time zone,
	"link_token_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installment_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"due_on" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"error" text,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"job" text NOT NULL,
	"run_date" date NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"summary" jsonb,
	CONSTRAINT "job_runs_job_run_date_pk" PRIMARY KEY("job","run_date")
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"registration_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"deposit_cents" integer NOT NULL,
	"installments" jsonb NOT NULL,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"kind" text DEFAULT 'payment' NOT NULL,
	"method" text DEFAULT 'card' NOT NULL,
	"status" text DEFAULT 'settled' NOT NULL,
	"amount_cents" integer NOT NULL,
	"stripe_payment_intent_id" text,
	"stripe_refund_id" text,
	"platform_fee_cents" integer DEFAULT 0 NOT NULL,
	"reference" text,
	"note" text,
	"received_on" date NOT NULL,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"birthdate" date NOT NULL,
	"medical_notes_enc" text,
	"emergency_contacts_enc" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"division_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"fee_cents" integer NOT NULL,
	"discounts" jsonb NOT NULL,
	"amount_cents" integer NOT NULL,
	"platform_fee_cents" integer DEFAULT 0 NOT NULL,
	"waiver_text" text,
	"waiver_ack_at" timestamp with time zone,
	"answers" jsonb,
	"waitlist_position" integer,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roster_spots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"division_id" uuid NOT NULL,
	"jersey_number" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"severity" text NOT NULL,
	"kind" text NOT NULL,
	"game_ids" uuid[] NOT NULL,
	"explanation" text NOT NULL,
	"overridden_at" timestamp with time zone,
	"overridden_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"registration_opens_on" date NOT NULL,
	"registration_closes_on" date NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"settings" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_usage" (
	"club_id" uuid NOT NULL,
	"month" text NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sms_usage_club_id_month_pk" PRIMARY KEY("club_id","month")
);
--> statement-breakpoint
CREATE TABLE "team_staff" (
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'coach' NOT NULL,
	CONSTRAINT "team_staff_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"division_id" uuid NOT NULL,
	"name" text NOT NULL,
	"capacity" integer DEFAULT 14 NOT NULL,
	"roster_locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'coach' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"fields" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "volunteer_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reminded_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"no_show" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "volunteer_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"game_id" uuid,
	"event_label" text,
	"starts_at" timestamp with time zone NOT NULL,
	"role" text NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"source" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_events_source_event_id_pk" PRIMARY KEY("source","event_id")
);
--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_sent_by_user_id_users_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_reminders" ADD CONSTRAINT "game_reminders_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_reminders" ADD CONSTRAINT "game_reminders_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_charges" ADD CONSTRAINT "installment_charges_schedule_id_payment_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."payment_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_spots" ADD CONSTRAINT "roster_spots_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_spots" ADD CONSTRAINT "roster_spots_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_spots" ADD CONSTRAINT "roster_spots_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_conflicts" ADD CONSTRAINT "schedule_conflicts_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_conflicts" ADD CONSTRAINT "schedule_conflicts_overridden_by_user_id_users_id_fk" FOREIGN KEY ("overridden_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_usage" ADD CONSTRAINT "sms_usage_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_staff" ADD CONSTRAINT "team_staff_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_staff" ADD CONSTRAINT "team_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_claims" ADD CONSTRAINT "volunteer_claims_slot_id_volunteer_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."volunteer_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_claims" ADD CONSTRAINT "volunteer_claims_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_slots" ADD CONSTRAINT "volunteer_slots_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_slots" ADD CONSTRAINT "volunteer_slots_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_slots" ADD CONSTRAINT "volunteer_slots_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcements_club_idx" ON "announcements" USING btree ("club_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_club_idx" ON "audit_log" USING btree ("club_id","created_at");--> statement-breakpoint
CREATE INDEX "deliveries_announcement_idx" ON "deliveries" USING btree ("announcement_id","status");--> statement-breakpoint
CREATE INDEX "deliveries_household_idx" ON "deliveries" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_unique_idx" ON "deliveries" USING btree ("announcement_id","household_id","channel","resend_of_id");--> statement-breakpoint
CREATE INDEX "divisions_season_idx" ON "divisions" USING btree ("season_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "game_reminders_rung_idx" ON "game_reminders" USING btree ("game_id","rung","game_revision");--> statement-breakpoint
CREATE INDEX "game_reminders_due_idx" ON "game_reminders" USING btree ("send_after","sent_at");--> statement-breakpoint
CREATE INDEX "games_season_start_idx" ON "games" USING btree ("season_id","starts_at");--> statement-breakpoint
CREATE INDEX "games_venue_field_start_idx" ON "games" USING btree ("venue_id","field","starts_at");--> statement-breakpoint
CREATE INDEX "games_home_team_idx" ON "games" USING btree ("home_team_id","starts_at");--> statement-breakpoint
CREATE INDEX "games_away_team_idx" ON "games" USING btree ("away_team_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "households_club_email_idx" ON "households" USING btree ("club_id","email");--> statement-breakpoint
CREATE INDEX "households_club_idx" ON "households" USING btree ("club_id");--> statement-breakpoint
CREATE UNIQUE INDEX "installment_charges_key_idx" ON "installment_charges" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "installment_charges_schedule_idx" ON "installment_charges" USING btree ("schedule_id","seq");--> statement-breakpoint
CREATE INDEX "allocations_payment_idx" ON "payment_allocations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "allocations_registration_idx" ON "payment_allocations" USING btree ("registration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_schedules_registration_idx" ON "payment_schedules" USING btree ("registration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_intent_idx" ON "payments" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_refund_idx" ON "payments" USING btree ("stripe_refund_id");--> statement-breakpoint
CREATE INDEX "payments_household_idx" ON "payments" USING btree ("household_id","received_on");--> statement-breakpoint
CREATE INDEX "players_household_idx" ON "players" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "registrations_division_player_idx" ON "registrations" USING btree ("division_id","player_id");--> statement-breakpoint
CREATE INDEX "registrations_division_status_idx" ON "registrations" USING btree ("division_id","status");--> statement-breakpoint
CREATE INDEX "registrations_household_idx" ON "registrations" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE INDEX "registrations_season_idx" ON "registrations" USING btree ("season_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "roster_team_player_idx" ON "roster_spots" USING btree ("team_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roster_division_player_idx" ON "roster_spots" USING btree ("division_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roster_team_jersey_idx" ON "roster_spots" USING btree ("team_id","jersey_number");--> statement-breakpoint
CREATE INDEX "roster_team_idx" ON "roster_spots" USING btree ("team_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "conflicts_fingerprint_idx" ON "schedule_conflicts" USING btree ("season_id","fingerprint");--> statement-breakpoint
CREATE INDEX "conflicts_season_idx" ON "schedule_conflicts" USING btree ("season_id","severity");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_slug_idx" ON "seasons" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "seasons_club_idx" ON "seasons" USING btree ("club_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_division_name_idx" ON "teams" USING btree ("division_id","name");--> statement-breakpoint
CREATE INDEX "teams_division_idx" ON "teams" USING btree ("division_id");--> statement-breakpoint
CREATE INDEX "users_club_idx" ON "users" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "venues_club_idx" ON "venues" USING btree ("club_id");--> statement-breakpoint
CREATE UNIQUE INDEX "volunteer_claims_live_idx" ON "volunteer_claims" USING btree ("slot_id","household_id") WHERE released_at is null;--> statement-breakpoint
CREATE INDEX "volunteer_claims_slot_idx" ON "volunteer_claims" USING btree ("slot_id");--> statement-breakpoint
CREATE INDEX "volunteer_claims_household_idx" ON "volunteer_claims" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "volunteer_slots_season_idx" ON "volunteer_slots" USING btree ("season_id","starts_at");--> statement-breakpoint
CREATE INDEX "volunteer_slots_game_idx" ON "volunteer_slots" USING btree ("game_id");