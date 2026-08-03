import { test } from "node:test";
import assert from "node:assert/strict";
import { diffRaw } from "./index";
import { allRules, RULES, type Finding } from "./rules";

/* ------------------------------------------------------------------ helpers */

/** A spec with one GET returning an Order, parameterized so tests stay short. */
function spec(body: string, version = "3.1.0"): string {
  return `openapi: ${version}
info: { title: Orders API, version: "1.0.0" }
servers: [{ url: "https://api.example.com" }]
paths:
${body}`;
}

const ordersGet = (schema: string, params = "") => `  /v1/orders:
    get:
      operationId: listOrders
${params}      responses:
        "200":
          description: A page of orders
          content:
            application/json:
${schema
  .split("\n")
  .map((l) => (l.trim() ? `              ${l}` : l))
  .join("\n")}
`;

const ordersPost = (schema: string) => `  /v1/orders:
    post:
      operationId: createOrder
      requestBody:
        required: true
        content:
          application/json:
${schema
  .split("\n")
  .map((l) => (l.trim() ? `            ${l}` : l))
  .join("\n")}
      responses:
        "201": { description: Created }
`;

async function run(from: string, to: string, policy?: unknown) {
  return diffRaw(from, to, policy);
}

const ids = (findings: Finding[]) => findings.map((f) => f.ruleId).sort();
const find = (findings: Finding[], ruleId: string) => findings.find((f) => f.ruleId === ruleId);

/* --------------------------------------------------------- identity & noise */

test("an unchanged spec produces no findings and a compatible verdict", async () => {
  const s = spec(ordersGet(`schema:
  type: object
  required: [id, status]
  properties:
    id: { type: string }
    status: { type: string, enum: [open, paid, cancelled] }`));
  const r = await run(s, s);
  assert.deepEqual(r.findings, []);
  assert.equal(r.verdict, "compatible");
  assert.equal(r.fails, false);
});

test("reformatting a spec — reordered keys, 3.0 to 3.1 nullable — is not a change", async () => {
  const before = spec(
    ordersGet(`schema:
  type: object
  properties:
    note: { type: string, nullable: true }
    id: { type: string }`),
    "3.0.3",
  );
  const after = spec(
    ordersGet(`schema:
  properties:
    id: { type: string }
    note: { type: [string, "null"] }
  type: object`),
    "3.1.0",
  );
  const r = await run(before, after);
  assert.deepEqual(r.findings, []);
});

