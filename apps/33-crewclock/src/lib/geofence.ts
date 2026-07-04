/**
 * src/lib/geofence.ts
 *
 * Geofence evaluation: turns a raw punch position into an honest
 * inside/outside/unavailable verdict against a job site's circle.
 * Pure functions -- no I/O; callers persist the verdict on the entry.
 *
 * TODO:
 * - [ ] haversineDistanceM(a, b): great-circle distance in meters.
 * - [ ] evaluateGeofence(position, site): inside when
 *       distance <= radius_m + accuracy_m (accuracy widens the fence --
 *       never punish a worker for a weak GPS fix); outside beyond that;
 *       unavailable when coordinates are null (denied / timeout).
 * - [ ] Clamp absurd accuracy values (> 1000m -> treat as unavailable,
 *       record the raw value anyway).
 * - [ ] distanceFromFenceM(position, site): signed meters for the UI
 *       ("142 m from site / a 142 m del sitio").
 * - [ ] Never reject a punch on geofence grounds -- verdicts are labels
 *       for review, not gates (README "Honest GPS").
 * - [ ] Unit tests: on-boundary, accuracy-widened, antimeridian sanity.
 */

import type { GeofenceStatus, PunchLocation } from "../db/schema";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface JobSiteFence {
  center: GeoPoint;
  radiusM: number;
}

export interface GeofenceVerdict {
  status: GeofenceStatus;
  distanceM: number | null;
  accuracyM: number | null;
}

export function haversineDistanceM(_a: GeoPoint, _b: GeoPoint): number {
  throw new Error("Not implemented");
}

export function evaluateGeofence(
  _position: PunchLocation,
  _site: JobSiteFence,
): GeofenceVerdict {
  throw new Error("Not implemented");
}
