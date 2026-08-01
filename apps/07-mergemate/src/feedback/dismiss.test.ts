/**
 * The dismissal command.
 *
 * Strictness matters in both directions: a reply that means "stop raising this" must
 * be honoured, and a reply that merely mentions the phrase must not silently
 * suppress a finding the team still wants.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { parseIgnoreCommand } from "./dismiss";

test("the command is recognised with or without a bot mention", () => {
  for (const body of [
    "mergemate ignore",
    "MergeMate Ignore",
    "@mergemate mergemate ignore",
    "  mergemate ignore  ",
    "mergemate ignore\nthanks",
  ]) {
    assert.equal(parseIgnoreCommand(body).matched, true, `should match: ${JSON.stringify(body)}`);
  }
});

test("a trailing reason is captured but never acted on", () => {
  const withReason = parseIgnoreCommand("mergemate ignore: this file is vendored");
  assert.equal(withReason.matched, true);
  assert.equal(withReason.note, "this file is vendored");

  const comma = parseIgnoreCommand("mergemate ignore, intentional here");
  assert.equal(comma.note, "intentional here");
});

test("prose that mentions the command is not a command", () => {
  for (const body of [
    "I don't think mergemate ignore is the right call here",
    "should we mergemate ignore this?",
    "ignore mergemate",
    "mergemateignore",
    "",
  ]) {
    assert.equal(parseIgnoreCommand(body).matched, false, `should not match: ${JSON.stringify(body)}`);
  }
});

test("only the first line can carry the command", () => {
  assert.equal(parseIgnoreCommand("looks good to me\nmergemate ignore").matched, false);
});
