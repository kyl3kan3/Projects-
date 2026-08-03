import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalize } from "./canonicalize";
import { diffRaw } from "./index";
import { normalizeUsage } from "./impact";
import { detectDrift, generateSuite, staleAssertions } from "./contract-tests";

const raw = `openapi: 3.1.0
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
                required: [data]
                properties:
                  data:
                    type: array
                    items:
                      type: object
                      required: [id, status]
                      properties:
                        id: { type: string }
                        status: { type: string, enum: [open, paid, cancelled] }
                        shipped_at: { type: [string, "null"] }
  /v1/orders/{id}:
    get:
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                type: object
                required: [id]
                properties:
                  id: { type: string }
    delete:
      responses:
        "204": { description: gone }
  /v1/refunds:
    post:
      requestBody:
        content: { application/json: { schema: { type: object } } }
      responses:
        "201": { description: created }
`;

const opts = { framework: "vitest" as const, apiName: "Orders API", deployLabel: "4d81e07" };

test("the generated suite asserts status, required fields, enums and nullability", async () => {
  const { doc } = await canonicalize(raw);
  const suite = generateSuite(doc, opts);

  assert.match(suite.source, /import \{ describe, it, expect \} from "vitest"/);
  assert.match(suite.source, /describe\("GET \/v1\/orders"/);
  assert.match(suite.source, /expect\(res\.status\)\.toBe\(200\)/);
  assert.match(suite.source, /expectPresent\(body, "data"\)/);
  assert.match(suite.source, /expectPresent\(body, "data\.0\.id"\)/);
  assert.match(suite.source, /expectOneOf\(at\(body, "data\.0\.status"\), \["cancelled","open","paid"\]/);
  assert.match(suite.source, /expectType\(at\(body, "data\.0\.shipped_at"\), "string", true/);
  assert.equal(suite.filename, "orders-api.contract.test.ts");
});

test("only unattended-safe operations are called: no POST, no DELETE", async () => {
  const { doc } = await canonicalize(raw);
  const suite = generateSuite(doc, opts);
  assert.doesNotMatch(suite.source, /call\("POST"/);
  assert.doesNotMatch(suite.source, /call\("DELETE"/);
  assert.match(suite.source, /call\("GET", "\/v1\/orders\/1"\)/, "path templates get a sample value");
});

test("scoping to a consumer narrows the suite to what they declared", async () => {
  const { doc } = await canonicalize(raw);
  const scoped = generateSuite(doc, {
    ...opts,
    consumerName: "Acme webhooks",
    declaredUsage: normalizeUsage({ endpoints: ["GET /v1/orders"], fields: ["status"] }),
  });
  assert.match(scoped.source, /Consumer: Acme webhooks/);
  assert.match(scoped.source, /describe\("GET \/v1\/orders"/);
  assert.doesNotMatch(scoped.source, /describe\("GET \/v1\/orders\/\{id\}"/);
  assert.ok(scoped.assertions.some((a) => a.fieldPath === "data.0.status"));
  assert.ok(
    !scoped.assertions.some((a) => a.fieldPath === "data.0.shipped_at"),
    "an undeclared field should not be asserted for this consumer",
  );
  assert.equal(scoped.filename, "acme-webhooks.contract.test.ts");
});

test("a spec with nothing testable produces a suite that runs and explains itself", async () => {
  const { doc } = await canonicalize(`openapi: 3.1.0
info: { title: Write Only, version: "1" }
paths:
  /v1/events:
    post:
      responses:
        "202": { description: accepted }
`);
  const suite = generateSuite(doc, { ...opts, apiName: "Write Only" });
  assert.match(suite.source, /no unattended-testable GET responses/);
  assert.match(suite.source, /expect\(true\)\.toBe\(true\)/);
});

test("regeneration reports drift instead of overwriting a customized suite", async () => {
  const { doc: v1 } = await canonicalize(raw);
  const original = generateSuite(v1, opts);

  const { doc: v2 } = await canonicalize(
    raw
      .replace("enum: [open, paid, cancelled]", "enum: [open, paid]")
      .replace("                        shipped_at: { type: [string, \"null\"] }\n", ""),
  );
  const regenerated = generateSuite(v2, opts);

  const drift = detectDrift(original.assertions, regenerated.assertions);
  assert.ok(
    drift.removed.some((a) => a.fieldPath === "data.0.shipped_at"),
    "the dropped field's assertions should be reported as removed",
  );
  assert.equal(drift.added.length, 0);
  assert.ok(drift.unchanged > 0);
});

test("a diff names the exact assertions that would now fail", async () => {
  const { doc } = await canonicalize(raw);
  const suite = generateSuite(doc, opts);
  const breakingSpec = raw.replace("enum: [open, paid, cancelled]", "enum: [open, paid]");
  const r = await diffRaw(raw, breakingSpec);

  const stale = staleAssertions(suite.assertions, r.findings);
  assert.ok(stale.length > 0, "the removed enum value should invalidate the enum assertion");
  const enumStale = stale.find((s) => s.assertion.kind === "enum");
  assert.ok(enumStale);
  assert.equal(enumStale.assertion.fieldPath, "data.0.status");
  assert.equal(enumStale.finding.ruleId, "response.enum.value-removed");
});

test("a request-side change never marks a read assertion stale", async () => {
  const { doc } = await canonicalize(raw);
  const suite = generateSuite(doc, opts);
  const tightened = raw.replace(
    "      requestBody:\n        content: { application/json: { schema: { type: object } } }",
    "      requestBody:\n        required: true\n        content: { application/json: { schema: { type: object } } }",
  );
  const r = await diffRaw(raw, tightened);
  assert.ok(r.findings.some((f) => f.side === "request" && f.level === "breaking"));
  assert.deepEqual(staleAssertions(suite.assertions, r.findings), []);
});

test("assertion ids are stable across regenerations of an unchanged spec", async () => {
  const { doc } = await canonicalize(raw);
  const a = generateSuite(doc, opts);
  const b = generateSuite(doc, opts);
  assert.deepEqual(
    a.assertions.map((x) => x.id),
    b.assertions.map((x) => x.id),
  );
  assert.equal(a.source, b.source);
  assert.equal(new Set(a.assertions.map((x) => x.id)).size, a.assertions.length, "ids must be unique");
});
