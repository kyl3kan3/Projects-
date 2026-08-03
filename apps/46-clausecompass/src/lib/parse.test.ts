/**
 * Parsing and anchoring.
 *
 * The anchoring tests are the ones that matter: they are the executable form of the
 * product's central claim, that a quote in a report is the contract's own words.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildNormalizedIndex,
  headingOf,
  locateQuote,
  looksLikeContract,
  normalizeWhitespace,
  pageForOffset,
  ParseError,
  parseText,
  sectionForOffset,
} from "@/lib/parse";
import { FIXTURES } from "@/fixtures/contracts";

const MSA = FIXTURES[0].text;

test("normalizeWhitespace folds line breaks and typographic characters", () => {
  assert.equal(normalizeWhitespace("within  sixty\n(60)\tdays"), "within sixty (60) days");
  assert.equal(normalizeWhitespace("Client’s “fees” – paid"), 'Client\'s "fees" - paid');
});

test("a quote reflowed across lines still anchors to the document", () => {
  const parsed = parseText(MSA);
  const index = buildNormalizedIndex(parsed.fullText);
  // What a model or a PDF would hand back: same words, different whitespace.
  const reflowed = "Client shall pay each undisputed invoice\n   within sixty (60)\ndays";
  const located = locateQuote(parsed.fullText, index, reflowed);
  assert.ok(located, "the reflowed quote should anchor");
  // The stored quote is the document's substring, not the caller's copy of it.
  assert.equal(
    parsed.fullText.slice(located.startOffset, located.endOffset),
    located.exact,
  );
  assert.match(located.exact, /Client shall pay each undisputed invoice within sixty \(60\) days/);
});

test("a fabricated quote does not anchor", () => {
  const parsed = parseText(MSA);
  const index = buildNormalizedIndex(parsed.fullText);
  const invented =
    "Client shall pay each undisputed invoice within fifteen (15) days of receipt";
  assert.equal(locateQuote(parsed.fullText, index, invented), null);
});

test("a quote too short to be evidence does not anchor", () => {
  const parsed = parseText(MSA);
  const index = buildNormalizedIndex(parsed.fullText);
  assert.equal(locateQuote(parsed.fullText, index, "Client"), null);
});

test("headings are recognised, numbered paragraphs are not", () => {
  assert.deepEqual(headingOf("3. FEES AND PAYMENT"), { ref: "3", heading: "FEES AND PAYMENT" });
  assert.deepEqual(headingOf("CONFIDENTIALITY"), { ref: "", heading: "CONFIDENTIALITY" });
  assert.equal(
    headingOf("3.2 Client shall pay each undisputed invoice within sixty (60) days of receipt."),
    null,
    "a clause body carrying its own number is not a heading",
  );
});

test("the section map covers the fixture's numbered sections", () => {
  const parsed = parseText(MSA);
  const refs = parsed.sectionMap.map((s) => s.ref);
  for (const ref of ["1", "3", "4", "6", "7", "8", "12", "14"]) {
    assert.ok(refs.includes(ref), `section ${ref} should be in the map`);
  }
  assert.ok(parsed.blocks.length > 30, "the MSA should split into many blocks");
});

test("offsets locate the page and the nearest section", () => {
  const parsed = parseText(MSA);
  const index = buildNormalizedIndex(parsed.fullText);
  const located = locateQuote(parsed.fullText, index, "irrevocably assigns to Client all right");
  assert.ok(located);
  assert.equal(pageForOffset(parsed.blocks, located.startOffset), 1);
  const section = sectionForOffset(parsed.blocks, parsed.sectionMap, located.startOffset);
  assert.equal(section?.ref, "4");
});

test("a document that is not a contract is refused rather than guessed at", () => {
  const menu = `LUNCH MENU\n\nSoup of the day, six dollars. Grilled cheese, eight dollars. Coffee, three dollars.\n\n${"Daily specials rotate weekly and are written on the board by the door. ".repeat(
    6,
  )}`;
  assert.throws(() => parseText(menu), ParseError);
  assert.equal(looksLikeContract(menu), false);
});

test("too little text is an honest error, not an empty review", () => {
  assert.throws(() => parseText("This agreement is short."), ParseError);
});

test("every fixture parses and keeps its own words verbatim", () => {
  for (const fixture of FIXTURES) {
    const parsed = parseText(fixture.text);
    const index = buildNormalizedIndex(parsed.fullText);
    assert.ok(parsed.blocks.length > 5, `${fixture.key} should produce blocks`);
    // The full text is a whitespace-normalised rendering of the source, so every
    // sentence of the source must be findable in it.
    const sentence = fixture.text
      .split("\n")
      .find((line) => line.trim().length > 80) as string;
    assert.ok(
      locateQuote(parsed.fullText, index, sentence.trim()),
      `${fixture.key}: a real sentence from the source should anchor`,
    );
  }
});
