import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  DEFAULT_REWARD_TIERS,
  applyBoostIncremental,
  boostPointsFor,
  compareQueue,
  computePositions,
  conversionRate,
  generateReferralCode,
  kFactor,
  nextReward,
  normalizeReferralCode,
  percentile,
  percentileLabel,
  positionDelta,
  positionFor,
  positionSummary,
  rewardProgress,
  shareUrl,
  sortKey,
  unlockedRewards,
  type PositionedEntry,
  type QueueEntry,
  type RewardTier,
} from "@/lib/referrals";

/* ------------------------------------------------------------------ codes --- */

describe("referral codes", () => {
  it("mints codes of the declared length from the declared alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateReferralCode();
      assert.equal(code.length, CODE_LENGTH);
      for (const ch of code) assert.ok(CODE_ALPHABET.includes(ch), `${ch} not in alphabet`);
    }
  });

  it("excludes the glyphs people misread", () => {
    // 0/O and 1/I/L are the classic misreads; U is excluded to avoid profanity.
    for (const ch of "01OILU") assert.ok(!CODE_ALPHABET.includes(ch), `${ch} should be excluded`);
  });

  it("is deterministic given a deterministic source of randomness", () => {
    const fixed = () => 0;
    assert.equal(generateReferralCode(fixed), CODE_ALPHABET[0].repeat(CODE_LENGTH));
  });

  it("normalizes codes the way a human pastes them", () => {
    assert.equal(normalizeReferralCode("k7m2ptq"), "K7M2PTQ");
    assert.equal(normalizeReferralCode("  K7M2PTQ  "), "K7M2PTQ");
    assert.equal(normalizeReferralCode("K7M-2PT-Q"), "K7M2PTQ");
    assert.equal(normalizeReferralCode("K7M_2PTQ"), "K7M2PTQ");
  });

  it("rejects anything that cannot be a code rather than guessing", () => {
    assert.equal(normalizeReferralCode(null), null);
    assert.equal(normalizeReferralCode(""), null);
    assert.equal(normalizeReferralCode("SHORT"), null);
    assert.equal(normalizeReferralCode("TOOLONGCODE"), null);
    // 0, O, I and L are not in the alphabet, so they cannot appear in a code.
    assert.equal(normalizeReferralCode("K7M2PT0"), null);
    assert.equal(normalizeReferralCode("K7M2PTO"), null);
  });

  it("builds a share URL without doubling slashes", () => {
    assert.equal(shareUrl("https://x.dev/l/ledgerly", "K7M2PTQ"), "https://x.dev/l/ledgerly?ref=K7M2PTQ");
    assert.equal(shareUrl("https://x.dev/l/ledgerly/", "K7M2PTQ"), "https://x.dev/l/ledgerly?ref=K7M2PTQ");
  });
});

/* ------------------------------------------------------------------ boost --- */

describe("boost arithmetic", () => {
  it("pays the configured positions per credited referral", () => {
    assert.equal(boostPointsFor(0, 50), 0);
    assert.equal(boostPointsFor(1, 50), 50);
    assert.equal(boostPointsFor(3, 50), 150);
  });

  it("honours a cap, and treats 0 as uncapped", () => {
    assert.equal(boostPointsFor(10, 50, 200), 200);
    assert.equal(boostPointsFor(10, 50, 0), 500);
    assert.equal(boostPointsFor(2, 50, 200), 100);
  });

  it("never returns a negative boost from bad input", () => {
    assert.equal(boostPointsFor(-4, 50), 0);
    assert.equal(boostPointsFor(3, -50), 0);
  });

  it("floors fractional input rather than producing fractional positions", () => {
    assert.equal(boostPointsFor(2.9, 50), 100);
    assert.equal(boostPointsFor(2, 50.9), 100);
  });
});

/* ---------------------------------------------------------------- ordering --- */

const entry = (id: string, joinRank: number, boostPoints = 0): QueueEntry => ({
  id,
  joinRank,
  boostPoints,
});

