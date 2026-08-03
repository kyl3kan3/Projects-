/**
 * The diff pipeline. Municipal CMS output is noisy — reformatted whitespace, a
 * reordered nav, a cookie banner — and a crawler that reports those as rule changes
 * trains curators to rubber-stamp the queue, which is how a real change gets waved
 * through.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { computeDiff, extractContent, hashContent, normalizeText } from "./change-detection";

const PAGE = (body: string) => `<!doctype html>
<html><head><title>Permits</title><style>.x{color:red}</style></head>
<body>
  <nav><a href="/">Home</a><a href="/permits">Permits</a></nav>
  <main>${body}</main>
  <footer>© 2026 City of Mesa · Updated hourly</footer>
  <script>analytics()</script>
</body></html>`;

test("extraction keeps the content region and drops the furniture", () => {
  const text = extractContent(
    PAGE("<h2>Mechanical</h2><p>Changeouts are issued over the counter.</p>"),
    "main",
  );
  assert.match(text, /Mechanical/);
  assert.match(text, /over the counter/);
  assert.doesNotMatch(text, /Home/);
  assert.doesNotMatch(text, /2026 City of Mesa/);
  assert.doesNotMatch(text, /analytics/);
});

test("extraction falls back to main when the stored selector no longer matches", () => {
  const text = extractContent(PAGE("<p>Fee schedule effective July 1.</p>"), "#content-area-v2");
  assert.match(text, /Fee schedule effective July 1/);
});

test("nav churn and footer timestamps do not move the hash", () => {
  const a = extractContent(PAGE("<p>Water heater replacement $60.00</p>"), "main");
  const b = extractContent(
    `<!doctype html><html><body>
      <nav><a href="/">Home</a><a href="/contact">Contact us</a><a href="/pay">Pay a fee</a></nav>
      <main><p>Water heater replacement $60.00</p></main>
      <footer>© 2027 City of Mesa · Updated 4 minutes ago</footer>
    </body></html>`,
    "main",
  );
  assert.equal(hashContent(a), hashContent(b));
});

test("whitespace-only reformatting is not a change", () => {
  const before = "Mechanical permit\n\nFee: $89.00";
  const after = "Mechanical permit   \n\n\n   Fee: $89.00\t";
  assert.equal(normalizeText(before), normalizeText(after));
  const diff = computeDiff(before, after);
  assert.equal(diff.meaningful, false);
  assert.equal(diff.summary, "No text change");
});

test("a real requirement change is meaningful, counted, and anchored", () => {
  const before = [
    "Mechanical permits",
    "Like-for-like replacement is issued over the counter.",
    "Fee: $89.00",
  ].join("\n");
  const after = [
    "Mechanical permits",
    "Like-for-like replacement is issued over the counter.",
    "A Manual J load calculation is required above 5 tons.",
    "Fee: $89.00",
  ].join("\n");

  const diff = computeDiff(before, after);
  assert.equal(diff.meaningful, true);
  assert.equal(diff.addedLines, 1);
  assert.equal(diff.removedLines, 0);
  assert.match(diff.summary, /1 line changed near "A Manual J load calculation/);
  assert.match(diff.rawDiff, /^\+ A Manual J load calculation/m);
});

test("a fee increase shows both sides of the line", () => {
  const diff = computeDiff(
    "Water heater replacement $56.00",
    "Water heater replacement $60.00",
  );
  assert.equal(diff.meaningful, true);
  assert.match(diff.rawDiff, /- Water heater replacement \$56\.00/);
  assert.match(diff.rawDiff, /\+ Water heater replacement \$60\.00/);
  assert.equal(diff.addedLines, 1);
  assert.equal(diff.removedLines, 1);
});

test("hashing is stable and content-addressed", () => {
  assert.equal(hashContent("abc"), hashContent("abc"));
  assert.notEqual(hashContent("abc"), hashContent("abd"));
  assert.equal(hashContent("abc").length, 64);
});
