/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for Briefcast. Single source of truth for the data model
 * described in ARCHITECTURE.md. All tenant-owned tables carry org_id.
 *
 * TODO:
 * - [ ] Define pgEnum types (plan, meeting_status, bot_status, crm_provider,
 *       sync_status, write_mode, role, bot_join_rule)
 * - [ ] Define tables: organizations, users, calendar_connections, meetings,
 *       bots, transcripts, transcript_segments, summaries, action_items,
 *       crm_connections, crm_sync_logs, deals, meeting_deal_links, subscriptions
 * - [ ] Encrypt token columns at the application layer (pgcrypto or app-side AES)
 * - [ ] Add relations() helpers and indexes (org_id everywhere; meetings.starts_at;
 *       crm_sync_logs (meeting_id, status); transcript_segments (transcript_id, idx))
 * - [ ] Wire drizzle-kit generate/migrate via drizzle.config.ts
 */

import { pgTable, text, timestamp, integer, boolean, jsonb, uuid } from "drizzle-orm/pg-core";

// Example shape only -- full schema to be implemented per ARCHITECTURE.md.
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan").notNull().default("starter"), // TODO: pgEnum starter|pro|business
  stripeCustomerId: text("stripe_customer_id"),
  settings: jsonb("settings"), // consent mode, auto-apply CRM updates, retention days
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const meetings = pgTable("meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id),
  title: text("title"),
  platform: text("platform"), // TODO: pgEnum zoom|meet|teams
  joinUrl: text("join_url"),
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  attendees: jsonb("attendees"),
  isExternal: boolean("is_external").notNull().default(false),
  status: text("status").notNull().default("scheduled"),
  durationSeconds: integer("duration_seconds"),
});

// TODO: users, calendar_connections, bots, transcripts, transcript_segments,
// summaries, action_items, crm_connections, crm_sync_logs, deals,
// meeting_deal_links, subscriptions
