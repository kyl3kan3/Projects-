/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for all WaiverWing tables. Single source of truth
 * for the data model described in ARCHITECTURE.md ("Data Model" section).
 *
 * TODO:
 * - [ ] Define pgTable for: accounts, users, locations, waivers,
 *       waiver_versions, participants, signatures, checkins, incidents,
 *       incident_participants, exports, webhook_events (plus Auth.js
 *       tables).
 * - [ ] pgEnum for plan, user role, waiver status, expiry rule,
 *       signature kind, signing channel, incident status.
 * - [ ] participants.guardian_participant_id self-reference; signatures
 *       .signed_by_participant_id for guardian signing.
 * - [ ] Unique constraints: webhook_events.stripe_event_id,
 *       signatures.offline_key (kiosk sync idempotency),
 *       waiver_versions (waiver_id, version).
 * - [ ] Indexes: pg_trgm GIN on participants (first_name, last_name,
 *       email, phone); signatures (participant_id, expires_at);
 *       checkins (location_id, checked_in_at).
 * - [ ] relations() definitions; tenancy convention: every domain table
 *       carries account_id or reaches it through locations.
 */

export type Plan = "counter" | "front_desk" | "operator";

export type ExpiryRule = "visit" | "days_365" | "forever";

export type SignatureKind = "typed" | "drawn";

export type SigningChannel = "qr" | "kiosk" | "link";

export type IncidentStatus = "open" | "closed";

/** Block config persisted on waiver_versions.body_blocks. */
export interface WaiverBlock {
  key: string;
  kind: "liability_text" | "initialed_clause" | "question" | "signature";
  config: Record<string, unknown>;
}
