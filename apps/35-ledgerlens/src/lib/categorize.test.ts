import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CATEGORY_SEEDS,
  CATEGORY_SLUGS,
  categoryHintFor,
  displayNameFor,
  normalizeVendor,
  resolveCategory,
} from "./categorize";

test("normalizeVendor collapses the dozen ways a receipt prints one merchant", () => {
  const expected = "home depot";
  for (const raw of [
    "HOME DEPOT #1234",
    "The Home Depot",
    "HOME DEPOT 1234 DENVER CO",
    "Home Depot U.S.A., Inc.",
    "  home   depot  ",
    "HOME DEPOT STORE 8842",
  ]) {
    assert.equal(normalizeVendor(raw), expected, `failed on ${raw}`);
  }
});

test("normalizeVendor keeps hyphens and ampersands that are part of the name", () => {
  assert.equal(normalizeVendor("SHERWIN-WILLIAMS #7031"), "sherwin-williams");
  assert.equal(normalizeVendor("Smith &amp; Sons Welding LLC"), "smith & sons welding");
});

test("normalizeVendor does not collapse two genuinely different vendors", () => {
  assert.notEqual(normalizeVendor("Ace Hardware"), normalizeVendor("Ace Plumbing"));
  assert.notEqual(normalizeVendor("Shell"), normalizeVendor("Shell Energy"));
});

test("displayNameFor prefers the printed name and falls back to the normalized one", () => {
  assert.equal(displayNameFor("HOME DEPOT #1234", "home depot"), "HOME DEPOT #1234");
  assert.equal(displayNameFor("   ", "home depot"), "Home Depot");
  assert.equal(displayNameFor("###", "home depot"), "Home Depot");
});

test("every seed category has a real Schedule C line and a unique slug", () => {
  assert.equal(CATEGORY_SLUGS.size, CATEGORY_SEEDS.length);
  for (const seed of CATEGORY_SEEDS) {
    assert.match(seed.scheduleCLine, /^\d{1,2}[ab]?$/, `${seed.slug} has a bad line`);
    assert.ok(seed.name.length > 2);
  }
});

test("vendor hints pick the most specific match", () => {
  assert.equal(categoryHintFor(normalizeVendor("SHELL OIL 574288")), "fuel");
  assert.equal(categoryHintFor(normalizeVendor("HOME DEPOT #1234")), "supplies");
  // "home depot rental" is longer than "home depot", so equipment rent wins.
  assert.equal(categoryHintFor("home depot rental"), "rent-equipment");
  assert.equal(categoryHintFor(normalizeVendor("Verizon Wireless")), "utilities");
  assert.equal(categoryHintFor("some vendor nobody has heard of"), null);
  assert.equal(categoryHintFor(""), null);
});

test("a learned vendor rule beats the model, always", () => {
  const decision = resolveCategory({
    ruleSlug: "fuel",
    modelSlug: "meals",
    modelConfidence: 0.99,
    hintSlug: "meals",
    autoThreshold: 0.92,
  });
  assert.deepEqual(decision, { source: "rule", slug: "fuel" });
});

test("a confident model suggestion is applied; an unconfident one goes to review", () => {
  assert.deepEqual(
    resolveCategory({
      ruleSlug: null,
      modelSlug: "supplies",
      modelConfidence: 0.95,
      hintSlug: null,
      autoThreshold: 0.92,
    }),
    { source: "model", slug: "supplies" },
  );

  assert.deepEqual(
    resolveCategory({
      ruleSlug: null,
      modelSlug: "supplies",
      modelConfidence: 0.7,
      hintSlug: null,
      autoThreshold: 0.92,
    }),
    { source: "review", slug: "supplies" },
  );
});

/** A hint is a hint. It must never auto-apply — that is the "flag, don't guess" rule. */
test("a vendor-name hint never auto-applies, it only pre-fills the review item", () => {
  const decision = resolveCategory({
    ruleSlug: null,
    modelSlug: null,
    modelConfidence: 0,
    hintSlug: "supplies",
    autoThreshold: 0.92,
  });
  assert.deepEqual(decision, { source: "review", slug: "supplies" });
});

test("an unrecognised slug from a model is discarded rather than stored", () => {
  const decision = resolveCategory({
    ruleSlug: "not-a-real-slug",
    modelSlug: "also-not-real",
    modelConfidence: 0.99,
    hintSlug: null,
    autoThreshold: 0.92,
  });
  assert.deepEqual(decision, { source: "review", slug: null });
});
