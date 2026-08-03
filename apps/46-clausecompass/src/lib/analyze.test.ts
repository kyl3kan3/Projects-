/**
 * The deterministic analyser: number reading, field extraction, quote choice.
 *
 * These are the values the playbook scores against, so a wrong number here becomes a
 * wrong flag in front of someone deciding whether to sign something.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeContract,
  classify,
  daysFrom,
  extractFields,
  numberFrom,
  pickQuote,
} from "@/lib/analyze";
import { parseText } from "@/lib/parse";
import { FIXTURES } from "@/fixtures/contracts";

test("numberFrom prefers digits and understands the words contracts use", () => {
  assert.equal(numberFrom("sixty (60)"), 60);
  assert.equal(numberFrom("thirty"), 30);
  assert.equal(numberFrom("45"), 45);
  assert.equal(numberFrom("forty-five"), 45);
  assert.equal(numberFrom("of the"), null);
});

test("daysFrom reads the phrasings contracts actually use", () => {
  assert.equal(daysFrom("Client shall pay within sixty (60) days of receipt"), 60);
  assert.equal(daysFrom("payment terms are net 45"), 45);
  assert.equal(daysFrom("at least fifteen (15) days prior to the end of the term"), 15);
  assert.equal(daysFrom("upon five (5) days' written notice"), 5);
  assert.equal(daysFrom("within thirty days"), 30);
  assert.equal(daysFrom("no stated period"), null);
});

test("the renewal notice is read from the renewal paragraph, not the cure period", () => {
  // Both numbers live in section 7 of the fixture. Reading the section as one blob gave
  // the 30-day cure period as the renewal notice window, understating the flag.
  const parsed = parseText(FIXTURES[0].text);
  const analysis = analyzeContract(parsed);
  const renewal = analysis.clauses.find((c) => c.clauseType === "auto_renewal");
  assert.equal(renewal?.fields.notice_days, 15);
});

test("payment terms extract the due date, the deposit and the billing shape", () => {
  const fields = extractFields(
    "payment_terms",
    "Client shall pay each invoice within fifteen (15) days. The fee is invoiced as follows: 40% deposit upon execution of this SOW.",
  );
  assert.equal(fields.payment_days, 15);
  assert.equal(fields.deposit_pct, 40);
  assert.equal(fields.milestone_based, true);
});

test("IP assignment distinguishes transfer on payment from transfer on creation", () => {
  assert.equal(
    extractFields("ip_assignment", "Upon Studio's receipt of payment in full, Studio assigns all right, title and interest.")
      .assigns_on,
    "payment",
  );
  assert.equal(
    extractFields("ip_assignment", "Contractor assigns all Work Product effective upon creation of each item.")
      .assigns_on,
    "creation",
  );
  assert.equal(
    extractFields("ip_assignment", "Ownership of the deliverables is addressed in Exhibit B.").assigns_on,
    "unclear",
  );
});

test("indemnity mutuality is read from who promises, not from the word mutual", () => {
  assert.equal(
    extractFields("indemnity", "Contractor shall defend, indemnify and hold harmless Client from any and all claims.")
      .mutual,
    false,
  );
  assert.equal(
    extractFields(
      "indemnity",
      "Each Party shall defend, indemnify and hold harmless the other Party from third-party claims, subject to the limitation of liability in Section 5.",
    ).mutual,
    true,
  );
  assert.equal(
    extractFields(
      "indemnity",
      "Each Party shall defend, indemnify and hold harmless the other Party from third-party claims, subject to the limitation of liability in Section 5.",
    ).capped,
    true,
  );
});

test("termination for convenience means someone other than the client can walk", () => {
  const clientOnly = extractFields(
    "termination",
    "Client may terminate this Agreement at any time, for any reason, upon five (5) days' written notice. Either Party may terminate this Agreement upon written notice if the other Party commits a material breach and fails to cure within thirty (30) days.",
  );
  assert.equal(clientOnly.for_convenience, false);
  assert.equal(clientOnly.client_only, true);
  assert.equal(clientOnly.notice_days, 5, "the notice period comes from the sentence that granted the right");

  const mutual = extractFields(
    "termination",
    "Either Party may terminate this SOW for any reason upon thirty (30) days' written notice.",
  );
  assert.equal(mutual.for_convenience, true);
  assert.equal(mutual.client_only, false);

  const nda = extractFields(
    "termination",
    "This Agreement begins on the date first written above and either Party may terminate it upon thirty (30) days' written notice.",
  );
  assert.equal(nda.for_convenience, true, "a no-fault notice right is convenience even unlabelled");
});

test("liability caps are classified by what they are measured against", () => {
  assert.equal(
    extractFields("liability_cap", "each Party's total aggregate liability shall not exceed the total fees paid or payable under this SOW")
      .cap_basis,
    "fees",
  );
  assert.equal(
    extractFields("liability_cap", "liability shall not exceed $50,000 in the aggregate").cap_basis,
    "amount",
  );
  assert.equal(
    extractFields("liability_cap", "liability shall not exceed $50,000 in the aggregate").cap_amount_cents,
    5_000_000,
  );
  assert.equal(
    extractFields("liability_cap", "In no event shall either Party be liable for consequential damages.")
      .cap_basis,
    "none",
    "excluding indirect loss is not a monetary cap",
  );
});

test("revision rounds are not read out of a section number", () => {
  const unlimited = extractFields(
    "scope_revisions",
    "2.1 Revisions. Contractor shall provide revisions as necessary to satisfy Client, without additional charge.",
  );
  assert.equal(unlimited.unlimited, true);
  assert.equal(unlimited.rounds, null, '"2.1 Revisions" must not be read as one round');

  const counted = extractFields(
    "scope_revisions",
    "The fee includes two (2) rounds of revisions per deliverable. Further revisions require a written change order.",
  );
  assert.equal(counted.rounds, 2);
  assert.equal(counted.unlimited, false);
  assert.equal(counted.change_order_required, true);
});

test("classification needs real signal, not one common word", () => {
  assert.equal(classify("The parties will meet on Tuesday to discuss the schedule.").clauseType, null);
  assert.equal(
    classify("Limitation of Liability. In no event shall the aggregate liability exceed the fees paid.").clauseType,
    "liability_cap",
  );
});

test("the quote is the paragraph that states the operative term", () => {
  const parsed = parseText(FIXTURES[0].text);
  const analysis = analyzeContract(parsed);
  const termination = analysis.clauses.find((c) => c.clauseType === "termination");
  assert.ok(termination);
  // The highest-scoring termination paragraph in this contract is the for-cause one;
  // the flag is about the client-only exit, so that is what must be quoted.
  assert.match(termination.quotes[0], /Client may terminate this Agreement or any SOW at any time/);
});

test("pickQuote extends past a heading sentence so a quote is never just a label", () => {
  const quote = pickQuote(
    "8.1 Termination for Convenience. Either Party may terminate this SOW for any reason upon thirty (30) days' written notice.",
    "termination",
  );
  assert.ok(quote && quote.length > 60, "a heading alone is not evidence");
  assert.match(quote, /Either Party may terminate/);
});

test("one clause per type, and every clause carries a quote", () => {
  for (const fixture of FIXTURES) {
    const analysis = analyzeContract(parseText(fixture.text));
    const types = analysis.clauses.map((c) => c.clauseType);
    assert.equal(new Set(types).size, types.length, `${fixture.key}: duplicate clause types`);
    for (const clause of analysis.clauses) {
      assert.ok(clause.quotes.length > 0, `${fixture.key}: ${clause.clauseType} has no quote`);
      assert.ok(
        parseText(fixture.text).fullText.includes(clause.quotes[0]),
        `${fixture.key}: ${clause.clauseType} quote is not verbatim`,
      );
    }
  }
});

test("the analyser is deterministic across runs", () => {
  const parsed = parseText(FIXTURES[0].text);
  const first = JSON.stringify(analyzeContract(parsed));
  for (let i = 0; i < 4; i++) {
    assert.equal(JSON.stringify(analyzeContract(parsed)), first);
  }
});
