/**
 * The deterministic model's detectors.
 *
 * Precision matters more here than anywhere: this is the reviewer that runs when no
 * model key is configured, and a false positive from it is a comment on somebody's
 * pull request. The credential test in particular is a regression test for a real
 * false positive — the first dry run against a real repository flagged
 * `const CACHE_KEY = "entitlement.plus"` as a committed secret.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { detectFindings, looksLikeSecret } from "./model-fake";
import { FAKE_SECRETS, fixtureFile } from "../diff/fixtures";
import { DEFAULT_RULEBOOK, parseRulebook, resolvePolicy } from "../rules/rulebook";

const policy = resolvePolicy({
  config: parseRulebook(`version: 1
rules:
  - id: no-raw-sql
    category: security
    description: SQL must be built with bound parameters, never interpolation.
  - id: no-console-in-server
    category: standards
    description: Server code logs through the structured logger, not console.
`).config,
});

function findingsFor(patch: string, path = "src/app.ts") {
  return detectFindings([fixtureFile({ path, patch })], policy);
}

test("a real credential is flagged, a name that merely lives in a *_KEY is not", () => {
  const flagged = [
    // Assembled in fixtures.ts, never written as literals — see the note there.
    FAKE_SECRETS.__FAKE_STRIPE_LIVE_KEY__,
    FAKE_SECRETS.__FAKE_GITHUB_PAT__,
    'AKIAIOSFODNN7EXAMPLE', // AWS's own documentation example key
    FAKE_SECRETS.__FAKE_SLACK_BOT_TOKEN__,
    'hs256_2f8c1d94ba7e5310fc42',
    'aG9tZS1zZWNyZXQtdmFsdWUtOTk4ODc3NjY1NA',
  ];
  for (const value of flagged) {
    assert.equal(looksLikeSecret(value), true, `${value} should look like a secret`);
  }

  const notSecrets = [
    "entitlement.plus", // the real false positive
    "cache.entitlement.plus",
    "user-password-reset",
    "settings.apiKey",
    "unlimited-medications",
    "Bearer",
    "short",
    "my long pass phrase",
  ];
  for (const value of notSecrets) {
    assert.equal(looksLikeSecret(value), false, `${value} should not look like a secret`);
  }
});

test("a cache key assignment produces no finding at all", () => {
  const found = findingsFor(
    "@@ -1,3 +1,5 @@\n import x from \"y\";\n+const CACHE_KEY = 'entitlement.plus';\n+const ENTITLEMENT_KEY = \"plus\";\n export default x;\n",
  );
  assert.deepEqual(found, []);
});

test("an env-var read is never a committed credential", () => {
  const found = findingsFor(
    '@@ -1,3 +1,4 @@\n export const config = {\n+  apiKey: process.env.STRIPE_SECRET_KEY,\n };\n',
  );
  assert.deepEqual(found, []);
});

test("a placeholder in an example config is not a credential", () => {
  const found = findingsFor(
    '@@ -1,3 +1,4 @@\n export const example = {\n+  apiKey: "your-stripe-secret-key-here",\n };\n',
  );
  assert.deepEqual(found, []);
});

test("a detector tied to a rulebook rule only fires when the rulebook has it", () => {
  const patch = "@@ -1,3 +1,4 @@\n async function f() {\n+  const rows = await sql`select * from t where id = ${id}`;\n }\n";
  const withRule = detectFindings([fixtureFile({ path: "src/db.ts", patch })], policy);
  assert.equal(withRule.length, 1);
  assert.equal(withRule[0]?.ruleId, "no-raw-sql");

  const withoutRule = detectFindings(
    [fixtureFile({ path: "src/db.ts", patch })],
    resolvePolicy({ config: DEFAULT_RULEBOOK }),
  );
  assert.deepEqual(withoutRule, []);
});

test("only added lines are examined: pre-existing code is not this PR's problem", () => {
  const found = findingsFor(
    "@@ -1,4 +1,4 @@\n function f() {\n   console.log(\"already here\");\n-  return 1;\n+  return 2;\n }\n",
    "src/server/f.ts",
  );
  assert.deepEqual(found, []);
});

test("excluded paths are never scanned", () => {
  const excluded = resolvePolicy({
    config: parseRulebook('version: 1\npaths:\n  exclude:\n    - "**/*.generated.ts"\n').config,
  });
  const file = fixtureFile({
    path: "src/api.generated.ts",
    patch: `@@ -1,2 +1,3 @@\n const a = 1;\n+const apiToken = "${FAKE_SECRETS.__FAKE_GITHUB_PAT__}";\n`,
  });
  assert.deepEqual(detectFindings([file], excluded), []);
});

test("a mechanical fix comes with a suggestion, a judgement call does not", () => {
  const loose = findingsFor("@@ -1,3 +1,4 @@\n function f(x) {\n+  if (x == null) {\n }\n");
  assert.equal(loose.length, 1);
  assert.equal(loose[0]?.suggestedPatch, "  if (x === null) {");

  const money = findingsFor("@@ -1,3 +1,4 @@\n function f(item) {\n+  return parseFloat(item.priceUsd);\n }\n");
  assert.equal(money.length, 1);
  assert.equal(money[0]?.suggestedPatch, null, "no safe mechanical fix exists for this one");
});
