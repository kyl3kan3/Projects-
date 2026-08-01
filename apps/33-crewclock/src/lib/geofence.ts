/**
 * Geofence evaluation. Pure functions; callers persist the verdict.
 *
 * ## The policy, decided deliberately
 *
 * A phone's location is a claim with an error bar, not a fact. The product's
 * differentiator (README "Honest GPS") is that we never pretend otherwise. So:
 *
 * 1. **A punch is never rejected on geofence grounds.** Ever. The verdict is a
 *    label for review; workers get paid, owners get flags. A time clock that
 *    refuses to record work is a wage-theft machine.
 * 2. **Accuracy widens the fence, up to a cap.** `inside` requires
 *    `distance ≤ radius + min(accuracy, ACCURACY_CREDIT_CAP_M)`. Crediting the
 *    full accuracy would let a ±900 m fix "prove" presence at a 150 m site, so
 *    the credit stops at 250 m — generous enough for a phone under a metal roof,
 *    tight enough that the word "inside" still means something.
 * 3. **Too vague to judge is `unavailable`, not `outside`.** An accuracy worse
 *    than `MAX_USABLE_ACCURACY_M` (1000 m — a cell-tower fix, not a GPS fix)
 *    cannot support either verdict, so we record the reading and say we don't
 *    know. Calling that "outside" would be an accusation built on noise.
 * 4. **No coordinates is `unavailable`.** Denied permission, timeout, no sky:
 *    all the same, all recorded, all flagged for review.
 * 5. **Spoofing raises the cost of cheating; it does not become impossible.**
 *    We flag what physics rules out — a punch that would require travelling
 *    faster than `IMPLAUSIBLE_SPEED_MPS` since the worker's previous punch — and
 *    we flag one device punching for several people. Both are review flags. We
 *    say so in marketing rather than claiming spoof-proof GPS.
 */

import type { GeofenceStatus, PunchLocation } from "@/db/schema";

/** Beyond this the fix is a cell-tower guess; we decline to judge. */
export const MAX_USABLE_ACCURACY_M = 1000;
/** How much slack a weak-but-usable fix earns. */
export const ACCURACY_CREDIT_CAP_M = 250;
/** ~200 km/h. Above it, the two punches cannot both be true. */
export const IMPLAUSIBLE_SPEED_MPS = 55;
/** Below this a "trip" is just GPS jitter, never an implausible-speed flag. */
export const MIN_TRAVEL_FOR_SPEED_CHECK_M = 500;

const EARTH_RADIUS_M = 6_371_008.8;

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface JobSiteFence {
  center: GeoPoint;
  radiusM: number;
}

export type GeofenceReason =
  | "inside_fence"
  | "inside_with_accuracy_credit"
  | "outside_fence"
  | "no_fix"
  | "accuracy_unusable"
  | "no_site";

export interface GeofenceVerdict {
  status: GeofenceStatus;
  /** Metres from the site centre, or null when there is no usable fix. */
  distanceM: number | null;
  /** The reading's own claimed accuracy, recorded verbatim. */
  accuracyM: number | null;
  reason: GeofenceReason;
}

/** Great-circle distance in metres (haversine). */
export function haversineDistanceM(a: GeoPoint, b: GeoPoint): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function usableFix(position: PunchLocation): boolean {
  return (
    position.lat !== null &&
    position.lng !== null &&
    Number.isFinite(position.lat) &&
    Number.isFinite(position.lng) &&
    Math.abs(position.lat) <= 90 &&
    Math.abs(position.lng) <= 180
  );
}

/**
 * The verdict for one punch against one site.
 *
 * `site` may be null (a job with no site attached yet) — then there is nothing
 * to verify against and the honest answer is `unavailable`.
 */
export function evaluateGeofence(
  position: PunchLocation,
  site: JobSiteFence | null,
): GeofenceVerdict {
  const accuracyM =
    position.accuracyM !== null &&
    position.accuracyM !== undefined &&
    Number.isFinite(position.accuracyM) &&
    position.accuracyM >= 0
      ? position.accuracyM
      : null;

  if (!usableFix(position)) {
    return { status: "unavailable", distanceM: null, accuracyM, reason: "no_fix" };
  }
  if (accuracyM !== null && accuracyM > MAX_USABLE_ACCURACY_M) {
    // Recorded, not judged. The raw accuracy is kept for the review screen.
    return { status: "unavailable", distanceM: null, accuracyM, reason: "accuracy_unusable" };
  }
  if (!site) {
    return { status: "unavailable", distanceM: null, accuracyM, reason: "no_site" };
  }

  const distanceM = haversineDistanceM(site.center, {
    lat: position.lat as number,
    lng: position.lng as number,
  });

  // A missing accuracy figure earns no credit: we evaluate what we were told.
  const credit = accuracyM === null ? 0 : Math.min(accuracyM, ACCURACY_CREDIT_CAP_M);

  if (distanceM <= site.radiusM) {
    return { status: "inside", distanceM, accuracyM, reason: "inside_fence" };
  }
  if (distanceM <= site.radiusM + credit) {
    return { status: "inside", distanceM, accuracyM, reason: "inside_with_accuracy_credit" };
  }
  return { status: "outside", distanceM, accuracyM, reason: "outside_fence" };
}

/** How far outside the fence, for the crew screen's honest caption. */
export function metresOutsideFence(
  verdict: GeofenceVerdict,
  site: JobSiteFence | null,
): number | null {
  if (!site || verdict.distanceM === null) return null;
  return Math.max(0, Math.round(verdict.distanceM - site.radiusM));
}

/* ------------------------------------------------------- spoofing signals --- */

export interface TravelCheckInput {
  from: GeoPoint;
  fromAt: Date;
  to: GeoPoint;
  toAt: Date;
}

export interface TravelCheck {
  distanceM: number;
  seconds: number;
  speedMps: number;
  implausible: boolean;
}

/**
 * Could the same person have been in both places? Short hops are ignored (GPS
 * jitter), and a zero-or-negative time delta across real distance is
 * implausible by definition. This produces a flag, never a rejection.
 */
export function checkTravel(input: TravelCheckInput): TravelCheck {
  const distanceM = haversineDistanceM(input.from, input.to);
  const seconds = (input.toAt.getTime() - input.fromAt.getTime()) / 1000;

  if (distanceM < MIN_TRAVEL_FOR_SPEED_CHECK_M) {
    return { distanceM, seconds, speedMps: 0, implausible: false };
  }
  if (seconds <= 0) {
    return { distanceM, seconds, speedMps: Infinity, implausible: true };
  }
  const speedMps = distanceM / seconds;
  return { distanceM, seconds, speedMps, implausible: speedMps > IMPLAUSIBLE_SPEED_MPS };
}
