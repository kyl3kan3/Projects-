/**
 * The requested-changes email. This artefact leaves the product and goes to a client, so
 * its structure is asserted rather than trusted.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequestedChangesEmail, draftSubject } from "@/lib/email-draft";
import { findBannedPhrases } from "@/lib/explain";

const asks = [
  {
    clauseLabel: "Auto-Renewal",
    citation: "§7.2 · P.1",
    severity: "caution" as const,
    emailSnippet: "could we move the non-renewal notice window to thirty days?",
    suggestedText: "This Agreement renews for successive twelve (12) month terms unless either Party gives thirty (30) days' notice.",
  },
  {
    clauseLabel: "Indemnity",
    citation: "§6.1 · P.1",
    severity: "high" as const,
    emailSnippet: "could we make the indemnity mutual?",
    suggestedText: "Each Party shall defend, indemnify and hold harmless the other Party from third-party claims arising from its own acts.",
  },
];

test("the highest severity ask comes first and every ask is numbered", () => {
  const body = buildRequestedChangesEmail({
    contractTitle: "Master Services Agreement",
    counterparty: "Northgate Retail Group, Inc.",
    senderName: "Rae Whitcombe",
    asks,
  });
  const indemnityAt = body.indexOf("Indemnity");
  const renewalAt = body.indexOf("Auto-Renewal");
  assert.ok(indemnityAt < renewalAt, "HIGH asks come before CAUTION asks");
  assert.match(body, /1\. Indemnity \(§6\.1 · P\.1\)/);
  assert.match(body, /2\. Auto-Renewal \(§7\.2 · P\.1\)/);
  assert.match(body, /Suggested wording: Each Party shall defend/);
  assert.match(body, /2 changes/);
  assert.match(body, /Rae Whitcombe$/);
});

test("the draft never tells anyone what to do", () => {
  const body = buildRequestedChangesEmail({
    contractTitle: "Master Services Agreement",
    counterparty: null,
    senderName: "Rae Whitcombe",
    asks,
  });
  assert.deepEqual(findBannedPhrases(body), []);
});

test("a clean contract produces a short, honest note instead of empty asks", () => {
  const body = buildRequestedChangesEmail({
    contractTitle: "Brand Identity SOW",
    counterparty: "Fenwick Coffee Roasters, LLC",
    senderName: "Rae Whitcombe",
    asks: [],
  });
  assert.match(body, /happy with the terms as drafted/);
  assert.ok(!body.includes("1."), "no numbered asks when there are none");
});

test("one ask reads as one change, not as '1 changes'", () => {
  const body = buildRequestedChangesEmail({
    contractTitle: "NDA",
    counterparty: null,
    senderName: "Rae",
    asks: [asks[0]],
  });
  assert.match(body, /one change/);
});

test("suggested wording is collapsed to one line so it pastes cleanly", () => {
  const body = buildRequestedChangesEmail({
    contractTitle: "NDA",
    counterparty: null,
    senderName: "Rae",
    asks: [{ ...asks[0], suggestedText: "First line.\n\n   Second line." }],
  });
  assert.match(body, /Suggested wording: First line\. Second line\./);
});

test("the subject names the document", () => {
  assert.equal(draftSubject("Master Services Agreement"), "Master Services Agreement — a few suggested changes");
});
