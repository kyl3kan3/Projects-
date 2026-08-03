import test from "node:test";
import assert from "node:assert/strict";
import {
  annualCents,
  canAddSite,
  canDownloadReport,
  canSeeFullTotal,
  canUploadDocument,
  canUseAnswerBank,
  effectiveMonthlyCents,
  priceCents,
  PLANS,
} from "./plans";

test("the three paid prices match README", () => {
  assert.equal(PLANS.starter.monthlyCents, 9_900);
  assert.equal(PLANS.standard.monthlyCents, 19_900);
  assert.equal(PLANS.supplier_plus.monthlyCents, 29_900);
  assert.equal(PLANS.preview.monthlyCents, 0);
});

test("annual billing is ten months for twelve", () => {
  assert.equal(annualCents("standard"), 199_000);
  assert.equal(priceCents("standard", "year"), 199_000);
  assert.equal(priceCents("standard", "month"), 19_900);
  assert.equal(effectiveMonthlyCents("standard", "year"), 16_583);
});

test("site limits are 1 / 1 / 3 / 10", () => {
  assert.equal(PLANS.preview.sites, 1);
  assert.equal(PLANS.starter.sites, 1);
  assert.equal(PLANS.standard.sites, 3);
  assert.equal(PLANS.supplier_plus.sites, 10);
});

test("the site gate opens at the boundary and closes past it", () => {
  assert.equal(canAddSite("standard", 2).allowed, true);
  assert.equal(canAddSite("standard", 3).allowed, false);
  assert.equal(canAddSite("standard", 3).upgradeTo, "supplier_plus");
  assert.equal(canAddSite("supplier_plus", 10).upgradeTo, null, "nothing above Supplier+ in v1");
});

test("the preview reads exactly one bill", () => {
  assert.equal(canUploadDocument("preview", 0).allowed, true);
  assert.equal(canUploadDocument("preview", 1).allowed, false);
  assert.equal(canUploadDocument("preview", 1).upgradeTo, "starter");
  assert.equal(canUploadDocument("starter", 400).allowed, true);
});

test("the answer bank starts at Standard", () => {
  assert.equal(canUseAnswerBank("preview").allowed, false);
  assert.equal(canUseAnswerBank("starter").allowed, false);
  assert.equal(canUseAnswerBank("starter").upgradeTo, "standard");
  assert.equal(canUseAnswerBank("standard").allowed, true);
  assert.equal(canUseAnswerBank("supplier_plus").allowed, true);
});

test("the PDF and the full total need a plan", () => {
  assert.equal(canDownloadReport("preview").allowed, false);
  assert.equal(canDownloadReport("starter").allowed, true);
  assert.equal(canSeeFullTotal("preview"), false);
  assert.equal(canSeeFullTotal("starter"), true);
});

test("every gate that refuses says why and where to go", () => {
  for (const g of [
    canAddSite("preview", 1),
    canUploadDocument("preview", 1),
    canUseAnswerBank("starter"),
    canDownloadReport("preview"),
  ]) {
    assert.equal(g.allowed, false);
    assert.ok(g.reason.length > 20, "a refusal has to explain itself");
    assert.ok(g.upgradeTo, "a refusal has to name the plan that lifts it");
  }
});
