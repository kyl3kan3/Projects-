/**
 * The authorisation-hold lifecycle. A card authorisation lapses after about a
 * week whether anybody wants it to or not, so a three-week marquee rental needs
 * the hold re-placed — and the sweep that does it must not run for ever on a hold
 * that is already dead.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays } from "@/lib/dates";
import {
  holdDaysLeft,
  holdExpiresOn,
  holdHasLapsed,
  holdSentence,
  lapsedBefore,
  needsReauth,
  reauthWindow,
  type HoldFacts,
} from "@/lib/holds";

const authorizedAt = (date: string) => new Date(`${date}T12:00:00Z`);

const facts = (over: Partial<HoldFacts> = {}): HoldFacts => ({
  depositStatus: "held",
  depositCents: 9_500,
  depositAuthorizedAt: authorizedAt("2026-08-01"),
  dueBackOn: "2026-08-20",
  status: "out",
  ...over,
});

test("a hold placed on the 1st runs out on the 8th", () => {
  assert.equal(holdExpiresOn(authorizedAt("2026-08-01")), "2026-08-08");
  assert.equal(holdDaysLeft(authorizedAt("2026-08-01"), "2026-08-06"), 2);
  assert.equal(holdDaysLeft(authorizedAt("2026-08-01"), "2026-08-08"), 0);
});

test("a long rental needs re-authorising two days before the hold runs out", () => {
  assert.equal(needsReauth(facts(), "2026-08-05"), false, "three days out: not yet");
  assert.equal(needsReauth(facts(), "2026-08-06"), true, "two days out: now");
  assert.equal(needsReauth(facts(), "2026-08-07"), true, "one day out: still");
});

test("a short rental that is back before the hold expires needs nothing", () => {
  assert.equal(needsReauth(facts({ dueBackOn: "2026-08-07" }), "2026-08-06"), false);
  // Due back exactly on the expiry day is fine: the capture window covers it.
  assert.equal(needsReauth(facts({ dueBackOn: "2026-08-08" }), "2026-08-06"), false);
  assert.equal(needsReauth(facts({ dueBackOn: "2026-08-09" }), "2026-08-06"), true);
});

test("an already-lapsed hold is not retried — it is flagged once for a person", () => {
  // This is the "notification that never stops" defect in its hold-lifecycle form:
  // "expired" stays true for ever, so a naive sweep would try nightly until the
  // heat death of the universe.
  assert.equal(needsReauth(facts(), "2026-08-08"), false);
  assert.equal(needsReauth(facts(), "2026-08-20"), false);
  assert.equal(needsReauth(facts(), "2027-01-01"), false);
  assert.equal(holdHasLapsed(facts(), "2026-08-08"), true);
  assert.equal(holdHasLapsed(facts(), "2026-08-07"), false);
});

test("only a live hold on an open order is a candidate", () => {
  assert.equal(needsReauth(facts({ depositStatus: "released" }), "2026-08-06"), false);
  assert.equal(needsReauth(facts({ depositStatus: "captured" }), "2026-08-06"), false);
  assert.equal(needsReauth(facts({ depositStatus: "expired" }), "2026-08-06"), false);
  assert.equal(needsReauth(facts({ status: "closed" }), "2026-08-06"), false);
  assert.equal(needsReauth(facts({ status: "cancelled" }), "2026-08-06"), false);
  assert.equal(needsReauth(facts({ depositCents: 0 }), "2026-08-06"), false);
  assert.equal(needsReauth(facts({ depositAuthorizedAt: null }), "2026-08-06"), false);
});

test("a flagged hold cannot come back into the candidate set", () => {
  // markHoldExpired sets depositStatus to "expired", and that status is refused
  // above — so the transition is one-way and the sweep cannot loop.
  const flagged = facts({ depositStatus: "expired" });
  assert.equal(holdHasLapsed(flagged, "2026-08-20"), false);
  assert.equal(needsReauth(flagged, "2026-08-20"), false);
});

test("the re-auth sweep window is bounded to authorisations that can still be saved", () => {
  const window = reauthWindow("2026-08-08");
  assert.equal(window.authorizedFrom, "2026-08-01");
  assert.equal(window.authorizedTo, "2026-08-04");
  // Everything the sweep looks at is a candidate needsReauth might say yes to.
  for (let offset = 0; offset < 4; offset++) {
    const date = addDays(window.authorizedFrom, offset);
    const expires = holdExpiresOn(authorizedAt(date));
    assert.ok(expires >= "2026-08-08", `${date} expires ${expires}, still in reach`);
  }
});

test("the hold sentence says what will happen, not just what is", () => {
  assert.match(holdSentence(facts(), "2026-08-05"), /runs out in 3 days/);
  assert.match(holdSentence(facts(), "2026-08-08"), /has run out/);
  assert.match(holdSentence(facts({ depositStatus: "released" }), "2026-08-08"), /No money moved/);
  assert.match(holdSentence(facts({ depositStatus: "none" }), "2026-08-08"), /No deposit hold/);
  assert.match(holdSentence(facts({ depositStatus: "captured" }), "2026-08-08"), /in full/);
  assert.match(
    holdSentence(facts({ depositStatus: "captured_partial" }), "2026-08-08"),
    /the rest was released/,
  );
  assert.match(holdSentence(facts({ depositStatus: "expired" }), "2026-08-08"), /lapsed/);
});

test("one day left reads in the singular", () => {
  assert.match(holdSentence(facts(), "2026-08-07"), /runs out in 1 day \(/);
});

test("a hold that lapsed while the cron was down is still caught", () => {
  // The bug this guards: the re-auth window starts at asOf - 7, so a hold placed
  // nine days ago fell outside it and was never flagged. The order kept saying
  // "held" for an authorisation that no longer existed.
  const window = reauthWindow("2026-08-04");
  const stale = authorizedAt("2026-07-26");
  assert.ok(
    stale < new Date(`${window.authorizedFrom}T00:00:00Z`),
    "the stale authorisation is outside the re-auth window, which is the trap",
  );
  // The flagging pass uses an older-than bound instead, so it does catch it.
  assert.ok(
    stale < new Date(`${lapsedBefore("2026-08-04")}T00:00:00Z`),
    "and inside the lapsed bound",
  );
  assert.equal(holdHasLapsed(facts({ depositAuthorizedAt: stale }), "2026-08-04"), true);
});

test("the lapsed bound is one hold lifetime back, however long the cron was down", () => {
  assert.equal(lapsedBefore("2026-08-04"), "2026-07-28");
  // Any hold older than that is caught, at any distance — the pass is bounded by
  // the one-way transition to "expired", not by a date window.
  for (const days of [8, 20, 400]) {
    const authorised = authorizedAt(addDays("2026-08-04", -days));
    assert.ok(authorised < new Date(`${lapsedBefore("2026-08-04")}T00:00:00Z`), `${days} days`);
    assert.equal(holdHasLapsed(facts({ depositAuthorizedAt: authorised }), "2026-08-04"), true);
  }
});
