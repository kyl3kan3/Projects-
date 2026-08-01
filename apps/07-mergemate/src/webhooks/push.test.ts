/**
 * Rulebook change detection.
 *
 * A rulebook edit is only honoured on the default branch — otherwise a pull request
 * could loosen the standards it is itself judged against — and the check has to be
 * cheap, because a busy monorepo delivers far more pushes than rulebook edits.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { pushTouchesRulebook, RULEBOOK_PATH } from "./push";

const repository = { default_branch: "main" };

test("a rulebook edit on the default branch is detected", () => {
  assert.equal(
    pushTouchesRulebook({
      ref: "refs/heads/main",
      repository,
      commits: [{ modified: [RULEBOOK_PATH] }],
    }),
    true,
  );
  assert.equal(
    pushTouchesRulebook({ ref: "refs/heads/main", repository, commits: [{ added: [RULEBOOK_PATH] }] }),
    true,
  );
  assert.equal(
    pushTouchesRulebook({ ref: "refs/heads/main", repository, commits: [{ removed: [RULEBOOK_PATH] }] }),
    true,
    "a deletion is a change too, and must not go unnoticed",
  );
});

test("the same edit on a feature branch is ignored", () => {
  assert.equal(
    pushTouchesRulebook({
      ref: "refs/heads/loosen-the-rules",
      repository,
      commits: [{ modified: [RULEBOOK_PATH] }],
    }),
    false,
  );
  assert.equal(
    pushTouchesRulebook({ ref: "refs/tags/v1.0.0", repository, commits: [{ modified: [RULEBOOK_PATH] }] }),
    false,
  );
});

test("a push that does not touch the rulebook is ignored", () => {
  assert.equal(
    pushTouchesRulebook({
      ref: "refs/heads/main",
      repository,
      commits: [{ modified: ["src/index.ts"] }, { added: ["docs/.mergemate.yml.example"] }],
    }),
    false,
  );
  assert.equal(pushTouchesRulebook({ ref: "refs/heads/main", repository }), false);
  assert.equal(pushTouchesRulebook({ ref: "refs/heads/main", repository, commits: [] }), false);
});

test("a repository with a non-main default branch works the same way", () => {
  assert.equal(
    pushTouchesRulebook({
      ref: "refs/heads/trunk",
      repository: { default_branch: "trunk" },
      commits: [{ modified: [RULEBOOK_PATH] }],
    }),
    true,
  );
});
