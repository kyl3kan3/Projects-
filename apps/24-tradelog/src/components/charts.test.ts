import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CURVE_FRAME,
  gapArea,
  heatOpacity,
  pathLength,
  polyline,
  project,
  sharedDomain,
  zeroY,
} from "@/components/charts";

const frame = { width: 100, height: 100, padTop: 0, padBottom: 0 };

describe("project", () => {
  it("maps the highest value to the top and the lowest to the bottom", () => {
    const points = project([0, 50, 100], frame, { min: 0, max: 100 });
    assert.deepEqual(points, [
      { x: 0, y: 100 },
      { x: 50, y: 50 },
      { x: 100, y: 0 },
    ]);
  });

  it("centres a flat series instead of dividing by a zero range", () => {
    const points = project([25, 25, 25], frame, { min: 25, max: 25 });
    assert.deepEqual(points.map((p) => p.y), [50, 50, 50]);
  });

  it("puts a single point in the middle", () => {
    assert.deepEqual(project([10], frame), [{ x: 50, y: 0 }]);
  });

  it("always includes zero in an inferred domain, so a losing curve reads as one", () => {
    // Values are all negative; zero must stay at the top of the frame.
    const points = project([-100, -200], frame);
    assert.equal(points[0].y, 50);
    assert.equal(points[1].y, 100);
  });

  it("returns nothing for an empty series rather than a degenerate path", () => {
    assert.deepEqual(project([], frame), []);
    assert.equal(polyline([]), "");
  });
});

describe("sharedDomain", () => {
  it("spans both series and includes zero", () => {
    assert.deepEqual(sharedDomain([10, 20], [-5, 40]), { min: -5, max: 40 });
    assert.deepEqual(sharedDomain([10, 20]), { min: 0, max: 20 });
  });
});

describe("paths", () => {
  it("writes a polyline", () => {
    assert.equal(polyline(project([0, 100], frame)), "M0 100 L100 0");
  });

  it("closes the gap polygon between two curves", () => {
    const upper = project([100, 100], frame, { min: 0, max: 100 });
    const lower = project([0, 0], frame, { min: 0, max: 100 });
    assert.equal(gapArea(upper, lower), "M0 0 L100 0 L100 100 L0 100 Z");
  });

  it("needs two points to make an area", () => {
    assert.equal(gapArea([{ x: 0, y: 0 }], [{ x: 0, y: 1 }]), "");
  });

  it("measures path length for the draw animation", () => {
    assert.equal(pathLength([{ x: 0, y: 0 }, { x: 3, y: 4 }]), 5);
    assert.equal(pathLength([{ x: 0, y: 0 }]), 1, "never zero, which would break the dash");
  });
});

describe("zeroY", () => {
  it("locates the zero line inside the domain", () => {
    assert.equal(zeroY(frame, { min: -100, max: 100 }), 50);
    assert.equal(zeroY(frame, { min: 0, max: 100 }), 100);
  });

  it("is null when zero is outside the domain", () => {
    assert.equal(zeroY(frame, { min: 10, max: 100 }), null);
    assert.equal(zeroY(frame, { min: -100, max: -10 }), null);
  });
});

describe("heatOpacity", () => {
  it("scales from 15% to 80% across the month's range", () => {
    assert.equal(heatOpacity(100, 100), 0.8);
    assert.equal(heatOpacity(0, 100), 0, "a zero day gets no fill at all");
    assert.equal(heatOpacity(1, 100), 0.16);
    assert.equal(heatOpacity(50, 100), 0.48);
  });

  it("does not divide by zero in a month with no P&L", () => {
    assert.equal(heatOpacity(0, 0), 0);
  });
});

describe("the default curve frame", () => {
  it("is the 200px-high well DESIGN.md specifies", () => {
    assert.equal(CURVE_FRAME.height, 200);
  });
});
