/**
 * View helpers.
 *
 * `renderFindingBody` is the one with teeth: it renders model-authored Markdown
 * inside a page, so escaping has to happen before rendering, not after.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { confidenceMeter, esc, relativeTime, renderFindingBody, trendLine } from "./layout";

test("escaping covers every character that could become markup", () => {
  assert.equal(esc(`<script>alert("x")&'`), "&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;");
  assert.equal(esc(null), "");
  assert.equal(esc(undefined), "");
});

test("a finding body renders inline code and fenced blocks, and nothing else", () => {
  const html = renderFindingBody(
    "Use the `parameterised` helper:\n\n```\nconst rows = await db.query(SQL, [id]);\n```\n\nThat binds the value.",
  );
  assert.match(html, /<code>parameterised<\/code>/);
  assert.match(html, /<pre class="well"><code>const rows = await db\.query\(SQL, \[id\]\);<\/code><\/pre>/);
  assert.match(html, /<p class="t-sec">That binds the value\.<\/p>/);
});

test("markup inside a finding body is escaped, not rendered", () => {
  const html = renderFindingBody('An `<img src=x onerror=alert(1)>` tag and <b>bold</b>.');
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<b>"));
  assert.match(html, /&lt;img src=x/);
});

test("the confidence meter fills to the score and leaves the rest as sockets", () => {
  const clears = confidenceMeter(9_400, 8_000);
  assert.equal((clears.match(/class="seg on/g) ?? []).length, 5);
  assert.match(clears, /aria-label="confidence 0\.94 against a threshold of 0\.80, clears the gate"/);

  const under = confidenceMeter(5_500, 8_000);
  assert.equal((under.match(/class="seg on/g) ?? []).length, 3);
  assert.equal((under.match(/class="seg"/g) ?? []).length, 2, "the rest stay empty sockets");
  assert.match(under, /below the gate/);
  assert.match(under, /meter-value">0\.55/, "the value is always stated in text");
});

test("relative time reads like a human wrote it", () => {
  const now = new Date("2026-08-01T12:00:00Z");
  assert.equal(relativeTime(new Date("2026-08-01T11:59:30Z"), now), "just now");
  assert.equal(relativeTime(new Date("2026-08-01T11:58:00Z"), now), "2 minutes ago");
  assert.equal(relativeTime(new Date("2026-08-01T11:00:00Z"), now), "1 hour ago");
  assert.equal(relativeTime(new Date("2026-07-30T12:00:00Z"), now), "2 days ago");
  assert.equal(relativeTime(new Date("2026-05-01T12:00:00Z"), now), "3 months ago");
});

test("a trend line needs two points and never emits NaN", () => {
  assert.equal(trendLine([1]), "");
  const svg = trendLine([2.4, 1.9, 1.2, 0.8]);
  assert.match(svg, /<path d="M0\.0,/);
  assert.ok(!svg.includes("NaN"));
  assert.equal(trendLine([0, 0, 0]).includes("NaN"), false);
});
