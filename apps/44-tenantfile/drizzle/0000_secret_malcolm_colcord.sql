CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"applicant_name" text NOT NULL,
	"applicant_email" text NOT NULL,
	"applicant_phone" text DEFAULT '' NOT NULL,
	"answers" jsonb NOT NULL,
	"document_keys" text[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"decline_reason" text,
	"adverse_action_sent_at" timestamp with time zone,
	"adverse_action_body" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"landlord_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text DEFAULT '' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"due_on" date NOT NULL,
	"period" text,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"source_charge_id" uuid,
	"prorated" boolean DEFAULT false NOT NULL,
	"manually_adjusted" boolean DEFAULT false NOT NULL,
	"waived_at" timestamp with time zone,
	"waived_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"ref_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"summary" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"amount_cents" integer,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "landlords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"plan" text DEFAULT 'keys' NOT NULL,
	"stripe_customer_id" text,
	"stripe_account_id" text,
	"trial_ends_at" timestamp with time zone,
	"settings" jsonb DEFAULT '{"reminderUpcomingDays":3,"reminderLateDays":1,"cardFeePassthrough":true,"rentDueDay":1}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "late_fee_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"grace_days" integer DEFAULT 5 NOT NULL,
	"kind" text DEFAULT 'flat' NOT NULL,
	"amount" integer DEFAULT 5000 NOT NULL,
	"max_per_month_cents" integer,
	"state_cap_ack" boolean DEFAULT false NOT NULL,
	"state_cap_note" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "late_fee_rules_tenancy_id_unique" UNIQUE("tenancy_id")
);
--> statement-breakpoint
CREATE TABLE "leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"source" text DEFAULT 'state_template' NOT NULL,
	"provider_envelope_id" text,
	"provider" text DEFAULT 'builtin' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"fields" jsonb NOT NULL,
	"signatures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"signed_pdf_key" text,
	"landlord_token" text NOT NULL,
	"tenant_token" text NOT NULL,
	"sent_at" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"headline" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"photo_keys" text[] DEFAULT '{}' NOT NULL,
	"requirements" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listings_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "maintenance_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'routine' NOT NULL,
	"cost_cents" integer,
	"scheduled_for" date,
	"opened_by" text NOT NULL,
	"landlord_unread" integer DEFAULT 0 NOT NULL,
	"tenant_unread" integer DEFAULT 0 NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"charge_id" uuid,
	"amount_cents" integer NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'succeeded' NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"stripe_payment_intent_id" text,
	"fee_cents" integer DEFAULT 0 NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" text DEFAULT 'landlord' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id")
);
--> statement-breakpoint
CREATE TABLE "processed_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"landlord_id" uuid NOT NULL,
	"address" text NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"state" text DEFAULT '' NOT NULL,
	"postal_code" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'single' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"charge_id" uuid NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"template" text NOT NULL,
	"send_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"sent_at" timestamp with time zone,
	"provider_message_id" text,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"author" text NOT NULL,
	"body" text NOT NULL,
	"photo_keys" text[] DEFAULT '{}' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screening_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"provider_ref" text,
	"status" text DEFAULT 'invited' NOT NULL,
	"consent_at" timestamp with time zone,
	"consent_ip" text,
	"consent_name" text,
	"received_on" date,
	"expires_on" date,
	"landlord_note" text DEFAULT '' NOT NULL,
	"paid_by_applicant" boolean DEFAULT true NOT NULL,
	"invite_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "screening_reports_invite_token_unique" UNIQUE("invite_token")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"landlord_id" uuid NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"price_id" text,
	"plan" text DEFAULT 'keys' NOT NULL,
	"status" text NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_landlord_id_unique" UNIQUE("landlord_id")
);
--> statement-breakpoint
CREATE TABLE "tenancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"application_id" uuid,
	"tenant_names" text[] DEFAULT '{}' NOT NULL,
	"tenant_emails" text[] DEFAULT '{}' NOT NULL,
	"tenant_phones" text[] DEFAULT '{}' NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"rent_cents" integer NOT NULL,
	"deposit_cents" integer DEFAULT 0 NOT NULL,
	"rent_due_day" integer DEFAULT 1 NOT NULL,
	"prorate_first_month" boolean DEFAULT true NOT NULL,
	"prorate_last_month" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"portal_token" text NOT NULL,
	"activated_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenancies_portal_token_unique" UNIQUE("portal_token")
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"label" text NOT NULL,
	"beds" integer DEFAULT 1 NOT NULL,
	"baths" integer DEFAULT 1 NOT NULL,
	"sqft" integer,
	"rent_cents" integer DEFAULT 0 NOT NULL,
	"deposit_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'vacant' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"landlord_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_landlord_id_landlords_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."landlords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_events" ADD CONSTRAINT "file_events_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "late_fee_rules" ADD CONSTRAINT "late_fee_rules_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_landlord_id_landlords_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."landlords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_messages" ADD CONSTRAINT "request_messages_request_id_maintenance_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."maintenance_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_reports" ADD CONSTRAINT "screening_reports_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_landlord_id_landlords_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."landlords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_landlord_id_landlords_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."landlords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_listing_idx" ON "applications" USING btree ("listing_id","status");--> statement-breakpoint
CREATE INDEX "audit_landlord_idx" ON "audit_log" USING btree ("landlord_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "charges_rent_period_uniq" ON "charges" USING btree ("tenancy_id","period") WHERE kind = 'rent';--> statement-breakpoint
CREATE UNIQUE INDEX "charges_late_fee_source_uniq" ON "charges" USING btree ("source_charge_id") WHERE kind = 'late_fee';--> statement-breakpoint
CREATE INDEX "charges_due_idx" ON "charges" USING btree ("status","due_on");--> statement-breakpoint
CREATE INDEX "charges_tenancy_idx" ON "charges" USING btree ("tenancy_id","due_on");--> statement-breakpoint
CREATE INDEX "file_events_tenancy_idx" ON "file_events" USING btree ("tenancy_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "file_events_dedupe_uniq" ON "file_events" USING btree ("tenancy_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "leases_tenancy_idx" ON "leases" USING btree ("tenancy_id");--> statement-breakpoint
CREATE INDEX "listings_unit_idx" ON "listings" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "requests_tenancy_idx" ON "maintenance_requests" USING btree ("tenancy_id","status");--> statement-breakpoint
CREATE INDEX "payments_tenancy_idx" ON "payments" USING btree ("tenancy_id","paid_at");--> statement-breakpoint
CREATE INDEX "properties_landlord_idx" ON "properties" USING btree ("landlord_id");--> statement-breakpoint
CREATE INDEX "reminders_due_idx" ON "reminders" USING btree ("status","send_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_charge_uniq" ON "reminders" USING btree ("charge_id","template","channel");--> statement-breakpoint
CREATE INDEX "request_messages_idx" ON "request_messages" USING btree ("request_id","sent_at");--> statement-breakpoint
CREATE INDEX "screening_application_idx" ON "screening_reports" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "tenancies_unit_idx" ON "tenancies" USING btree ("unit_id","status");--> statement-breakpoint
CREATE INDEX "units_property_idx" ON "units" USING btree ("property_id");