import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTimeline,
  canComplete,
  caseStatus,
  displayCaseStatus,
  dueStep,
  type StepsState,
} from "@/lib/lien-engine";
import { packFor, RULE_PACKS } from "@/lib/lien-rules";
import { addDays } from "@/lib/money";

const TX = packFor("TX")!;
const CA = packFor("CA")!;

test("every shipped rule pack is internally sane", () => {
  for (const pack of RULE_PACKS) {
    assert.ok(pack.steps.length >= 3, `${pack.state} needs a real sequence`);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(pack.reviewedOn), `${pack.state} needs a review date`);
    assert.equal(pack.steps[0].from, "delinquency", `${pack.state} must anchor to the delinquency`);
    const keys = new Set(pack.steps.map((s) => s.key));
    assert.equal(keys.size, pack.steps.length, `${pack.state} has duplicate step keys`);
    for (const step of pack.steps) {
      assert.ok(step.citation.length > 4, `${pack.state}/${step.key} needs a citation`);
      assert.ok(step.offsetDays >= 0, `${pack.state}/${step.key} cannot count backwards`);
    }
    // The last step is the sale, and it must not be reachable on day zero.
    const total = pack.steps.reduce((sum, s) => sum + s.offsetDays, 0);
    assert.ok(total >= 14, `${pack.state} sale date is suspiciously close to the default`);
  }
});

test("offsets from the delinquency and from the prior step compose", () => {
  const t = buildTimeline(TX, "2026-06-01", {}, "2026-06-01");
  // TX: notice day 0, +14 wait, +7 publication, +7 sale.
  assert.deepEqual(
    t.steps.map((s) => [s.key, s.dueOn]),
    [
      ["default_notice", "2026-06-01"],
      ["waiting_period", "2026-06-15"],
      ["published_notice", "2026-06-22"],
      ["sale", "2026-06-29"],
    ],
  );
  assert.equal(t.saleEligibleOn, "2026-06-29");
});

test("California's first step is 14 days after the delinquency, not day zero", () => {
  const t = buildTimeline(CA, "2026-06-01", {}, "2026-06-01");
  assert.equal(t.steps[0].dueOn, "2026-06-15");
  assert.equal(t.steps[0].locked, true, "the preliminary notice is not lawful yet");
  assert.equal(t.saleEligibleOn, "2026-07-27");
});

test("the clock runs from when a notice actually went out, not when it was due", () => {
  // The owner was due to mail on June 1st and mailed on June 8th. The waiting period
  // — and therefore the sale date — must slip by exactly those seven days.
  const late: StepsState = { default_notice: { completedOn: "2026-06-08" } };
  const slipped = buildTimeline(TX, "2026-06-01", late, "2026-06-08");
  assert.equal(slipped.steps[1].dueOn, "2026-06-22");
  assert.equal(slipped.saleEligibleOn, "2026-07-06");

  const onTime = buildTimeline(TX, "2026-06-01", { default_notice: { completedOn: "2026-06-01" } }, "2026-06-01");
  assert.equal(onTime.saleEligibleOn, "2026-06-29");
});

test("no step is completable a single day early — checked as a property", () => {
  const delinquentSince = "2026-06-01";
  let state: StepsState = {};
  for (const rule of TX.steps) {
    const t = buildTimeline(TX, delinquentSince, state, "2026-06-01");
    const step = t.steps.find((s) => s.key === rule.key)!;
    const dayBefore = addDays(step.dueOn, -1);
    assert.equal(
      canComplete(t, rule.key, dayBefore).ok,
      false,
      `${rule.key} was completable on ${dayBefore}, one day before ${step.dueOn}`,
    );
    const check = canComplete(t, rule.key, step.dueOn);
    assert.equal(check.ok, true, `${rule.key} should be completable on ${step.dueOn}: ${check.reason}`);
    state = { ...state, [rule.key]: { completedOn: step.dueOn } };
  }
});

test("a step cannot be skipped, even after its own date has passed", () => {
  const t = buildTimeline(TX, "2026-01-01", {}, "2026-12-31");
  const sale = canComplete(t, "sale", "2026-12-31");
  assert.equal(sale.ok, false);
  assert.match(sale.reason ?? "", /Do not proceed/);
  assert.equal(t.steps[3].locked, true);
  assert.match(t.steps[3].lockSentence ?? "", /not recorded as done/);
});

