import { test } from "node:test";
import assert from "node:assert/strict";
import { diffRaw } from "@/core";
import { exitCodeFor, palette, renderJson, renderReport, shouldColor, toRenderable, wrap } from "./render";

const before = `openapi: 3.1.0
info: { title: Orders API, version: "1" }
paths:
  /v1/orders:
    get:
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                type: object
                required: [id, invoice_url]
                properties:
                  id: { type: string }
                  invoice_url: { type: string }
                  status: { type: string, enum: [open, paid, cancelled] }
`;
const after = before
  .replace("required: [id, invoice_url]", "required: [id]")
  .replace("enum: [open, paid, cancelled]", "enum: [open, paid]");

const plain = palette(false);

test("colour is off in CI and when NO_COLOR is set", () => {
  assert.equal(shouldColor({ isTTY: false }, {}), false);
  assert.equal(shouldColor({ isTTY: true }, { NO_COLOR: "1" }), false);
  assert.equal(shouldColor({ isTTY: true }, {}), true);
  assert.equal(shouldColor({ isTTY: false }, { FORCE_COLOR: "1" }), true);
});

test("the plain report carries the verdict, the counts and every pointer", async () => {
  const r = await diffRaw(before, after);
  const text = renderReport(
    {
      verdict: r.verdict,
      summary: r.summary,
      fromLabel: "old.yaml",
      toLabel: "new.yaml",
      findings: toRenderable(r.findings),
    },
    plain,
  );

  assert.match(text, /old\.yaml -> new\.yaml/);
  assert.match(text, /^BREAKING$/m);
  assert.match(text, /2 breaking · 0 risky · 0 compatible/);
  assert.match(text, /Removed enum value `cancelled` from `status`/);
  assert.match(text, /\/paths\/~1v1~1orders\/get\/responses\/200/);
  // No ANSI escapes leak into a non-TTY stream.
  assert.doesNotMatch(text, /\[/);
});

test("the report contains no emoji, anywhere", async () => {
  const r = await diffRaw(before, after);
  const text = renderReport(
    { verdict: r.verdict, summary: r.summary, fromLabel: "a", toLabel: "b", findings: toRenderable(r.findings) },
    plain,
    { footer: true },
  );
  assert.doesNotMatch(text, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u);
});

test("compatible findings are counted, not listed, unless asked for", async () => {
  const additive = before.replace(
    "                  id: { type: string }",
    "                  id: { type: string }\n                  receipt_url: { type: string }",
  );
  const r = await diffRaw(before, additive);
  const text = renderReport(
    { verdict: r.verdict, summary: r.summary, fromLabel: "a", toLabel: "b", findings: toRenderable(r.findings) },
    plain,
  );
  assert.match(text, /1 compatible change not shown/);
  assert.doesNotMatch(text, /Added response field/);
});

test("the free diff footer sells the hosted product without fabricating anything", async () => {
  const r = await diffRaw(before, after);
  const text = renderReport(
    { verdict: r.verdict, summary: r.summary, fromLabel: "a", toLabel: "b", findings: toRenderable(r.findings) },
    plain,
    { footer: true },
  );
  assert.match(text, /local, one-shot diff/);
  assert.match(text, /schemasentry\.dev/);
  assert.doesNotMatch(text, /\d+[,\d]* (teams|companies|developers)/, "no invented usage numbers");
});

test("a thin spec gets an honest health warning rather than an empty diff", async () => {
  const thin = `openapi: 3.1.0
info: { title: Thin API, version: "1" }
paths:
  /v1/orders:
    get:
      responses:
        "200": { description: ok }
  /v1/refunds:
    get:
      responses:
        "200": { description: ok }
`;
  const r = await diffRaw(thin, thin);
  const text = renderReport(
    {
      verdict: r.verdict,
      summary: r.summary,
      fromLabel: "a",
      toLabel: "b",
      findings: [],
      specHealth: { score: r.to.health.score, operations: r.to.health.operations, warnings: r.to.health.warnings },
    },
    plain,
  );
  assert.match(text, /Spec health 10\/100 across 2 operations/);
  assert.match(text, /near-empty until the spec describes what it returns/);
  assert.match(text, /no response schema/);
});

test("the JSON shape is stable and machine-readable", async () => {
  const r = await diffRaw(before, after);
  const text = renderJson({
    verdict: r.verdict,
    summary: r.summary,
    fromLabel: "old.yaml",
    toLabel: "new.yaml",
    findings: toRenderable(r.findings),
    engineVersion: "1.0.0",
  });
  const parsed = JSON.parse(text) as Record<string, unknown>;
  assert.deepEqual(Object.keys(parsed).sort(), [
    "diffUrl",
    "engineVersion",
    "findings",
    "from",
    "impactedConsumers",
    "specHealth",
    "summary",
    "to",
    "verdict",
  ].sort());
  assert.equal(parsed.verdict, "breaking");
});

test("exit codes: diff never fails, check fails at the level asked for", () => {
  assert.equal(exitCodeFor("breaking", "never"), 0);
  assert.equal(exitCodeFor("breaking", "breaking"), 1);
  assert.equal(exitCodeFor("risky", "breaking"), 0);
  assert.equal(exitCodeFor("risky", "risky"), 1);
  assert.equal(exitCodeFor("compatible", "risky"), 0);
  assert.equal(exitCodeFor("compatible", "breaking"), 0);
});

test("prose wraps to the terminal width with a hanging indent", () => {
  const text = wrap("one two three four five six seven eight nine ten", 20, "  ");
  const lines = text.split("\n");
  assert.ok(lines.length > 1);
  assert.ok(lines.slice(1).every((l) => l.startsWith("  ")));
  assert.ok(lines.every((l) => l.trim().length <= 20));
});
