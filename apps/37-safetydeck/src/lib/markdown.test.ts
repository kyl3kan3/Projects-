/**
 * The Markdown subset. It parses to a typed block list rather than HTML because
 * custom talk bodies are pasted in by customers — untrusted text that must never
 * reach the DOM as markup.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseInline, parseTalkBody, readAloudMinutes, spansToText, talkPlainText } from "./markdown";

test("headings, paragraphs, bullets and numbers all parse", () => {
  const blocks = parseTalkBody(
    "## Why this one matters\nFalls kill more people than anything else.\n\n- Guardrails first\n- Harness second\n\n1. Where are we exposed?\n2. What is your anchor?",
  );
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["heading", "paragraph", "bullets", "numbers"],
  );
  assert.equal(blocks[2].kind === "bullets" && blocks[2].items.length, 2);
  assert.equal(blocks[3].kind === "numbers" && blocks[3].items.length, 2);
});

test("consecutive lines join into one paragraph, blank lines separate", () => {
  const blocks = parseTalkBody("One line.\nStill the same paragraph.\n\nA new one.");
  assert.equal(blocks.length, 2);
  assert.equal(
    blocks[0].kind === "paragraph" && spansToText(blocks[0].spans),
    "One line. Still the same paragraph.",
  );
});

test("bold runs split out; an unmatched marker stays literal text", () => {
  assert.deepEqual(parseInline("Get **help** now"), [
    { text: "Get ", bold: false },
    { text: "help", bold: true },
    { text: " now", bold: false },
  ]);
  assert.deepEqual(parseInline("Two **stars only"), [{ text: "Two **stars only", bold: false }]);
});

test("markup that would be dangerous as HTML is just text", () => {
  const blocks = parseTalkBody("<script>alert(1)</script>");
  assert.equal(blocks.length, 1);
  assert.equal(
    blocks[0].kind === "paragraph" && spansToText(blocks[0].spans),
    "<script>alert(1)</script>",
    "the parser emits text nodes; nothing is ever interpreted as markup",
  );
});

test("an empty body parses to nothing rather than throwing", () => {
  assert.deepEqual(parseTalkBody(""), []);
  assert.deepEqual(parseTalkBody("\n\n   \n"), []);
});

test("plain text and read-aloud minutes are derived, with a floor of three", () => {
  const body = "## Heading\nA sentence.\n\n- One\n- Two";
  assert.match(talkPlainText(body), /Heading/);
  assert.match(talkPlainText(body), /- One/);
  assert.equal(readAloudMinutes(body), 3, "short bodies still floor at three minutes");
  assert.equal(readAloudMinutes(Array(650).fill("word").join(" ")), 5);
});