test("the lock sentence names the date and the citation", () => {
  const t = buildTimeline(TX, "2026-06-01", { default_notice: { completedOn: "2026-06-01" } }, "2026-06-02");
  const waiting = t.steps[1];
  assert.equal(waiting.locked, true);
  assert.match(waiting.lockSentence ?? "", /June 15, 2026/);
  assert.match(waiting.lockSentence ?? "", /Tex\. Prop\. Code § 59\.043/);
});

test("the current step is the first unfinished one, and only one is current", () => {
  const t = buildTimeline(TX, "2026-06-01", { default_notice: { completedOn: "2026-06-01" } }, "2026-06-20");
  assert.equal(t.currentStepKey, "waiting_period");
  assert.equal(t.steps.filter((s) => s.current).length, 1);
});

test("dueStep only reports work that is lawful today", () => {
  const early = buildTimeline(CA, "2026-06-01", {}, "2026-06-02");
  assert.equal(dueStep(early, "2026-06-02"), null);
  const ready = buildTimeline(CA, "2026-06-01", {}, "2026-06-15");
  assert.equal(dueStep(ready, "2026-06-15")?.key, "preliminary_lien_notice");
});

test("status is derived from the calendar, not stored", () => {
  const running = buildTimeline(TX, "2026-06-01", {}, "2026-06-05");
  assert.equal(caseStatus(running, "2026-06-05"), "open");

  const done: StepsState = {
    default_notice: { completedOn: "2026-06-01" },
    waiting_period: { completedOn: "2026-06-15" },
    published_notice: { completedOn: "2026-06-22" },
  };
  const eligible = buildTimeline(TX, "2026-06-01", done, "2026-06-29");
  assert.equal(caseStatus(eligible, "2026-06-29"), "sale_eligible");
  assert.equal(caseStatus(eligible, "2026-06-28"), "open", "one day early is not eligible");

  const sold = buildTimeline(TX, "2026-06-01", { ...done, sale: { completedOn: "2026-06-30" } }, "2026-07-01");
  assert.equal(caseStatus(sold, "2026-07-01"), "resolved");
  assert.equal(sold.complete, true);
  assert.equal(sold.hardStopUntil, null);
});

test("sale_eligible needs the paperwork, not only the calendar", () => {
  // The sale date passed six weeks ago but the publication step was never recorded.
  // Saying "sale eligible" here would be the software telling an owner they may sell
  // when they may not.
  const partial: StepsState = {
    default_notice: { completedOn: "2026-06-01" },
    waiting_period: { completedOn: "2026-06-15" },
  };
  const t = buildTimeline(TX, "2026-06-01", partial, "2026-08-03");
  assert.equal(t.saleEligibleOn, "2026-06-29");
  assert.equal(caseStatus(t, "2026-08-03"), "open");
  assert.equal(displayCaseStatus("open", t, "2026-08-03"), "open");

  const complete: StepsState = { ...partial, published_notice: { completedOn: "2026-06-22" } };
  const ready = buildTimeline(TX, "2026-06-01", complete, "2026-08-03");
  assert.equal(caseStatus(ready, "2026-08-03"), "sale_eligible");
  assert.equal(displayCaseStatus("open", ready, "2026-08-03"), "sale_eligible");
});

test("the displayed status is derived, except where a human decided it", () => {
  const t = buildTimeline(TX, "2026-06-01", {}, "2026-06-05");
  // A stale column claiming sale_eligible must not survive contact with the calendar.
  assert.equal(displayCaseStatus("sale_eligible", t, "2026-06-05"), "open");
  // Decisions are facts and are read from the row.
  assert.equal(displayCaseStatus("resolved", t, "2026-06-05"), "resolved");
  assert.equal(displayCaseStatus("closed", t, "2026-06-05"), "closed");
  assert.equal(displayCaseStatus("paused", t, "2026-06-05"), "paused");
});

test("an unknown step key is refused rather than defaulting to allowed", () => {
  const t = buildTimeline(TX, "2026-06-01", {}, "2026-06-01");
  assert.equal(canComplete(t, "not_a_step", "2026-06-01").ok, false);
});

test("completing a step twice is refused", () => {
  const t = buildTimeline(TX, "2026-06-01", { default_notice: { completedOn: "2026-06-01" } }, "2026-06-02");
  const check = canComplete(t, "default_notice", "2026-06-02");
  assert.equal(check.ok, false);
  assert.match(check.reason ?? "", /Already recorded/);
});