describe("queue ordering", () => {
  it("sorts by joinRank when nobody has referred anyone", () => {
    const positions = computePositions([entry("c", 3), entry("a", 1), entry("b", 2)]);
    assert.deepEqual([...positions.entries()].sort(), [
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
  });

  it("lets boost overtake earlier joiners — the whole point of the mechanic", () => {
    const positions = computePositions([
      entry("first", 1),
      entry("second", 2),
      entry("sharer", 3, 50),
    ]);
    assert.equal(positions.get("sharer"), 1);
    assert.equal(positions.get("first"), 2);
    assert.equal(positions.get("second"), 3);
  });

  it("breaks ties in favour of whoever joined first", () => {
    // Both have sortKey 1: joinRank 1 with no boost, joinRank 51 with 50 boost.
    const a = entry("early", 1, 0);
    const b = entry("late", 51, 50);
    assert.equal(sortKey(a), sortKey(b));
    assert.ok(compareQueue(a, b) < 0);
    const positions = computePositions([b, a]);
    assert.equal(positions.get("early"), 1);
    assert.equal(positions.get("late"), 2);
  });

  it("produces contiguous 1..N positions with no duplicates", () => {
    const entries = Array.from({ length: 40 }, (_, i) =>
      entry(`s${i}`, i + 1, i % 5 === 0 ? 120 : 0),
    );
    const positions = computePositions(entries);
    const values = [...positions.values()].sort((x, y) => x - y);
    assert.deepEqual(values, Array.from({ length: 40 }, (_, i) => i + 1));
  });

  it("never places anyone above #1, however much boost they have", () => {
    const positions = computePositions([entry("a", 1), entry("b", 2, 10_000)]);
    assert.equal(positions.get("b"), 1);
    assert.equal(positions.get("a"), 2);
  });

  it("positionFor agrees with a full recompute", () => {
    const entries = [entry("a", 1), entry("b", 2), entry("c", 3, 50), entry("d", 4)];
    const positions = computePositions(entries);
    for (const e of entries) {
      assert.equal(positionFor(e, entries), positions.get(e.id), `mismatch for ${e.id}`);
    }
  });
});

/* -------------------------------------------------- incremental vs oracle --- */

function seed(n: number): PositionedEntry[] {
  const base = Array.from({ length: n }, (_, i) => entry(`s${i + 1}`, i + 1, 0));
  const positions = computePositions(base);
  return base.map((e) => ({ ...e, position: positions.get(e.id)! }));
}

function assertMatchesOracle(entries: PositionedEntry[], label: string) {
  const oracle = computePositions(entries);
  for (const e of entries) {
    assert.equal(e.position, oracle.get(e.id), `${label}: ${e.id} at ${e.position}`);
  }
  const values = entries.map((e) => e.position).sort((a, b) => a - b);
  assert.deepEqual(
    values,
    Array.from({ length: entries.length }, (_, i) => i + 1),
    `${label}: positions are not contiguous`,
  );
}

describe("incremental position updates", () => {
  it("moves the referrer up and pushes exactly the people they passed down", () => {
    const before = seed(10);
    const after = applyBoostIncremental(before, "s8", 5);
    const byId = new Map(after.map((e) => [e.id, e]));
    // sortKey 8 - 5 = 3, and s3 also sorts at 3 but joined first, so #4 — not
    // #3. The tie-break protecting the earlier joiner is doing its job.
    assert.equal(byId.get("s8")!.position, 4);
    // s4..s7 each shift back one; s1..s3 and s9, s10 do not move.
    assert.equal(byId.get("s1")!.position, 1);
    assert.equal(byId.get("s3")!.position, 3);
    assert.equal(byId.get("s4")!.position, 5);
    assert.equal(byId.get("s7")!.position, 8);
    assert.equal(byId.get("s9")!.position, 9);
    assert.equal(byId.get("s10")!.position, 10);
    assertMatchesOracle(after, "single jump");
  });

  it("touches only the rows that were passed", () => {
    const before = seed(200);
    const after = applyBoostIncremental(before, "s180", 50);
    const changed = after.filter(
      (e) => e.position !== before.find((b) => b.id === e.id)!.position,
    );
    // The jumper plus the 49 people it overtook — not 200 rows.
    assert.equal(changed.length, 50);
  });

  it("agrees with a full recompute across a long random sequence", () => {
    // The property that matters: however the boosts land, the incremental path
    // and the oracle can never disagree, because the hosted page reads the
    // materialized column and the dashboard sorts by the same key.
    let entries = seed(60);
    let rand = 42;
    const next = () => {
      rand = (rand * 1103515245 + 12345) % 2147483648;
      return rand / 2147483648;
    };
    for (let step = 0; step < 400; step++) {
      const target = entries[Math.floor(next() * entries.length)];
      const delta = Math.floor(next() * 5) * 20 - 40; // -40..+40, sometimes 0
      entries = applyBoostIncremental(entries, target.id, delta);
      assertMatchesOracle(entries, `step ${step}`);
    }
  });

  it("moves someone back down when a referral is revoked", () => {
    let entries = seed(10);
    entries = applyBoostIncremental(entries, "s9", 6);
    assert.equal(entries.find((e) => e.id === "s9")!.position, 4);
    entries = applyBoostIncremental(entries, "s9", -6);
    assert.equal(entries.find((e) => e.id === "s9")!.position, 9);
    assertMatchesOracle(entries, "revoked");
  });

  it("clamps boost at zero rather than going negative", () => {
    let entries = seed(5);
    entries = applyBoostIncremental(entries, "s3", -10);
    assert.equal(entries.find((e) => e.id === "s3")!.boostPoints, 0);
    assertMatchesOracle(entries, "clamped");
  });

  it("is a no-op for an unknown id or a zero delta", () => {
    const entries = seed(5);
    assert.deepEqual(applyBoostIncremental(entries, "nope", 50), entries);
    assert.deepEqual(applyBoostIncremental(entries, "s2", 0), entries);
  });
});

/* -------------------------------------------------------------- reporting --- */

describe("reporting maths", () => {
  it("never reports top 0% and never exceeds 100%", () => {
    assert.equal(percentile(1, 8), 13);
    assert.equal(percentile(8, 8), 100);
    assert.equal(percentile(1, 1), 100);
    assert.equal(percentileLabel(347, 2847), "top 13%");
  });

  it("degrades safely with no data", () => {
    assert.equal(percentile(0, 0), 100);
    assert.equal(percentile(5, 0), 100);
  });

  it("reports a delta only when someone moved up", () => {
    assert.equal(positionDelta(347, 298), 49);
    assert.equal(positionDelta(298, 347), 0);
    assert.equal(positionDelta(10, 10), 0);
  });

  it("computes k-factor to two decimals and survives an empty list", () => {
    assert.equal(kFactor(100, 134), 1.34);
    assert.equal(kFactor(3, 1), 0.33);
    assert.equal(kFactor(0, 0), 0);
    assert.equal(kFactor(0, 5), 0);
  });

  it("computes conversion as a bounded whole percentage", () => {
    assert.equal(conversionRate(100, 38), 38);
    assert.equal(conversionRate(0, 10), 0);
    assert.equal(conversionRate(10, 20), 100);
  });
});

/* ---------------------------------------------------------------- rewards --- */

const tiers: RewardTier[] = [
  { id: "r3", threshold: 3, label: "Early access" },
  { id: "r10", threshold: 10, label: "Founding price" },
  { id: "r25", threshold: 25, label: "Lifetime deal" },
];

describe("reward tiers", () => {
  it("ships a real default ladder", () => {
    assert.deepEqual(
      DEFAULT_REWARD_TIERS.map((t) => t.threshold),
      [3, 10, 25],
    );
    for (const tier of DEFAULT_REWARD_TIERS) {
      assert.ok(tier.label.length > 0);
      assert.ok((tier.description ?? "").length > 0, "every tier explains itself");
    }
  });

  it("unlocks at the threshold, not one past it", () => {
    assert.deepEqual(unlockedRewards(2, tiers).map((t) => t.id), []);
    assert.deepEqual(unlockedRewards(3, tiers).map((t) => t.id), ["r3"]);
    assert.deepEqual(unlockedRewards(10, tiers).map((t) => t.id), ["r3", "r10"]);
    assert.deepEqual(unlockedRewards(99, tiers).map((t) => t.id), ["r3", "r10", "r25"]);
  });

  it("reports progress toward each gate, clamped at the threshold", () => {
    const progress = rewardProgress(4, tiers);
    assert.deepEqual(
      progress.map((p) => [p.reward.id, p.unlocked, p.progress, p.remaining]),
      [
        ["r3", true, 3, 0],
        ["r10", false, 4, 6],
        ["r25", false, 4, 21],
      ],
    );
  });

  it("orders gates cheapest-first whatever order they arrive in", () => {
    const shuffled = [tiers[2], tiers[0], tiers[1]];
    assert.deepEqual(
      rewardProgress(0, shuffled).map((p) => p.reward.id),
      ["r3", "r10", "r25"],
    );
  });

  it("names the next gate and how far away it is", () => {
    assert.equal(nextReward(0, tiers)!.reward.id, "r3");
    assert.equal(nextReward(0, tiers)!.remaining, 3);
    assert.equal(nextReward(3, tiers)!.reward.id, "r10");
    assert.equal(nextReward(25, tiers), null);
    assert.equal(nextReward(0, []), null);
  });

  it("writes the text that must survive every animation being removed", () => {
    assert.equal(
      positionSummary(347, 2847, 1, tiers),
      "You're #347 · top 13% · 2 more referrals to Early access",
    );
    assert.equal(
      positionSummary(2, 10, 2, tiers),
      "You're #2 · top 20% · 1 more referral to Early access",
    );
    assert.equal(
      positionSummary(1, 10, 30, tiers),
      "You're #1 · top 10% · every reward unlocked",
    );
    assert.equal(positionSummary(5, 10, 0, []), "You're #5 · top 50%");
  });
});
