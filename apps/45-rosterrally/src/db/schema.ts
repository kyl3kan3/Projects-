/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for all RosterRally tables. Single source of truth
 * for the data model in ARCHITECTURE.md ("Data Model" section).
 * Migrations are generated via `npm run db:generate`.
 *
 * TODO:
 * - [ ] Define pgTable for: clubs, users, seasons, divisions, households,
 *       players, registrations, payment_schedules, teams, roster_spots,
 *       venues, games, conflicts, announcements, deliveries,
 *       volunteer_slots, volunteer_claims, audit_log (plus Auth.js tables).
 * - [ ] pgEnum for plan, registration status, game kind, conflict
 *       severity/kind, delivery status, staff role.
 * - [ ] Unique constraints: roster_spots (team_id, player_id); one team per
 *       player per division (partial unique via division join or trigger);
 *       one registration per (division_id, player_id).
 * - [ ] Composite indexes: games (season_id, starts_at), games (venue_id,
 *       field, starts_at) for the conflict checker, deliveries
 *       (announcement_id, status), registrations (division_id, status).
 * - [ ] players.medical_notes encrypted at rest (MEDICAL_FIELD_KEY);
 *       excluded from coach-scoped selects by convention.
 */

export type Plan = "per_registration" | "flat";

export type RegistrationStatus =
  | "pending"
  | "paid"
  | "installments"
  | "waitlisted"
  | "refunded"
  | "canceled";

export type GameKind = "game" | "practice" | "event";

export type ConflictSeverity = "hard" | "soft";

export type ConflictKind =
  | "field_overlap"
  | "team_double_booked"
  | "coach_overlap"
  | "sibling_overlap";

export type DeliveryStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "failed";

export type StaffRole = "admin" | "registrar" | "treasurer" | "coach" | "manager";

// TODO: replace these placeholders with actual drizzle pgTable definitions.
export const clubs: unknown = undefined;
export const users: unknown = undefined;
export const seasons: unknown = undefined;
export const divisions: unknown = undefined;
export const households: unknown = undefined;
export const players: unknown = undefined;
export const registrations: unknown = undefined;
export const paymentSchedules: unknown = undefined;
export const teams: unknown = undefined;
export const rosterSpots: unknown = undefined;
export const venues: unknown = undefined;
export const games: unknown = undefined;
export const conflicts: unknown = undefined;
export const announcements: unknown = undefined;
export const deliveries: unknown = undefined;
export const volunteerSlots: unknown = undefined;
export const volunteerClaims: unknown = undefined;
export const auditLog: unknown = undefined;
