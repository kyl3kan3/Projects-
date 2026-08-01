import assert from "node:assert/strict";
import { test } from "node:test";
import {
  STARTER_BLOCKS,
  excerpt,
  shouldBumpVersion,
  sourceBreadcrumb,
  staleness,
  stalenessLabel,
} from "./answers";

const NOW = new Date("2026-08-01T12:00:00Z");

function ago(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

test("staleness flags a block unreviewed for more than a year", () => {
  assert.equal(staleness({ lastReviewedAt: ago(10), updatedAt: ago(10) }, NOW), "fresh");
  assert.equal(staleness({ lastReviewedAt: ago(280), updatedAt: ago(280) }, NOW), "aging");
  assert.equal(staleness({ lastReviewedAt: ago(400), updatedAt: ago(400) }, NOW), "stale");
});

test("a block never explicitly reviewed falls back to when it was written", () => {
  assert.equal(staleness({ lastReviewedAt: null, updatedAt: ago(500) }, NOW), "stale");
  assert.equal(staleness({ lastReviewedAt: null, updatedAt: ago(5) }, NOW), "fresh");
  // Reviewing an old block makes it fresh again without touching the text.
  assert.equal(staleness({ lastReviewedAt: ago(2), updatedAt: ago(500) }, NOW), "fresh");
});

test("the staleness label says which clock it is reading", () => {
  assert.equal(stalenessLabel({ lastReviewedAt: ago(3), updatedAt: ago(3) }, NOW), "REVIEWED THIS MONTH");
  assert.equal(stalenessLabel({ lastReviewedAt: ago(40), updatedAt: ago(40) }, NOW), "REVIEWED 1 MO AGO");
  assert.equal(stalenessLabel({ lastReviewedAt: ago(425), updatedAt: ago(425) }, NOW), "REVIEWED 13 MO AGO");
  assert.equal(stalenessLabel({ lastReviewedAt: null, updatedAt: ago(425) }, NOW), "WRITTEN 13 MO AGO");
});

test("versions bump on text changes only", () => {
  assert.equal(shouldBumpVersion("Our mission is X.", "Our mission is Y."), true);
  assert.equal(shouldBumpVersion("Our mission is X.", "Our mission is X."), false);
  // Whitespace-only edits are not new versions — nobody wrote a new answer.
  assert.equal(shouldBumpVersion("Our mission is X.", "  Our mission is X.  "), false);
});

test("the workspace breadcrumb records what was snapshotted", () => {
  assert.equal(
    sourceBreadcrumb({ kind: "mission_long", title: "Mission (long)", version: 4 }),
    "Mission (long) · V4",
  );
  assert.equal(
    sourceBreadcrumb({ kind: "program", title: "  ", version: 1 }),
    "Program description · V1",
  );
});

test("excerpts stay on one line and do not cut mid-word forever", () => {
  const body = "Founded in 2011,\n\nRiverside Youth Collective runs after-school tutoring.";
  assert.equal(excerpt(body, 30), "Founded in 2011, Riverside Yo…");
  assert.equal(excerpt("Short.", 30), "Short.");
});

test("the starter library ships real prompts, not lorem or blank blocks", () => {
  assert.equal(STARTER_BLOCKS.length, 6);
  const kinds = STARTER_BLOCKS.map((b) => b.kind);
  assert.ok(kinds.includes("mission_short"));
  assert.ok(kinds.includes("mission_long"));
  assert.ok(kinds.includes("board_list"));
  assert.ok(kinds.includes("attachment"));
  for (const block of STARTER_BLOCKS) {
    assert.ok(block.body.length > 80, block.title);
    assert.ok(!/lorem|ipsum/i.test(block.body), block.title);
    // Every starter block names what the org has to fill in.
    assert.match(block.body, /\[/, block.title);
  }
});
