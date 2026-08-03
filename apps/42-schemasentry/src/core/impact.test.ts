import { test } from "node:test";
import assert from "node:assert/strict";
import { diffRaw } from "./index";
import {
  computeImpact,
  fieldMatches,
  impactedNamesForFinding,
  normalizeUsage,
  usageSummary,
  type ConsumerRecord,
} from "./impact";

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
                required: [id, status]
                properties:
                  id: { type: string }
                  status: { type: string, enum: [open, paid, cancelled] }
                  invoice_url: { type: string }
  /v1/refunds:
    get:
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                type: object
                properties:
                  amount_cents: { type: integer }
`;

const after = before
  .replace("enum: [open, paid, cancelled]", "enum: [open, paid]")
  .replace("                  invoice_url: { type: string }\n", "");

function consumer(name: string, usage: Partial<Parameters<typeof normalizeUsage>[0]> | object): ConsumerRecord {
  return { id: name.toLowerCase().replace(/\s+/g, "-"), name, declaredUsage: normalizeUsage(usage) };
}

test("field paths match on a suffix, in both directions", () => {
  assert.equal(fieldMatches("status", "data.items.status"), true);
  assert.equal(fieldMatches("order.status", "data.order.status"), true);
  assert.equal(fieldMatches("items[].total_cents", "items.total_cents"), true);
  assert.equal(fieldMatches("customer.status", "items.status"), false);
  assert.equal(fieldMatches("", "status"), false);
});

test("the flagship sentence: names the consumer whose declared field lost a value", async () => {
  const r = await diffRaw(before, after, undefined, [
    consumer("Acme webhooks", {
      endpoints: ["GET /v1/orders"],
      fields: ["status"],
      enumValues: ["cancelled"],
    }),
    consumer("Billing exporter", { endpoints: ["GET /v1/refunds"], fields: ["amount_cents"] }),
  ]);

  const acme = r.impacts.find((i) => i.name === "Acme webhooks")!;
  assert.equal(acme.impacted, true);
  assert.equal(acme.worst, "breaking");
  const enumHit = acme.details.find((d) => d.ruleId === "response.enum.value-removed")!;
  assert.ok(enumHit, "the removed enum value should be attributed to Acme");
  assert.match(enumHit.reason, /declares `status` on GET \/v1\/orders/);
  assert.match(enumHit.reason, /branches on `cancelled`/);

  const billing = r.impacts.find((i) => i.name === "Billing exporter")!;
  assert.equal(billing.impacted, false, "a consumer of a different endpoint is not impacted");
  assert.deepEqual(billing.details, []);
});

test("a consumer with nothing declared is never reported as impacted", async () => {
  const r = await diffRaw(before, after, undefined, [consumer("Unknown partner", {})]);
  const only = r.impacts[0];
  assert.equal(only.impacted, false);
  assert.equal(only.undeclared, true);
  assert.deepEqual(only.details, []);
});

test("a consumer who declared endpoints but no fields is impacted by the endpoint, and the reason says so", async () => {
  const r = await diffRaw(before, after, undefined, [
    consumer("iOS app", { endpoints: ["GET /v1/orders"] }),
  ]);
  const ios = r.impacts[0];
  assert.equal(ios.impacted, true);
  assert.ok(ios.details.every((d) => /calls GET \/v1\/orders/.test(d.reason)));
});

test("declaring only the endpoint's path without a method does not match", async () => {
  const r = await diffRaw(before, after, undefined, [
    consumer("Sloppy declaration", { endpoints: ["/v1/orders"], fields: ["status"] }),
  ]);
  // The field still matches (declared without a usable endpoint), but the
  // endpoint claim is dropped rather than guessed.
  const impact = r.impacts[0];
  assert.ok(impact.details.every((d) => !/calls/.test(d.reason)));
});

test("compatible findings never mark a consumer impacted", async () => {
  const additive = before.replace("enum: [open, paid, cancelled]", "enum: [open, paid, cancelled]").replace(
    "                  invoice_url: { type: string }",
    "                  invoice_url: { type: string }\n                  receipt_url: { type: string }",
  );
  const r = await diffRaw(before, additive, undefined, [
    consumer("Acme webhooks", { endpoints: ["GET /v1/orders"], fields: ["receipt_url"] }),
  ]);
  assert.equal(r.verdict, "compatible");
  const acme = r.impacts[0];
  assert.equal(acme.impacted, false);
  assert.equal(acme.worst, "compatible", "the match is recorded, it just is not blast radius");
});

test("the finding card's impact row lists only breaking and risky consumers", async () => {
  const r = await diffRaw(before, after, undefined, [
    consumer("Acme webhooks", { endpoints: ["GET /v1/orders"], fields: ["status"] }),
    consumer("iOS app", { endpoints: ["GET /v1/orders"], fields: ["invoice_url"] }),
    consumer("Billing exporter", { endpoints: ["GET /v1/refunds"] }),
  ]);
  const removedField = r.findings.findIndex((f) => f.ruleId === "response.property.removed");
  assert.ok(removedField >= 0);
  assert.deepEqual(impactedNamesForFinding(r.impacts, removedField), ["iOS app"]);
});

test("a removed server reaches every consumer with a declared endpoint", async () => {
  const withServer = `openapi: 3.1.0
info: { title: Orders API, version: "1" }
servers: [{ url: "https://api.example.com" }]
paths:
  /v1/orders:
    get:
      responses:
        "200": { description: ok }
`;
  const moved = withServer.replace("https://api.example.com", "https://api.example.com/v2");
  const r = await diffRaw(withServer, moved, undefined, [
    consumer("Acme webhooks", { endpoints: ["GET /v1/orders"] }),
    consumer("Unknown partner", {}),
  ]);
  const acme = r.impacts.find((i) => i.name === "Acme webhooks")!;
  assert.equal(acme.impacted, true);
  assert.ok(acme.details.some((d) => d.reason.includes("declared servers")));
  assert.equal(r.impacts.find((i) => i.name === "Unknown partner")!.impacted, false);
});

test("usage summary reads as the mono count on the consumer row", () => {
  assert.equal(
    usageSummary(normalizeUsage({ endpoints: ["GET /a"], fields: ["a", "b"], enumValues: [] })),
    "1 ENDPOINT · 2 FIELDS",
  );
  assert.equal(
    usageSummary(normalizeUsage({ endpoints: ["GET /a", "GET /b"], fields: [], enumValues: ["x"] })),
    "2 ENDPOINTS · 0 FIELDS · 1 VALUE",
  );
});

test("usage normalization trims, dedupes and sorts, and survives garbage", () => {
  const u = normalizeUsage({ endpoints: [" GET /a ", "GET /a", 7], fields: ["b", "a", ""], enumValues: null });
  assert.deepEqual(u.endpoints, ["GET /a"]);
  assert.deepEqual(u.fields, ["a", "b"]);
  assert.deepEqual(u.enumValues, []);
  assert.deepEqual(normalizeUsage("nonsense"), { endpoints: [], fields: [], enumValues: [] });
});

test("computeImpact on an empty registry is an empty list, not a crash", () => {
  assert.deepEqual(computeImpact([], []), []);
});
