/**
 * The scorer. Deterministic rules are the product's trust story, so these tests are
 * about the two ways a rule engine lies: firing the wrong rung of a ladder, and firing
 * a missing-clause rule for a clause the contract never needed.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RULES,
  describeRule,
  renderTemplate,
  score,
  worstSeverity,
  type ScorableRule,
} from "@/lib/playbook";
import { analyzeContract } from "@/lib/analyze";
import { parseText } from "@/lib/parse";
import { FIXTURES } from "@/fixtures/contracts";
import type { ContractType } from "@/db/schema";

const RULES = DEFAULT_RULES as unknown as ScorableRule[];

function run(contractType: ContractType, clauses: Array<{ clauseType: string; fields: Record<string, unknown> }>) {
  return score({
    contractType,
    clauses: clauses.map((c, i) => ({ id: `c${i}`, clauseType: c.clauseType as never, fields: c.fields })),
    rules: RULES,
  });
}

test("a threshold ladder fires its tightest crossed rung, once", () => {
  const fired = run("msa", [{ clauseType: "payment_terms", fields: { payment_days: 90 } }]);
  const paymentFlags = fired.filter((f) => f.ruleKey.startsWith("payment_terms_over"));
  assert.equal(paymentFlags.length, 1, "net-90 must not raise both rungs");
  assert.equal(paymentFlags[0].ruleKey, "payment_terms_over_60");
  assert.equal(paymentFlags[0].severity, "high");
});

test("the looser rung fires on its own when the tighter one is not crossed", () => {
  const fired = run("msa", [{ clauseType: "payment_terms", fields: { payment_days: 45 } }]);
  const paymentFlags = fired.filter((f) => f.ruleKey.startsWith("payment_terms_over"));
  assert.equal(paymentFlags.length, 1);
  assert.equal(paymentFlags[0].ruleKey, "payment_terms_over_30");
  assert.equal(paymentFlags[0].severity, "caution");
});

test("terms inside the playbook raise nothing", () => {
  const fired = run("msa", [{ clauseType: "payment_terms", fields: { payment_days: 30 } }]);
  assert.equal(fired.filter((f) => f.clauseType === "payment_terms").length, 0);
});

test("missing-clause rules respect the contract-type checklist", () => {
  // An NDA needs no payment terms; an MSA does.
  const nda = run("nda", [
    { clauseType: "confidentiality", fields: { mutual: true } },
    { clauseType: "termination", fields: { for_convenience: true } },
    { clauseType: "governing_law", fields: { jurisdiction: "Washington" } },
  ]);
  assert.equal(nda.length, 0, `an NDA with its own clauses should be clean, got ${nda.map((f) => f.ruleKey).join(",")}`);

  const msa = run("msa", [{ clauseType: "payment_terms", fields: { payment_days: 30 } }]);
  const missing = msa.filter((f) => f.clauseId === null).map((f) => f.ruleKey);
  assert.ok(missing.includes("liability_cap_missing"));
  assert.ok(missing.includes("ip_assignment_missing"));
  assert.ok(!missing.includes("payment_terms_missing"), "payment terms were present");
});

test('an unclear value is not reported as a confident finding', () => {
  const fired = run("msa", [{ clauseType: "ip_assignment", fields: { assigns_on: "unclear" } }]);
  assert.equal(
    fired.filter((f) => f.ruleKey === "ip_assigns_before_payment").length,
    0,
    "we do not know when rights transfer, so we do not claim they transfer early",
  );
});

test("a clause can raise two independent flags", () => {
  const fired = run("msa", [{ clauseType: "indemnity", fields: { mutual: false, capped: false } }]);
  const keys = fired.filter((f) => f.clauseType === "indemnity").map((f) => f.ruleKey);
  assert.deepEqual(keys.sort(), ["indemnity_not_mutual", "indemnity_uncapped"]);
});

test("a disabled rule fires nothing, and an edited threshold is respected", () => {
  const edited = RULES.map((r) =>
    r.ruleKey === "payment_terms_over_30" ? { ...r, threshold: 60 } : r,
  );
  const fired = score({
    contractType: "msa",
    clauses: [{ id: "c1", clauseType: "payment_terms", fields: { payment_days: 45 } }],
    rules: edited,
  });
  assert.equal(fired.filter((f) => f.clauseType === "payment_terms").length, 0, "net-45 is inside a net-60 house rule");

  const disabled = RULES.map((r) =>
    r.ruleKey === "non_compete_present" ? { ...r, enabled: false } : r,
  );
  const fired2 = score({
    contractType: "msa",
    clauses: [{ id: "c1", clauseType: "non_compete", fields: { present: true, months: 12 } }],
    rules: disabled,
  });
  assert.equal(fired2.filter((f) => f.ruleKey === "non_compete_present").length, 0);
});

test("fired_because renders the actual numbers", () => {
  const fired = run("msa", [{ clauseType: "auto_renewal", fields: { notice_days: 15 } }]);
  const flag = fired.find((f) => f.ruleKey === "auto_renewal_short_notice");
  assert.ok(flag);
  assert.match(flag.firedBecause, /15 days ahead/);
  assert.match(flag.firedBecause, /at least 30/);
  assert.ok(!flag.firedBecause.includes("{{"), "no template markers may survive rendering");
});

test("renderTemplate leaves an em dash rather than the word undefined", () => {
  assert.equal(renderTemplate("due in {{value}} days", {}), "due in — days");
});

test("the same contract and playbook produce the same flags every time", () => {
  const analysis = analyzeContract(parseText(FIXTURES[0].text));
  const clauses = analysis.clauses.map((c, i) => ({
    id: `c${i}`,
    clauseType: c.clauseType,
    fields: c.fields,
  }));
  const first = JSON.stringify(score({ contractType: "msa", clauses, rules: RULES }));
  for (let i = 0; i < 4; i++) {
    assert.equal(JSON.stringify(score({ contractType: "msa", clauses, rules: RULES })), first);
  }
});

test("the hostile fixture raises exactly its hand-labelled flags", () => {
  const fixture = FIXTURES[0];
  const analysis = analyzeContract(parseText(fixture.text));
  const fired = score({
    contractType: fixture.contractType,
    clauses: analysis.clauses.map((c, i) => ({ id: `c${i}`, clauseType: c.clauseType, fields: c.fields })),
    rules: RULES,
  });
  assert.deepEqual(fired.map((f) => f.ruleKey).sort(), [...fixture.expectedFlags].sort());
  // Worst first, so the report opens on what matters.
  assert.equal(fired[0].severity, "high");
});

test("the fair fixtures raise nothing at all", () => {
  for (const fixture of FIXTURES.slice(1)) {
    const analysis = analyzeContract(parseText(fixture.text));
    const fired = score({
      contractType: fixture.contractType,
      clauses: analysis.clauses.map((c, i) => ({ id: `c${i}`, clauseType: c.clauseType, fields: c.fields })),
      rules: RULES,
    });
    assert.deepEqual(fired.map((f) => f.ruleKey), [], `${fixture.key} should be clean`);
  }
});

test("worstSeverity ranks high above caution above ok", () => {
  assert.equal(worstSeverity(["ok", "caution", "high"]), "high");
  assert.equal(worstSeverity(["ok", "caution"]), "caution");
  assert.equal(worstSeverity([]), "ok");
});

test("every rule can be described in words, with no template markers", () => {
  for (const rule of DEFAULT_RULES) {
    const described = describeRule(rule);
    assert.ok(described.startsWith("Fires when"), `${rule.ruleKey}: ${described}`);
    assert.ok(!described.includes("{{"), `${rule.ruleKey} leaked a template marker`);
    assert.ok(!described.includes("—"), `${rule.ruleKey} has no threshold to describe`);
  }
});
