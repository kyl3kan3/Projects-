import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allowedInterval, allowedRegions, channelAllowed, plan, planForPrice } from "@/lib/plans";
import { EXPIRY_THRESHOLDS } from "@/lib/incidents";

describe("plan limits", () => {
  it("clamps a too-frequent interval up to what the plan allows", () => {
    assert.equal(allowedInterval("free", 60), 300);
    assert.equal(allowedInterval("solo", 60), 60);
    // A slower interval than the minimum is always the customer's choice.
    assert.equal(allowedInterval("free", 3600), 3600);
  });

  it("trims region fan-out to the plan", () => {
    const available = ["iad", "fra", "sin"];
    assert.deepEqual(allowedRegions("free", ["iad", "fra", "sin"], available), ["iad"]);
    assert.deepEqual(allowedRegions("solo", ["iad", "fra", "sin"], available), ["iad", "fra", "sin"]);
  });

  it("ignores regions the fleet does not have", () => {
    assert.deepEqual(allowedRegions("solo", ["mars", "fra"], ["iad", "fra"]), ["fra"]);
  });

  it("falls back to one region when nothing valid was asked for", () => {
    assert.deepEqual(allowedRegions("solo", [], ["iad", "fra"]), ["iad"]);
    assert.deepEqual(allowedRegions("solo", ["mars"], ["iad", "fra"]), ["iad"]);
  });

  it("gates channels by plan", () => {
    assert.equal(channelAllowed("free", "email"), true);
    assert.equal(channelAllowed("free", "webhook"), true);
    assert.equal(channelAllowed("free", "slack"), false);
    assert.equal(channelAllowed("solo", "slack"), true);
    assert.equal(channelAllowed("solo", "sms"), false);
    assert.equal(channelAllowed("team", "sms"), true);
  });

  it("defaults an unknown plan id to free", () => {
    // @ts-expect-error deliberately passing a bad id, as a webhook might.
    assert.equal(plan("enterprise").id, "free");
  });
});

describe("planForPrice", () => {
  const prices = { solo: "price_solo", team: "price_team" };

  it("maps a price id to its plan", () => {
    assert.equal(planForPrice("price_solo", prices), "solo");
    assert.equal(planForPrice("price_team", prices), "team");
  });

  it("falls back to free for anything unrecognised", () => {
    assert.equal(planForPrice("price_unknown", prices), "free");
    assert.equal(planForPrice(null, prices), "free");
    assert.equal(planForPrice(undefined, prices), "free");
  });
});

describe("expiry thresholds", () => {
  it("selects the tightest crossed threshold, not the loosest", () => {
    // Regression: find() returned 30 forever, so a cert warned once at 30 days
    // and then went silent all the way to expiry.
    const tightest = (daysRemaining: number) =>
      EXPIRY_THRESHOLDS.findLast((t) => daysRemaining <= t) ?? null;

    assert.equal(tightest(60), null);
    assert.equal(tightest(30), 30);
    assert.equal(tightest(20), 30);
    assert.equal(tightest(14), 14);
    assert.equal(tightest(10), 14);
    assert.equal(tightest(7), 7);
    assert.equal(tightest(3), 7);
    assert.equal(tightest(1), 1);
    assert.equal(tightest(0), 1);
    assert.equal(tightest(-5), 1);
  });
});
