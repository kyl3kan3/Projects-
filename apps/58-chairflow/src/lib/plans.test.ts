import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  bookingPageLive,
  entitlement,
  entitled,
  featureAllowed,
  monthlyCents,
  planName,
  subscriptionLive,
  trialDaysLeft,
  type Billable,
} from "@/lib/plans";

const NOW = new Date("2026-08-03T15:00:00.000Z");

const trialing: Billable = {
  plan: "chair",
  stripeSubscriptionId: null,
  subscriptionStatus: null,
  trialEndsAt: new Date("2026-08-12T15:00:00.000Z"),
};

const subscribed: Billable = {
  plan: "book",
  stripeSubscriptionId: "sub_live",
  subscriptionStatus: "active",
  trialEndsAt: new Date("2026-07-01T00:00:00.000Z"),
};

test("a live trial entitles everything the plan includes", () => {
  assert.deepEqual(entitlement(trialing, NOW), { state: "trial", daysLeft: 9 });
  assert.equal(entitled(trialing, NOW), true);
  assert.equal(featureAllowed(trialing, "fees", NOW).ok, true);
});

test("an expired trial with no subscription is lapsed", () => {
  const lapsed: Billable = { ...trialing, trialEndsAt: new Date("2026-07-30T00:00:00.000Z") };
  const ent = entitlement(lapsed, NOW);
  assert.equal(ent.state, "lapsed");
  assert.equal(entitled(lapsed, NOW), false);
  assert.equal(bookingPageLive(lapsed, NOW), false);
});

test("a CANCELLED subscription loses access — the plan label does not keep it", () => {
  // The failure this guards: `plan` still says "book", so a gate that only reads
  // the plan hands a cancelled account the whole product forever.
  const cancelled: Billable = {
    plan: "book",
    stripeSubscriptionId: "sub_live",
    subscriptionStatus: "canceled",
    trialEndsAt: new Date("2026-07-01T00:00:00.000Z"),
  };
  assert.equal(entitled(cancelled, NOW), false);
  assert.equal(bookingPageLive(cancelled, NOW), false);
  const denial = featureAllowed(cancelled, "cadence_nudges", NOW);
  assert.equal(denial.ok, false);
  if (!denial.ok) assert.match(denial.reason, /cancelled/i);
});

test("cancelling inside the first fortnight does not silently restore the trial", () => {
  const cancelledEarly: Billable = {
    plan: "chair",
    stripeSubscriptionId: "sub_live",
    subscriptionStatus: "canceled",
    // The trial column still holds a future date.
    trialEndsAt: new Date("2026-08-12T15:00:00.000Z"),
  };
  assert.equal(entitled(cancelledEarly, NOW), false);
});

test("unpaid is lapsed; past_due keeps the booking page up", () => {
  const unpaid: Billable = { ...subscribed, subscriptionStatus: "unpaid" };
  assert.equal(entitled(unpaid, NOW), false);

  const pastDue: Billable = { ...subscribed, subscriptionStatus: "past_due" };
  const ent = entitlement(pastDue, NOW);
  assert.equal(ent.state, "past_due");
  assert.equal(
    bookingPageLive(pastDue, NOW),
    true,
    "a failed card must not take a stylist's public page down",
  );
  assert.equal(featureAllowed(pastDue, "fees", NOW).ok, true);
});

test("statuses Stripe can send are classified explicitly", () => {
  assert.equal(subscriptionLive("active"), true);
  assert.equal(subscriptionLive("trialing"), true);
  assert.equal(subscriptionLive("past_due"), true);
  assert.equal(subscriptionLive("canceled"), false);
  assert.equal(subscriptionLive("unpaid"), false);
  assert.equal(subscriptionLive("incomplete_expired"), false);
  assert.equal(subscriptionLive(null), false);
});

test("Book features are denied on Chair, with the upgrade named", () => {
  const denial = featureAllowed(trialing, "cadence_nudges", NOW);
  assert.equal(denial.ok, false);
  if (!denial.ok) {
    assert.equal(denial.upgradeTo, "book");
    assert.match(denial.reason, /Book/);
  }
  assert.equal(featureAllowed(subscribed, "cadence_nudges", NOW).ok, true);
  assert.equal(featureAllowed(subscribed, "waitlist", NOW).ok, true);
  assert.equal(featureAllowed(trialing, "waitlist", NOW).ok, false);
});

test("a shop member gets Chair features, not Book ones", () => {
  const member: Billable = { ...trialing, plan: "shop_member" };
  assert.equal(featureAllowed(member, "reminders", NOW).ok, true);
  assert.equal(featureAllowed(member, "client_notes", NOW).ok, false);
  assert.equal(planName("shop_member"), "Chair (shop)");
});

test("the rent ledger rides on the shop's own subscription, not the renter's plan", () => {
  assert.equal(featureAllowed(trialing, "rent_ledger", NOW).ok, true);
  const lapsed: Billable = { ...trialing, trialEndsAt: new Date("2026-01-01T00:00:00.000Z") };
  const denial = featureAllowed(lapsed, "rent_ledger", NOW);
  assert.equal(denial.ok, false);
  if (!denial.ok) assert.equal(denial.upgradeTo, "shop");
});

test("a lapsed denial says the data stays readable", () => {
  const lapsed: Billable = { ...trialing, trialEndsAt: new Date("2026-01-01T00:00:00.000Z") };
  const denial = featureAllowed(lapsed, "reminders", NOW);
  assert.equal(denial.ok, false);
  if (!denial.ok) assert.match(denial.reason, /stay readable/);
});

test("trial days left never goes negative", () => {
  assert.equal(trialDaysLeft(new Date("2026-08-12T15:00:00.000Z"), NOW), 9);
  assert.equal(trialDaysLeft(new Date("2026-07-01T00:00:00.000Z"), NOW), 0);
  assert.equal(trialDaysLeft(null, NOW), 0);
});

test("prices match README's table, in cents", () => {
  assert.equal(monthlyCents("chair"), 1900);
  assert.equal(monthlyCents("book"), 2900);
  assert.equal(monthlyCents("shop"), 4900);
});
