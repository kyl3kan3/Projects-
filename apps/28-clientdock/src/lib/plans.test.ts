import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCreatePortal,
  moduleAllowed,
  moduleUpsell,
  plan,
  planForPrice,
  showsClientDockBadge,
  trialExpired,
} from "@/lib/plans";
import { sanitizeModules, DEFAULT_MODULES } from "@/lib/portals";

const PRICES = { solo: "price_solo", agency: "price_agency", studio: "price_studio" };

describe("plan limits", () => {
  it("caps portals per plan, counting from zero", () => {
    assert.equal(canCreatePortal("trial", 0), true);
    assert.equal(canCreatePortal("trial", 1), true);
    assert.equal(canCreatePortal("trial", 2), false);
    assert.equal(canCreatePortal("solo", 9), true);
    assert.equal(canCreatePortal("solo", 10), false);
    assert.equal(canCreatePortal("agency", 49), true);
    assert.equal(canCreatePortal("agency", 50), false);
    // Studio is unlimited — a big number must not accidentally wrap into a cap.
    assert.equal(canCreatePortal("studio", 100_000), true);
  });

  it("gates the two paid modules and explains why", () => {
    assert.equal(moduleAllowed("solo", "approvals"), false);
    assert.equal(moduleAllowed("solo", "invoices"), false);
    assert.equal(moduleAllowed("agency", "approvals"), true);
    assert.equal(moduleAllowed("agency", "invoices"), true);
    // The always-available modules are never gated on any plan.
    for (const planId of ["trial", "solo", "agency", "studio"] as const) {
      for (const moduleId of ["timeline", "files", "messages", "links"]) {
        assert.equal(moduleAllowed(planId, moduleId), true, `${planId}/${moduleId}`);
      }
    }
    assert.match(moduleUpsell("solo", "approvals") ?? "", /Agency/);
    assert.equal(moduleUpsell("agency", "approvals"), null);
  });

  it("keeps the ClientDock badge off Agency and Studio only", () => {
    assert.equal(showsClientDockBadge("trial"), true);
    assert.equal(showsClientDockBadge("solo"), true);
    assert.equal(showsClientDockBadge("agency"), false);
    assert.equal(showsClientDockBadge("studio"), false);
  });

  it("maps Stripe prices to plans and unknown prices to trial", () => {
    assert.equal(planForPrice("price_agency", PRICES), "agency");
    assert.equal(planForPrice("price_studio", PRICES), "studio");
    assert.equal(planForPrice("price_solo", PRICES), "solo");
    assert.equal(planForPrice("price_someone_elses", PRICES), "trial");
    assert.equal(planForPrice(null, PRICES), "trial");
    // An unset price env must not silently promote everyone to a paid tier.
    assert.equal(planForPrice("", { solo: "", agency: "", studio: "" }), "trial");
  });

  it("defaults an unknown plan id to trial rather than throwing", () => {
    // @ts-expect-error deliberately passing a bad id, as a webhook might.
    assert.equal(plan("enterprise").id, "trial");
  });

  it("only expires a trial that has an end date in the past", () => {
    const now = new Date("2026-08-01T00:00:00Z");
    assert.equal(trialExpired("trial", new Date("2026-07-31T00:00:00Z"), now), true);
    assert.equal(trialExpired("trial", new Date("2026-08-02T00:00:00Z"), now), false);
    assert.equal(trialExpired("trial", null, now), false);
    // A paying workspace is never "expired", whatever the old trial date says.
    assert.equal(trialExpired("agency", new Date("2020-01-01T00:00:00Z"), now), false);
  });
});

describe("module sanitising", () => {
  it("drops modules the plan doesn't allow and unknown ids", () => {
    assert.deepEqual(
      sanitizeModules("solo", ["timeline", "approvals", "invoices", "files", "nonsense"]),
      ["timeline", "files"],
    );
    assert.deepEqual(sanitizeModules("agency", ["invoices", "approvals"]), [
      "approvals",
      "invoices",
    ]);
  });

  it("returns modules in the order DESIGN.md lists them, not the input order", () => {
    assert.deepEqual(sanitizeModules("agency", ["links", "timeline", "messages"]), [
      "timeline",
      "messages",
      "links",
    ]);
  });

  it("keeps the default set intact on a plan that allows all of it", () => {
    assert.deepEqual(sanitizeModules("agency", DEFAULT_MODULES), DEFAULT_MODULES);
  });

  it("silently drops approvals from the default set on Solo", () => {
    // Solo has no e-approvals, so a default new portal there has three rooms.
    assert.deepEqual(sanitizeModules("solo", DEFAULT_MODULES), [
      "timeline",
      "files",
      "messages",
    ]);
  });
});
