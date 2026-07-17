/**
 * src/lib/ical.ts
 *
 * iCal feed fetching, parsing, and stay diffing (ARCHITECTURE.md flow 1).
 * Pure parse/diff logic lives here; the sync-ical worker job owns I/O
 * scheduling and persistence.
 *
 * TODO:
 * - [ ] fetchFeed(url): GET with timeout + UA header; return { body, hash }
 *       (sha256 of body) so unchanged feeds short-circuit via
 *       ical_feeds.last_hash.
 * - [ ] parseStays(body, source): node-ical VEVENTs -> NormalizedStay[].
 *       Handle Airbnb's "Reserved"/"Airbnb (Not available)" summaries
 *       (blocks are not stays), VRBO all-day events, and UTC vs floating
 *       dates. externalUid = VEVENT UID.
 * - [ ] diffStays(existing, incoming): keyed by externalUid ->
 *       { created, moved, cancelled } (moved = same UID, new boundaries;
 *       cancelled = active row missing from feed).
 * - [ ] Never guess guest details -- iCal carries stay boundaries only.
 */

export type FeedSource = "airbnb" | "vrbo" | "direct" | "other";

export interface NormalizedStay {
  externalUid: string;
  startsOn: Date;
  endsOn: Date;
  rawSummary: string;
}

export interface StayDiff {
  created: NormalizedStay[];
  moved: NormalizedStay[];
  cancelledUids: string[];
}

/** Fetch a feed body and its content hash for change short-circuiting. */
export async function fetchFeed(
  _url: string,
): Promise<{ body: string; hash: string }> {
  throw new Error("Not implemented");
}

/** Parse raw iCal text into normalized stays (blocks excluded). */
export function parseStays(
  _body: string,
  _source: FeedSource,
): NormalizedStay[] {
  throw new Error("Not implemented");
}

/** Diff current DB stays against a fresh parse, keyed by external UID. */
export function diffStays(
  _existing: NormalizedStay[],
  _incoming: NormalizedStay[],
): StayDiff {
  throw new Error("Not implemented");
}
