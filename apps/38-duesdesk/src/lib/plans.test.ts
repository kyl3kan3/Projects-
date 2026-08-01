import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  can,
  featureAllowed,
  plan,
  planForFeature,
  planForPrice,
  unitUsage,
} from "@/lib/plans";
import { normalizePhone, renderTemplate } from "@/lib/text";

describe("plan limits", () => {
  it("matches the README pricing table", () => {
    assert.equal(plan("block").units, 75);
    assert.equal(plan("neighborhood").units, 200);
    assert.equal(plan("community").units, 500);
    assert.deepEqual(
      (["block", "neighborhood", "community"] as const).map((p) => plan(p).priceMonthly),
      [49, 99, 199],
    );
  });

  it("gates SMS, late-fee rules, documents and exports to Neighborhood+", () => {
    assert.equal(featureAllowed("block", "sms"), false);
    assert.equal(featureAllowed("neighborhood", "sms"), true);
    assert.equal(featureAllowed("block", "documentLibrary"), false);
    assert.equal(featureAllowed("block", "lateFeeRules"), false);
    assert.equal(featureAllowed("neighborhood", "exports"), true);
    assert.equal(featureAllowed("neighborhood", "multiProperty"), false);
    assert.equal(featureAllowed("community", "multiProperty"), true);
  });

  it("names the cheapest plan that includes a feature, for the upgrade prompt", () => {
    assert.equal(planForFeature("sms").id, "neighborhood");
    assert.equal(planForFeature("multiProperty").id, "community");
  });

  it("defaults an unknown plan id to Block rather than to nothing", () => {
    // A webhook carrying a plan we do not recognise must not lock a board out.
    // @ts-expect-error deliberately bad id
    assert.equal(plan("enterprise").id, "block");
  });
});

describe("unitUsage", () => {
  it("reports overflow without pretending the units do not exist", () => {
    // ROADMAP: "unit 76 on Block prompts an upgrade, never blocks silently."
    const usage = unitUsage("block", 76);
    assert.deepEqual(usage, { used: 76, included: 75, over: 1, nearLimit: true });
  });

  it("warns from 90% of the cap", () => {
    // Block includes 75, so the warning threshold is floor(75 * 0.9) = 67.
    assert.equal(unitUsage("block", 66).nearLimit, false);
    assert.equal(unitUsage("block", 67).nearLimit, true);
    assert.equal(unitUsage("neighborhood", 100).nearLimit, false);
    assert.equal(unitUsage("neighborhood", 180).nearLimit, true);
  });

  it("reports no overflow under the cap", () => {
    assert.equal(unitUsage("neighborhood", 63).over, 0);
  });
});

describe("planForPrice", () => {
  const prices = { block: "price_block", neighborhood: "price_hood", community: "price_comm" };

  it("maps a price id to its plan", () => {
    assert.equal(planForPrice("price_hood", prices), "neighborhood");
    assert.equal(planForPrice("price_comm", prices), "community");
  });

  it("returns null for anything unrecognised, so the caller decides the fallback", () => {
    assert.equal(planForPrice("price_mystery", prices), null);
    assert.equal(planForPrice(null, prices), null);
    assert.equal(planForPrice(undefined, prices), null);
  });

  it("does not match an unconfigured price id against an empty env value", () => {
    assert.equal(planForPrice("", { block: "", neighborhood: "", community: "" }), null);
  });
});

describe("board roles", () => {
  it("keeps money with the president and treasurer", () => {
    assert.equal(can("treasurer", "money"), true);
    assert.equal(can("president", "money"), true);
    assert.equal(can("secretary", "money"), false);
    assert.equal(can("member", "money"), false);
  });

  it("lets the secretary run the roster, issues, and announcements", () => {
    assert.equal(can("secretary", "roster"), true);
    assert.equal(can("secretary", "issues"), true);
    assert.equal(can("secretary", "announce"), true);
    assert.equal(can("secretary", "settings"), false);
  });

  it("makes a plain board member read-only", () => {
    for (const cap of ["money", "roster", "issues", "announce", "documents", "settings"] as const) {
      assert.equal(can("member", cap), false, `member must not have ${cap}`);
    }
  });
});

describe("phone normalisation", () => {
  it("turns what a spreadsheet contains into E.164", () => {
    assert.equal(normalizePhone("(614) 555-0142"), "+16145550142");
    assert.equal(normalizePhone("614-555-0187"), "+16145550187");
    assert.equal(normalizePhone("16145550187"), "+16145550187");
    assert.equal(normalizePhone("+16145550187"), "+16145550187");
    assert.equal(normalizePhone(""), "");
  });
});

describe("merge tags", () => {
  it("substitutes the tags reminder and announcement copy uses", () => {
    assert.equal(
      renderTemplate("Hi {{name}}, {{unit}} owes {{balance}}.", {
        name: "Rosa",
        unit: "204 Maple St",
        balance: "$180.00",
      }),
      "Hi Rosa, 204 Maple St owes $180.00.",
    );
  });

  it("blanks an unknown tag rather than printing the braces at a member", () => {
    assert.equal(renderTemplate("Hi {{nope}}!", { name: "Rosa" }), "Hi !");
  });

  it("tolerates whitespace inside the braces", () => {
    assert.equal(renderTemplate("{{ name }}", { name: "Rosa" }), "Rosa");
  });
});
