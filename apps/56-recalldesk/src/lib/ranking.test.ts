import test from "node:test";
import assert from "node:assert/strict";
import { rankQueue, silenceWeight, type RankInput } from "@/lib/ranking";

function p(over: Partial<RankInput> & { patientId: string }): RankInput {
  return {
    bucket: "m6_12",
    valueCents: 30_000,
    daysSinceLastTouch: null,
    midSequence: false,
    doNotContact: false,
    hasPhone: true,
    ...over,
  };
}

test("do-not-contact patients never enter the queue", () => {
  const q = rankQueue([p({ patientId: "a", doNotContact: true })], 20);
  assert.equal(q.length, 0);
});

test("a patient with no phone number is not a call", () => {
  assert.equal(rankQueue([p({ patientId: "a", hasPhone: false })], 20).length, 0);
});

test("a patient mid-sequence is left to the sequence", () => {
  assert.equal(rankQueue([p({ patientId: "a", midSequence: true })], 20).length, 0);
});

test("current patients are not chased", () => {
  assert.equal(rankQueue([p({ patientId: "a", bucket: "current" })], 20).length, 0);
});

test("recently touched patients rank below long-silent ones", () => {
  const q = rankQueue(
    [
      p({ patientId: "touched-yesterday", daysSinceLastTouch: 1 }),
      p({ patientId: "silent", daysSinceLastTouch: 120 }),
    ],
    20,
  );
  assert.deepEqual(q.map((t) => t.patientId), ["silent", "touched-yesterday"]);
  assert.deepEqual(q.map((t) => t.rank), [1, 2]);
});

test("the 6-12 month bucket outranks a 5-year lapse at equal value", () => {
  const q = rankQueue(
    [p({ patientId: "five-years", bucket: "m24_plus" }), p({ patientId: "nine-months", bucket: "m6_12" })],
    20,
  );
  assert.equal(q[0].patientId, "nine-months");
});

test("higher visit value outranks lower at equal urgency", () => {
  const q = rankQueue(
    [p({ patientId: "low", valueCents: 20_000 }), p({ patientId: "high", valueCents: 48_000 })],
    20,
  );
  assert.equal(q[0].patientId, "high");
});

test("the queue is capped and ranks are 1..N contiguous", () => {
  const inputs = Array.from({ length: 50 }, (_, i) =>
    p({ patientId: `p${String(i).padStart(2, "0")}`, valueCents: 10_000 + i * 100 }),
  );
  const q = rankQueue(inputs, 20);
  assert.equal(q.length, 20);
  assert.deepEqual(q.map((t) => t.rank), Array.from({ length: 20 }, (_, i) => i + 1));
  // Highest value first, since bucket and silence are equal.
  assert.equal(q[0].patientId, "p49");
});

test("ordering is stable for identical scores", () => {
  const a = rankQueue([p({ patientId: "b" }), p({ patientId: "a" })], 20);
  const b = rankQueue([p({ patientId: "a" }), p({ patientId: "b" })], 20);
  assert.deepEqual(a.map((t) => t.patientId), b.map((t) => t.patientId));
});

test("silence weight is monotonic", () => {
  const days = [0, 1, 3, 10, 30, 90];
  const weights = days.map(silenceWeight);
  for (let i = 1; i < weights.length; i++) {
    assert.ok(weights[i] >= weights[i - 1], `${days[i]} vs ${days[i - 1]}`);
  }
  assert.equal(silenceWeight(null), 1);
});
