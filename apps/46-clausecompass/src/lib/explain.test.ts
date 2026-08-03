/**
 * The explanation gates.
 *
 * This is the compliance surface of the product in test form: if any copy that can reach
 * a report contains advice phrasing, this file fails, and the build with it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  explainFromTemplate,
  findBannedPhrases,
  gateExplanation,
  LAWYER_POINTER,
  longestSentenceWords,
  MAX_STRUCK_CHARS,
  MAX_READING_GRADE,
  readingGrade,
} from "@/lib/explain";
import { DEFAULT_RULES } from "@/lib/playbook";
import { CLAUSE_LABELS } from "@/lib/taxonomy";

test("advice phrasing is caught wherever it appears", () => {
  assert.deepEqual(findBannedPhrases("You should not sign this."), ["you should", "you should not"]);
  assert.deepEqual(findBannedPhrases("We recommend a lawyer reviews it."), ["we recommend"]);
  assert.deepEqual(findBannedPhrases("This is legal advice."), ["legal advice"]);
  assert.deepEqual(findBannedPhrases("The clause moves ownership on delivery."), []);
});

test("the gate rejects advice, long sentences and empty sections", () => {
  const advice = gateExplanation(["The clause is one-sided.", "You should push back on it."]);
  assert.equal(advice.ok, false);
  assert.match(advice.reasons.join(" "), /advice phrasing/);

  const rambling = gateExplanation([`The clause ${"and again ".repeat(20)} ends here.`]);
  assert.equal(rambling.ok, false);
  assert.match(rambling.reasons.join(" "), /word sentence/);

  assert.equal(gateExplanation(["   "]).ok, false);
});

test("plain writing passes and legalese does not", () => {
  const plain = "The client has 60 days to pay each invoice. The clock starts when they get it.";
  assert.ok(readingGrade(plain) < MAX_READING_GRADE);
  const legalese =
    "Notwithstanding the foregoing provisions hereof, the indemnification obligations enumerated herein shall be construed as surviving any purported termination of the aforementioned agreement in perpetuity.";
  assert.ok(readingGrade(legalese) > MAX_READING_GRADE);
});

test("longestSentenceWords measures the longest sentence, not the average", () => {
  assert.equal(longestSentenceWords("Short one. Two words here now ok."), 5);
});

test("every rule in the default playbook passes the gates", () => {
  for (const rule of DEFAULT_RULES) {
    const gate = gateExplanation([
      rule.explanationTemplate,
      rule.forYouTemplate,
      rule.marketNote,
      rule.firedTemplate,
      rule.title,
    ]);
    assert.ok(gate.ok, `${rule.ruleKey}: ${gate.reasons.join("; ")}`);
  }
});

test("the standing lawyer pointer passes its own gate", () => {
  assert.deepEqual(findBannedPhrases(LAWYER_POINTER), []);
});

test("a templated explanation renders every section and a usable redline", () => {
  const rule = DEFAULT_RULES.find((r) => r.ruleKey === "payment_terms_over_30")!;
  const explanation = explainFromTemplate({
    clauseLabel: CLAUSE_LABELS.payment_terms,
    quote:
      "3.2 Payment Terms. Client shall pay each undisputed invoice within sixty (60) days of Client's receipt of that invoice.",
    firedBecause: "Payment is due in 60 days. Your playbook allows 30.",
    severity: "caution",
    rule,
    vars: { value: 60, threshold: 30 },
  });
  assert.match(explanation.whatItSays, /60 days/);
  assert.match(explanation.forYou, /60 days/);
  assert.ok(explanation.market.length > 20);
  assert.match(explanation.redline.suggestedText, /thirty \(30\) days/);
  assert.ok(explanation.redline.emailSnippet.length > 20);
  assert.equal(explanation.source, "template");
  assert.equal(explanation.usage.inputTokens, 0, "the template path spends no tokens");
  // The struck phrase must be part of the quote, or the strikethrough would be drawn
  // across words the contract never contained.
  assert.ok(
    explanation.redline.originalPhrase.length > 20 &&
      "3.2 Payment Terms. Client shall pay each undisputed invoice within sixty (60) days of Client's receipt of that invoice.".includes(
        explanation.redline.originalPhrase,
      ),
  );
});

test("the struck phrase is cut at a word boundary, never mid-word", () => {
  const rule = DEFAULT_RULES.find((r) => r.ruleKey === "ip_assigns_before_payment")!;
  const quote =
    "4.1 Assignment. Contractor hereby irrevocably assigns to Client all right, title and interest in and to all deliverables, work product, materials, designs, source code and documentation created by Contractor in the course of performing the Services (collectively, the \"Work Product\"), including all copyrights.";
  const explanation = explainFromTemplate({
    clauseLabel: CLAUSE_LABELS.ip_assignment,
    quote,
    firedBecause: "Ownership passes on creation, not on payment.",
    severity: "high",
    rule,
    vars: { value: "creation" },
  });
  const struck = explanation.redline.originalPhrase;
  assert.ok(struck.length <= MAX_STRUCK_CHARS + 1, `struck phrase is ${struck.length} chars`);
  assert.ok(struck.startsWith("Contractor hereby irrevocably assigns"), "the section number is dropped");
  assert.match(struck, /…$/, "a truncated phrase says so");
  // The visible part is verbatim from the quote.
  assert.ok(quote.includes(struck.replace(/…$/, "")), "the struck text is the contract's own");
});

test("a missing clause gets an add-this-clause redline, not a strikethrough", () => {
  const rule = DEFAULT_RULES.find((r) => r.ruleKey === "liability_cap_missing")!;
  const explanation = explainFromTemplate({
    clauseLabel: CLAUSE_LABELS.liability_cap,
    quote: null,
    firedBecause: "No clause limits what either side can owe the other.",
    severity: "high",
    rule,
    vars: {},
  });
  assert.equal(explanation.redline.originalPhrase, "");
  assert.match(explanation.redline.emailSnippet, /add a liability cap clause/i);
  assert.match(explanation.redline.suggestedText, /shall not exceed/);
});

test("every templated explanation of every rule passes the gate as it would ship", () => {
  for (const rule of DEFAULT_RULES) {
    const explanation = explainFromTemplate({
      clauseLabel: "Test Clause",
      quote: "The Party shall pay each undisputed invoice within sixty (60) days of receipt of it.",
      firedBecause: "A rule fired.",
      severity: "high",
      rule,
      vars: { value: 60, threshold: 30, months: 12 },
    });
    const gate = gateExplanation([
      explanation.whatItSays,
      explanation.forYou,
      explanation.market,
      explanation.redline.rationale,
    ]);
    assert.ok(gate.ok, `${rule.ruleKey}: ${gate.reasons.join("; ")}`);
  }
});