test("renaming a $ref target without changing the shape is not a change", async () => {
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
              schema: { $ref: "#/components/schemas/Order" }
components:
  schemas:
    Order:
      type: object
      required: [id]
      properties: { id: { type: string } }
`;
  const after = before
    .replace("#/components/schemas/Order", "#/components/schemas/OrderV2")
    .replace("    Order:", "    OrderV2:");
  const r = await run(before, after);
  assert.deepEqual(r.findings, []);
});

/* -------------------------------------------------------------- operations */

test("a removed operation is breaking and names the endpoint", async () => {
  const before = spec(`${ordersGet("schema: { type: object }")}  /v1/refunds:
    get:
      responses:
        "200": { description: ok }
`);
  const after = spec(ordersGet("schema: { type: object }"));
  const r = await run(before, after);
  const f = find(r.findings, "operation.removed");
  assert.ok(f);
  assert.equal(f.level, "breaking");
  assert.equal(f.message, "Removed operation GET /v1/refunds");
  assert.equal(f.jsonPointer, "/paths/~1v1~1refunds/get");
  assert.equal(r.verdict, "breaking");
});

test("an added operation is compatible", async () => {
  const before = spec(ordersGet("schema: { type: object }"));
  const after = spec(`${ordersGet("schema: { type: object }")}  /v1/refunds:
    post:
      responses:
        "201": { description: ok }
`);
  const r = await run(before, after);
  assert.deepEqual(ids(r.findings), ["operation.added"]);
  assert.equal(r.verdict, "compatible");
});

test("deprecating an operation is risky, not breaking", async () => {
  const before = spec(ordersGet("schema: { type: object }"));
  const after = spec(ordersGet("schema: { type: object }")).replace(
    "      operationId: listOrders",
    "      operationId: listOrders\n      deprecated: true",
  );
  const r = await run(before, after);
  assert.deepEqual(ids(r.findings), ["operation.deprecated"]);
  assert.equal(r.verdict, "risky");
});

test("a renamed operationId is risky — the HTTP contract holds, generated SDKs do not", async () => {
  const before = spec(ordersGet("schema: { type: object }"));
  const after = before.replace("listOrders", "getOrders");
  const r = await run(before, after);
  const f = find(r.findings, "operation.operation-id.changed");
  assert.ok(f);
  assert.equal(f.level, "risky");
  assert.match(f.message, /listOrders → getOrders/);
});

test("requiring auth where none was required is breaking", async () => {
  const before = spec(ordersGet("schema: { type: object }")).replace(
    "      operationId: listOrders",
    "      operationId: listOrders\n      security: []",
  );
  const after = spec(ordersGet("schema: { type: object }")).replace(
    "      operationId: listOrders",
    "      operationId: listOrders\n      security: [{ bearer: [] }]",
  );
  const r = await run(before, after);
  const f = find(r.findings, "operation.security.added");
  assert.ok(f);
  assert.equal(f.level, "breaking");
});

/* -------------------------------------------------------------- parameters */

test("a new required query parameter is breaking; a new optional one is not", async () => {
  const before = spec(ordersGet("schema: { type: object }"));
  const required = spec(
    ordersGet("schema: { type: object }", `      parameters:
        - { name: since, in: query, required: true, schema: { type: string } }
`),
  );
  const optional = spec(
    ordersGet("schema: { type: object }", `      parameters:
        - { name: since, in: query, schema: { type: string } }
`),
  );
  const hard = await run(before, required);
  assert.equal(find(hard.findings, "parameter.required.added")?.level, "breaking");
  assert.equal(hard.verdict, "breaking");

  const soft = await run(before, optional);
  assert.equal(find(soft.findings, "parameter.optional.added")?.level, "compatible");
  assert.equal(soft.verdict, "compatible");
});

test("an optional parameter becoming required is breaking", async () => {
  const before = spec(
    ordersGet("schema: { type: object }", `      parameters:
        - { name: since, in: query, schema: { type: string } }
`),
  );
  const after = spec(
    ordersGet("schema: { type: object }", `      parameters:
        - { name: since, in: query, required: true, schema: { type: string } }
`),
  );
  const r = await run(before, after);
  assert.deepEqual(ids(r.findings), ["parameter.became-required"]);
  assert.equal(r.verdict, "breaking");
});

test("a required parameter becoming optional is compatible", async () => {
  const after = spec(
    ordersGet("schema: { type: object }", `      parameters:
        - { name: since, in: query, schema: { type: string } }
`),
  );
  const before = spec(
    ordersGet("schema: { type: object }", `      parameters:
        - { name: since, in: query, required: true, schema: { type: string } }
`),
  );
  const r = await run(before, after);
  assert.deepEqual(ids(r.findings), ["parameter.became-optional"]);
  assert.equal(r.verdict, "compatible");
});

test("path-level parameters are inherited, so moving one up is not a change", async () => {
  const inOperation = `openapi: 3.1.0
info: { title: Orders API, version: "1" }
paths:
  /v1/orders/{id}:
    get:
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
      responses:
        "200": { description: ok }
`;
  const inPathItem = `openapi: 3.1.0
info: { title: Orders API, version: "1" }
paths:
  /v1/orders/{id}:
    parameters:
      - { name: id, in: path, required: true, schema: { type: string } }
    get:
      responses:
        "200": { description: ok }
`;
  const r = await run(inOperation, inPathItem);
  assert.deepEqual(r.findings, []);
});

test("removing an enum value a query parameter accepted is breaking", async () => {
  const before = spec(
    ordersGet("schema: { type: object }", `      parameters:
        - name: status
          in: query
          schema: { type: string, enum: [open, paid, cancelled] }
`),
  );
  const after = spec(
    ordersGet("schema: { type: object }", `      parameters:
        - name: status
          in: query
          schema: { type: string, enum: [open, paid] }
`),
  );
  const r = await run(before, after);
  const f = find(r.findings, "request.enum.value-removed");
  assert.ok(f);
  assert.equal(f.level, "breaking");
  assert.equal(f.message, "Removed accepted value `cancelled` from `status`");
});

/* ------------------------------------------------------ request-side rules */

test("a new required request property is breaking; a new optional one is compatible", async () => {
  const before = spec(
    ordersPost(`schema:
  type: object
  required: [total_cents]
  properties:
    total_cents: { type: integer }`),
  );
  const withRequired = spec(
    ordersPost(`schema:
  type: object
  required: [total_cents, currency]
  properties:
    total_cents: { type: integer }
    currency: { type: string }`),
  );
  const withOptional = spec(
    ordersPost(`schema:
  type: object
  required: [total_cents]
  properties:
    total_cents: { type: integer }
    currency: { type: string }`),
  );
  const hard = await run(before, withRequired);
  assert.deepEqual(ids(hard.findings), ["request.property.added.required"]);
  assert.equal(hard.verdict, "breaking");

  const soft = await run(before, withOptional);
  assert.deepEqual(ids(soft.findings), ["request.property.added.optional"]);
  assert.equal(soft.verdict, "compatible");
});

test("an existing optional request property becoming required is breaking, reported once", async () => {
  const before = spec(
    ordersPost(`schema:
  type: object
  properties:
    currency: { type: string }`),
  );
  const after = spec(
    ordersPost(`schema:
  type: object
  required: [currency]
  properties:
    currency: { type: string }`),
  );
  const r = await run(before, after);
  assert.deepEqual(ids(r.findings), ["request.property.required.added"]);
});

test("request nullability: losing null is breaking, gaining it is free", async () => {
  const nullable = spec(
    ordersPost(`schema:
  type: object
  properties:
    note: { type: [string, "null"] }`),
  );
  const notNullable = spec(
    ordersPost(`schema:
  type: object
  properties:
    note: { type: string }`),
  );
  const tightened = await run(nullable, notNullable);
  assert.equal(find(tightened.findings, "request.nullable.removed")?.level, "breaking");
  const loosened = await run(notNullable, nullable);
  assert.equal(find(loosened.findings, "request.nullable.added")?.level, "compatible");
});

test("closing additionalProperties on a request body is breaking", async () => {
  const before = spec(
    ordersPost(`schema:
  type: object
  properties:
    note: { type: string }`),
  );
  const after = spec(
    ordersPost(`schema:
  type: object
  additionalProperties: false
  properties:
    note: { type: string }`),
  );
  const r = await run(before, after);
  assert.equal(find(r.findings, "request.additional-properties.closed")?.level, "breaking");
});

test("tightening a numeric bound on a request is breaking; loosening it is not", async () => {
  const loose = spec(
    ordersPost(`schema:
  type: object
  properties:
    quantity: { type: integer, maximum: 100 }`),
  );
  const tight = spec(
    ordersPost(`schema:
  type: object
  properties:
    quantity: { type: integer, maximum: 10 }`),
  );
  const tightened = await run(loose, tight);
  const f = find(tightened.findings, "request.constraint.tightened");
  assert.ok(f);
  assert.equal(f.level, "breaking");
  assert.match(f.message, /maximum on `quantity`: 100 → 10/);
  const loosened = await run(tight, loose);
  assert.equal(find(loosened.findings, "request.constraint.loosened")?.level, "compatible");
});

test("adding a pattern to a request field is breaking; changing one is risky and says why", async () => {
  const none = spec(
    ordersPost(`schema:
  type: object
  properties:
    reference: { type: string }`),
  );
  const added = spec(
    ordersPost(`schema:
  type: object
  properties:
    reference: { type: string, pattern: "^ord_" }`),
  );
  const changed = spec(
    ordersPost(`schema:
  type: object
  properties:
    reference: { type: string, pattern: "^ORD-" }`),
  );
  assert.equal(find((await run(none, added)).findings, "request.pattern.added")?.level, "breaking");
  const r = await run(added, changed);
  const f = find(r.findings, "request.pattern.changed");
  assert.ok(f);
  assert.equal(f.level, "risky");
  assert.match(f.why, /not comparable for containment/);
});

test("dropping an accepted request content type is breaking", async () => {
  const before = `openapi: 3.1.0
info: { title: Orders API, version: "1" }
paths:
  /v1/orders:
    post:
      requestBody:
        content:
          application/json: { schema: { type: object } }
          application/x-www-form-urlencoded: { schema: { type: object } }
      responses:
        "201": { description: ok }
`;
  const after = `openapi: 3.1.0
info: { title: Orders API, version: "1" }
paths:
  /v1/orders:
    post:
      requestBody:
        content:
          application/json: { schema: { type: object } }
      responses:
        "201": { description: ok }
`;
  const r = await run(before, after);
  const f = find(r.findings, "request.content-type.removed");
  assert.ok(f);
  assert.equal(f.level, "breaking");
  assert.match(f.message, /application\/x-www-form-urlencoded/);
});

test("a request body becoming required is breaking", async () => {
  const before = `openapi: 3.1.0
info: { title: Orders API, version: "1" }
paths:
  /v1/orders:
    post:
      requestBody:
        content: { application/json: { schema: { type: object } } }
      responses:
        "201": { description: ok }
`;
  const after = before.replace("      requestBody:", "      requestBody:\n        required: true");
  const r = await run(before, after);
  assert.deepEqual(ids(r.findings), ["request.body.became-required"]);
  assert.equal(r.verdict, "breaking");
});

/* ----------------------------------------------------- response-side rules */

test("a removed response field is breaking and carries its pointer and mini-diff", async () => {
  const before = spec(
    ordersGet(`schema:
  type: object
  required: [id, total_cents]
  properties:
    id: { type: string }
    total_cents: { type: integer }`),
  );
  const after = spec(
    ordersGet(`schema:
  type: object
  required: [id]
  properties:
    id: { type: string }`),
  );
  const r = await run(before, after);
  const f = find(r.findings, "response.property.removed");
  assert.ok(f);
  assert.equal(f.level, "breaking");
  assert.equal(f.message, "Removed response field `total_cents`");
  assert.equal(
    f.jsonPointer,
    "/paths/~1v1~1orders/get/responses/200/content/application~1json/schema/properties/total_cents",
  );
  assert.ok(f.diffLines.some((l) => l.kind === "del"), "the mini-diff should carry a removed line");
});

test("a response field losing its required guarantee is breaking", async () => {
  const before = spec(
    ordersGet(`schema:
  type: object
  required: [id, shipped_at]
  properties:
    id: { type: string }
    shipped_at: { type: string }`),
  );
  const after = spec(
    ordersGet(`schema:
  type: object
  required: [id]
  properties:
    id: { type: string }
    shipped_at: { type: string }`),
  );
  const r = await run(before, after);
  const f = find(r.findings, "response.property.required.removed");
  assert.ok(f);
  assert.equal(f.level, "breaking");
  assert.match(f.why, /intermittent break/);
});

test("a response field becoming nullable is breaking — the field name never moves", async () => {
  const before = spec(
    ordersGet(`schema:
  type: object
  properties:
    shipped_at: { type: string }`),
  );
  const after = spec(
    ordersGet(`schema:
  type: object
  properties:
    shipped_at: { type: [string, "null"] }`),
  );
  const r = await run(before, after);
  const f = find(r.findings, "response.nullable.added");
  assert.ok(f);
  assert.equal(f.level, "breaking");
  assert.equal(f.fieldPath, "shipped_at");
});

test("the flagship case: a removed response enum value is breaking, an added one is risky", async () => {
  const before = spec(
    ordersGet(`schema:
  type: object
  properties:
    status: { type: string, enum: [open, paid, cancelled] }`),
  );
  const removed = spec(
    ordersGet(`schema:
  type: object
  properties:
    status: { type: string, enum: [open, paid] }`),
  );
  const added = spec(
    ordersGet(`schema:
  type: object
  properties:
    status: { type: string, enum: [open, paid, cancelled, refunded] }`),
  );

  const gone = await run(before, removed);
  const g = find(gone.findings, "response.enum.value-removed");
  assert.ok(g);
  assert.equal(g.level, "breaking");
  assert.equal(g.message, "Removed enum value `cancelled` from `status`");
  assert.equal(gone.verdict, "breaking");

  const extra = await run(before, added);
  const e = find(extra.findings, "response.enum.value-added");
  assert.ok(e);
  assert.equal(e.level, "risky");
  assert.equal(extra.verdict, "risky");
});

test("response fields nested in arrays keep a usable field path", async () => {
  const before = spec(
    ordersGet(`schema:
  type: object
  properties:
    data:
      type: array
      items:
        type: object
        properties:
          status: { type: string, enum: [open, cancelled] }`),
  );
  const after = spec(
    ordersGet(`schema:
  type: object
  properties:
    data:
      type: array
      items:
        type: object
        properties:
          status: { type: string, enum: [open] }`),
  );
  const r = await run(before, after);
  const f = find(r.findings, "response.enum.value-removed");
  assert.ok(f);
  assert.equal(f.fieldPath, "data[].status");
});

test("a removed 2xx status is breaking; a removed 4xx is risky", async () => {
  const before = `openapi: 3.1.0
info: { title: Orders API, version: "1" }
paths:
  /v1/orders:
    get:
      responses:
        "200": { description: ok }
        "202": { description: queued }
        "429": { description: slow down }
`;
  const afterNo202 = before.replace('        "202": { description: queued }\n', "");
  const afterNo429 = before.replace('        "429": { description: slow down }\n', "");
  assert.equal(
    find((await run(before, afterNo202)).findings, "response.success-status.removed")?.level,
    "breaking",
  );
  assert.equal(
    find((await run(before, afterNo429)).findings, "response.error-status.removed")?.level,
    "risky",
  );
});

test("a new 2xx is risky, a new 4xx is compatible", async () => {
  const before = `openapi: 3.1.0
info: { title: Orders API, version: "1" }
paths:
  /v1/orders:
    get:
      responses:
        "200": { description: ok }
`;
  const with202 = before.replace(
    '        "200": { description: ok }',
    '        "200": { description: ok }\n        "202": { description: queued }',
  );
  const with404 = before.replace(
    '        "200": { description: ok }',
    '        "200": { description: ok }\n        "404": { description: gone }',
  );
  assert.equal(find((await run(before, with202)).findings, "response.success-status.added")?.level, "risky");
  assert.equal(find((await run(before, with404)).findings, "response.error-status.added")?.level, "compatible");
});

test("a removed response header is breaking — pagination cursors live there", async () => {
  const before = `openapi: 3.1.0
info: { title: Orders API, version: "1" }
paths:
  /v1/orders:
    get:
      responses:
        "200":
          description: ok
          headers:
            X-Next-Cursor: { schema: { type: string } }
`;
  const after = `openapi: 3.1.0
info: { title: Orders API, version: "1" }
paths:
  /v1/orders:
    get:
      responses:
        "200":
          description: ok
`;
  const r = await run(before, after);
  const f = find(r.findings, "response.header.removed");
  assert.ok(f);
  assert.equal(f.level, "breaking");
  assert.match(f.message, /X-Next-Cursor/);
});

test("a response field losing its enum is breaking; gaining one is compatible", async () => {
  const closed = spec(
    ordersGet(`schema:
  type: object
  properties:
    status: { type: string, enum: [open, paid] }`),
  );
  const open = spec(
    ordersGet(`schema:
  type: object
  properties:
    status: { type: string }`),
  );
  assert.equal(find((await run(closed, open)).findings, "response.enum.unconstrained")?.level, "breaking");
  assert.equal(find((await run(open, closed)).findings, "response.enum.constrained")?.level, "compatible");
});

test("the same widening is breaking on a response and free on a request", async () => {
  const narrowResponse = spec(
    ordersGet(`schema:
  type: object
  properties:
    id: { type: string }`),
  );
  const wideResponse = spec(
    ordersGet(`schema:
  type: object
  properties:
    id: { type: [string, integer] }`),
  );
  const narrowRequest = spec(
    ordersPost(`schema:
  type: object
  properties:
    id: { type: string }`),
  );
  const wideRequest = spec(
    ordersPost(`schema:
  type: object
  properties:
    id: { type: [string, integer] }`),
  );
  assert.equal(find((await run(narrowResponse, wideResponse)).findings, "response.type.widened")?.level, "breaking");
  assert.equal(find((await run(narrowRequest, wideRequest)).findings, "request.type.widened")?.level, "compatible");
});

/* ------------------------------------------------------------------ servers */

test("a removed server is risky — no schema changed, so a schema diff would miss it", async () => {
  const before = spec(ordersGet("schema: { type: object }"));
  const after = before.replace(
    'servers: [{ url: "https://api.example.com" }]',
    'servers: [{ url: "https://api.example.com/v2" }]',
  );
  const r = await run(before, after);
  assert.deepEqual(ids(r.findings), ["server.added", "server.removed"]);
  assert.equal(r.verdict, "risky");
});

/* ------------------------------------------------------------------ policy */

test("a policy override promotes additive response enum values to breaking", async () => {
  const before = spec(
    ordersGet(`schema:
  type: object
  properties:
    status: { type: string, enum: [open] }`),
  );
  const after = spec(
    ordersGet(`schema:
  type: object
  properties:
    status: { type: string, enum: [open, refunded] }`),
  );
  const lenient = await run(before, after);
  assert.equal(lenient.verdict, "risky");

  const strict = await run(before, after, {
    overrides: { "response.enum.value-added": "breaking" },
  });
  assert.equal(strict.verdict, "breaking");
  const f = find(strict.findings, "response.enum.value-added");
  assert.equal(f?.level, "breaking");
  assert.equal(f?.defaultLevel, "risky", "the default stays visible so the UI can say 'promoted by policy'");
});

test("a policy override can demote a rule the team has decided not to care about", async () => {
  const before = spec(ordersGet("schema: { type: object }")).replace("    get:", "    get:\n      deprecated: false");
  const after = spec(ordersGet("schema: { type: object }")).replace("    get:", "    get:\n      deprecated: true");
  const strict = await run(before, after);
  assert.equal(strict.verdict, "risky");
  const relaxed = await run(before, after, { overrides: { "operation.deprecated": "compatible" } });
  assert.equal(relaxed.verdict, "compatible");
});

test("ignore drops the finding entirely rather than demoting it", async () => {
  const before = spec(
    ordersGet(`schema:
  type: object
  properties:
    status: { type: string, enum: [open] }`),
  );
  const after = spec(
    ordersGet(`schema:
  type: object
  properties:
    status: { type: string, enum: [open, refunded] }`),
  );
  const r = await run(before, after, { overrides: { "response.enum.value-added": "ignore" } });
  assert.deepEqual(r.findings, []);
  assert.equal(r.verdict, "compatible");
});

test("failOn risky makes a risky verdict fail the check", async () => {
  const before = spec(ordersGet("schema: { type: object }"));
  const after = before.replace("      operationId: listOrders", "      operationId: listOrders\n      deprecated: true");
  const lenient = await run(before, after, { failOn: "breaking" });
  assert.equal(lenient.verdict, "risky");
  assert.equal(lenient.fails, false);
  const strict = await run(before, after, { failOn: "risky" });
  assert.equal(strict.fails, true);
});

test("an unknown rule id in a policy is ignored, not an error", async () => {
  const s = spec(ordersGet("schema: { type: object }"));
  const r = await run(s, s, { overrides: { "not.a.rule": "ignore" }, failOn: "nonsense" });
  assert.deepEqual(r.findings, []);
});

/* --------------------------------------------------------- corpus integrity */

test("every rule the walk can emit exists in the corpus with a filled template", () => {
  for (const rule of allRules()) {
    assert.ok(rule.template.length > 0, `${rule.id} needs a template`);
    assert.ok(rule.why.length > 20, `${rule.id} needs a real reason, not a stub`);
    assert.ok(
      ["breaking", "risky", "compatible", "info"].includes(rule.level),
      `${rule.id} has an invalid level`,
    );
  }
  assert.ok(allRules().length >= 40, "the corpus should cover the taxonomy, not a handful of cases");
  assert.equal(RULES.size, allRules().length, "rule ids must be unique");
});

test("no finding message or reason leaves an unfilled template slot", async () => {
  // A spec pair engineered to touch as many rules as one diff can.
  const before = `openapi: 3.1.0
info: { title: Kitchen Sink, version: "1" }
servers: [{ url: "https://a.example.com" }]
paths:
  /v1/orders:
    get:
      operationId: listOrders
      parameters:
        - { name: status, in: query, required: true, schema: { type: string, enum: [open, paid] } }
        - { name: cursor, in: query, schema: { type: string } }
      responses:
        "200":
          description: ok
          headers:
            X-Cursor: { schema: { type: string } }
          content:
            application/json:
              schema:
                type: object
                required: [id, status]
                properties:
                  id: { type: string }
                  status: { type: string, enum: [open, paid, cancelled] }
                  note: { type: string }
        "429": { description: slow }
    post:
      operationId: createOrder
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                quantity: { type: integer, maximum: 100 }
                reference: { type: string }
          text/csv: { schema: { type: string } }
      responses:
        "201": { description: created }
  /v1/refunds:
    get:
      responses:
        "200": { description: ok }
`;
  const after = `openapi: 3.1.0
info: { title: Kitchen Sink, version: "2" }
servers: [{ url: "https://b.example.com" }]
paths:
  /v1/orders:
    get:
      operationId: getOrders
      deprecated: true
      parameters:
        - { name: status, in: query, schema: { type: string, enum: [open] } }
        - { name: limit, in: query, required: true, schema: { type: integer } }
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                type: object
                required: [id]
                properties:
                  id: { type: [string, "null"] }
                  status: { type: string, enum: [open, paid, refunded] }
        "202": { description: queued }
    post:
      operationId: createOrder
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              additionalProperties: false
              required: [quantity]
              properties:
                quantity: { type: integer, maximum: 10 }
                reference: { type: string, pattern: "^ord_" }
      responses:
        "201": { description: created }
  /v1/webhooks:
    post:
      responses:
        "204": { description: ok }
`;
  const r = await run(before, after);
  assert.ok(r.findings.length > 15, `expected a broad diff, got ${r.findings.length}`);
  for (const f of r.findings) {
    assert.doesNotMatch(f.message, /\{\w+\}/, `unfilled slot in ${f.ruleId}: ${f.message}`);
    assert.doesNotMatch(f.why, /\{\w+\}/, `unfilled slot in ${f.ruleId} reason`);
    assert.ok(f.jsonPointer.startsWith("/"), `${f.ruleId} pointer must be an RFC 6901 pointer`);
  }
  assert.equal(r.verdict, "breaking");

  // Findings arrive breaking → risky → compatible so the UI can render in order.
  const order = ["breaking", "risky", "compatible", "info"];
  let last = 0;
  for (const f of r.findings) {
    const idx = order.indexOf(f.level);
    assert.ok(idx >= last, "findings must be sorted by level");
    last = idx;
  }
});

test("the diff is deterministic: the same pair twice gives byte-identical findings", async () => {
  const before = spec(
    ordersGet(`schema:
  type: object
  properties:
    a: { type: string }
    b: { type: string }
    c: { type: string }`),
  );
  const after = spec(
    ordersGet(`schema:
  type: object
  properties:
    a: { type: integer }`),
  );
  const one = await run(before, after);
  const two = await run(before, after);
  assert.equal(JSON.stringify(one.findings), JSON.stringify(two.findings));
});

test("a 2MB spec diffs in well under three seconds", async () => {
  const props = Array.from({ length: 400 }, (_, i) => `    field_${i}: { type: string, description: "${"x".repeat(200)}" }`).join("\n");
  const paths = Array.from(
    { length: 40 },
    (_, i) => `  /v1/resource${i}:
    get:
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                type: object
                properties:
${props}
`,
  ).join("");
  const before = spec(paths);
  const after = before.replace(/field_0: \{ type: string/g, "field_0: { type: integer");
  assert.ok(before.length > 1_500_000, `fixture should be large, was ${before.length}`);
  const started = Date.now();
  const r = await run(before, after);
  const elapsed = Date.now() - started;
  assert.equal(r.summary.breaking, 40);
  assert.ok(elapsed < 3000, `diff took ${elapsed}ms`);
});
