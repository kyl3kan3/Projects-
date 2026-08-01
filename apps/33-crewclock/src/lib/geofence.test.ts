import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACCURACY_CREDIT_CAP_M,
  MAX_USABLE_ACCURACY_M,
  checkTravel,
  evaluateGeofence,
  haversineDistanceM,
  metresOutsideFence,
} from "@/lib/geofence";

/** Hendricks patio, a real residential lot in Austin, with a 150 m fence. */
const SITE = { center: { lat: 30.29471, lng: -97.74052 }, radiusM: 150 };

/** Move north by n metres. One degree of latitude is πR/180 on our sphere. */
const METRES_PER_DEGREE_LAT = (Math.PI * 6_371_008.8) / 180;

function north(metres: number) {
  return { lat: SITE.center.lat + metres / METRES_PER_DEGREE_LAT, lng: SITE.center.lng };
}

describe("haversine", () => {
  it("is zero at the same point", () => {
    assert.equal(haversineDistanceM(SITE.center, SITE.center), 0);
  });

  it("measures a known north-south offset to within a centimetre", () => {
    assert.ok(Math.abs(haversineDistanceM(SITE.center, north(1000)) - 1000) < 0.01);
  });

  it("handles the antimeridian without wrapping the long way round", () => {
    const a = { lat: 0, lng: 179.999 };
    const b = { lat: 0, lng: -179.999 };
    // ~222 m apart across the line, not ~40,000 km around the planet.
    assert.ok(haversineDistanceM(a, b) < 300);
  });
});

describe("the fence verdict", () => {
  it("is inside at the centre with a good fix", () => {
    const v = evaluateGeofence({ lat: SITE.center.lat, lng: SITE.center.lng, accuracyM: 8 }, SITE);
    assert.equal(v.status, "inside");
    assert.equal(v.reason, "inside_fence");
    assert.equal(Math.round(v.distanceM!), 0);
  });

  it("is inside exactly on the boundary", () => {
    // A 150 m offset with a perfect fix: on the line counts as in.
    const v = evaluateGeofence({ ...north(149.9), accuracyM: 0 }, SITE);
    assert.equal(v.status, "inside");
    assert.equal(v.reason, "inside_fence");
  });

  it("is outside one metre past the fence with a perfect fix", () => {
    const v = evaluateGeofence({ ...north(151), accuracyM: 0 }, SITE);
    assert.equal(v.status, "outside");
    assert.equal(metresOutsideFence(v, SITE), 1);
  });

  it("widens the fence by the reported accuracy", () => {
    // 220 m out, but the phone only claims ±100 m: inside, on credit.
    const v = evaluateGeofence({ ...north(220), accuracyM: 100 }, SITE);
    assert.equal(v.status, "inside");
    assert.equal(v.reason, "inside_with_accuracy_credit");
  });

  it("caps the accuracy credit so a vague fix cannot prove presence", () => {
    // 900 m out with a ±900 m fix. Uncapped, that would read "inside".
    const v = evaluateGeofence({ ...north(900), accuracyM: 900 }, SITE);
    assert.equal(v.status, "outside");
    // The boundary of the credit: radius + 250 m.
    const justInside = evaluateGeofence(
      { ...north(SITE.radiusM + ACCURACY_CREDIT_CAP_M - 1), accuracyM: 400 },
      SITE,
    );
    assert.equal(justInside.status, "inside");
    const justOutside = evaluateGeofence(
      { ...north(SITE.radiusM + ACCURACY_CREDIT_CAP_M + 2), accuracyM: 400 },
      SITE,
    );
    assert.equal(justOutside.status, "outside");
  });

  it("gives no credit when the phone reports no accuracy at all", () => {
    const v = evaluateGeofence({ ...north(220), accuracyM: null }, SITE);
    assert.equal(v.status, "outside");
  });

  it("declines to judge a fix too vague to be a GPS fix", () => {
    const v = evaluateGeofence({ lat: SITE.center.lat, lng: SITE.center.lng, accuracyM: 1500 }, SITE);
    // Sitting at the centre — but a ±1.5 km reading cannot prove that.
    assert.equal(v.status, "unavailable");
    assert.equal(v.reason, "accuracy_unusable");
    // The raw reading is still recorded.
    assert.equal(v.accuracyM, 1500);
    assert.equal(v.distanceM, null);
  });

  it("treats the usable-accuracy boundary as usable", () => {
    const v = evaluateGeofence(
      { lat: SITE.center.lat, lng: SITE.center.lng, accuracyM: MAX_USABLE_ACCURACY_M },
      SITE,
    );
    assert.equal(v.status, "inside");
  });

  it("is unavailable, never outside, when there is no fix", () => {
    for (const position of [
      { lat: null, lng: null, accuracyM: null },
      { lat: 30.29, lng: null, accuracyM: 10 },
      { lat: Number.NaN, lng: -97.74, accuracyM: 10 },
      { lat: 91, lng: -97.74, accuracyM: 10 },
    ]) {
      const v = evaluateGeofence(position, SITE);
      assert.equal(v.status, "unavailable", JSON.stringify(position));
      assert.equal(v.reason, "no_fix");
    }
  });

  it("is unavailable when the job has no site fence", () => {
    const v = evaluateGeofence({ lat: SITE.center.lat, lng: SITE.center.lng, accuracyM: 5 }, null);
    assert.equal(v.status, "unavailable");
    assert.equal(v.reason, "no_site");
    assert.equal(metresOutsideFence(v, null), null);
  });

  it("ignores a nonsense negative accuracy rather than crediting it", () => {
    const v = evaluateGeofence({ ...north(220), accuracyM: -50 }, SITE);
    assert.equal(v.accuracyM, null);
    assert.equal(v.status, "outside");
  });
});

describe("implausible travel", () => {
  const base = new Date("2026-02-24T13:00:00Z");

  it("ignores jitter — a 40 m hop in one second is not a flag", () => {
    const check = checkTravel({
      from: SITE.center,
      fromAt: base,
      to: north(40),
      toAt: new Date(base.getTime() + 1000),
    });
    assert.equal(check.implausible, false);
  });

  it("flags 60 km covered in four minutes", () => {
    const check = checkTravel({
      from: SITE.center,
      fromAt: base,
      to: north(60_000),
      toAt: new Date(base.getTime() + 4 * 60_000),
    });
    assert.equal(check.implausible, true);
    assert.ok(check.speedMps > 55);
  });

  it("accepts a normal commute between two sites", () => {
    // 25 km in 35 minutes ≈ 43 km/h.
    const check = checkTravel({
      from: SITE.center,
      fromAt: base,
      to: north(25_000),
      toAt: new Date(base.getTime() + 35 * 60_000),
    });
    assert.equal(check.implausible, false);
  });

  it("flags two distant punches with no time between them", () => {
    const check = checkTravel({
      from: SITE.center,
      fromAt: base,
      to: north(5_000),
      toAt: base,
    });
    assert.equal(check.implausible, true);
    assert.equal(check.speedMps, Infinity);
  });
});
