import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertSupportedVersion,
  canonicalize,
  healthVerdict,
  parseSpec,
  SpecParseError,
} from "./canonicalize";

const minimal = (paths: string) => `
openapi: 3.0.3
info:
  title: Orders API
  version: "1.0.0"
paths:
${paths}
`;

test("parses YAML and JSON alike", () => {
  const yaml = parseSpec("openapi: 3.0.3\ninfo:\n  title: A\n");
  const json = parseSpec('{"openapi":"3.0.3","info":{"title":"A"}}');
  assert.equal(yaml.openapi, "3.0.3");
  assert.equal(json.openapi, "3.0.3");
});

test("rejects an empty file with a readable reason", () => {
  assert.throws(() => parseSpec("   \n"), (err: unknown) => {
    assert.ok(err instanceof SpecParseError);
    assert.match((err as Error).message, /empty/);
    return true;
  });
});

test("rejects Swagger 2.0 by name instead of half-diffing it", () => {
  assert.throws(
    () => assertSupportedVersion({ swagger: "2.0" }),
    /Swagger 2\.0 is not supported/,
  );
});

test("rejects OpenAPI 4 rather than guessing", () => {
  assert.throws(() => assertSupportedVersion({ openapi: "4.0.0" }), /not supported/);
});

test("dereferences internal $refs so shapes, not pointers, are compared", async () => {
  const raw = `
openapi: 3.1.0
info: { title: Orders API, version: "1" }
paths:
  /orders:
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
      properties:
        id: { type: string }
`;
  const { doc } = await canonicalize(raw);
  const schema = (doc as never as Record<string, never>)["paths"] as unknown as Record<string, never>;
  const inlined = JSON.stringify(schema);
  assert.ok(inlined.includes('"id"'), "the referenced schema should be inlined");
  assert.equal((doc as Record<string, unknown>).components, undefined, "components is dropped once inlined");
});

test("a circular $ref becomes a marker, not a stack overflow", async () => {
  const raw = `
openapi: 3.1.0
info: { title: Threads, version: "1" }
paths:
  /comments:
    get:
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Comment" }
components:
  schemas:
    Comment:
      type: object
      properties:
        body: { type: string }
        replies:
          type: array
          items: { $ref: "#/components/schemas/Comment" }
`;
  const { doc } = await canonicalize(raw);
  assert.match(JSON.stringify(doc), /x-circular-ref/);
});

test("an external $ref is a warning, never a network call", async () => {
  const raw = `
openapi: 3.0.3
info: { title: Orders, version: "1" }
paths:
  /orders:
    get:
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema: { $ref: "https://example.com/shared.yaml#/Order" }
`;
  const { health } = await canonicalize(raw);
  assert.ok(health.warnings.some((w) => w.includes("External $ref")));
});

test("a dangling $ref is reported instead of silently dropping the schema", async () => {
  const raw = `
openapi: 3.0.3
info: { title: Orders, version: "1" }
paths:
  /orders:
    get:
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Nope" }
`;
  const { health } = await canonicalize(raw);
  assert.ok(health.warnings.some((w) => w.includes("Dangling $ref")));
});

test("3.0 nullable and 3.1 type unions canonicalize identically", async () => {
  const v30 = await canonicalize(`
openapi: 3.0.3
info: { title: Orders, version: "1" }
paths:
  /orders:
    get:
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                type: object
                properties:
                  note: { type: string, nullable: true }
`);
  const v31 = await canonicalize(`
openapi: 3.1.0
info: { title: Orders, version: "1" }
paths:
  /orders:
    get:
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                type: object
                properties:
                  note: { type: [string, "null"] }
`);
  const strip = (d: unknown) => {
    const clone = JSON.parse(JSON.stringify(d)) as Record<string, unknown>;
    delete clone.openapi;
    return JSON.stringify(clone);
  };
  assert.equal(strip(v30.doc), strip(v31.doc));
});

test("key order and enum order are not semantic", async () => {
  const a = await canonicalize(
    minimal(`  /orders:
    get:
      summary: List
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                type: string
                enum: [open, paid, cancelled]
`),
  );
  const b = await canonicalize(
    minimal(`  /orders:
    get:
      responses:
        "200":
          content:
            application/json:
              schema:
                enum: [cancelled, paid, open]
                type: string
          description: ok
      summary: List
`),
  );
  assert.equal(JSON.stringify(a.doc), JSON.stringify(b.doc));
});

test("a semantics-preserving allOf is merged into one object schema", async () => {
  const { doc } = await canonicalize(`
openapi: 3.1.0
info: { title: Orders, version: "1" }
paths:
  /orders:
    get:
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    required: [id]
                    properties: { id: { type: string } }
                  - type: object
                    required: [total]
                    properties: { total: { type: integer } }
`);
  const at = (root: unknown, path: string[]): Record<string, unknown> =>
    path.reduce<Record<string, unknown>>(
      (node, key) => node[key] as Record<string, unknown>,
      root as Record<string, unknown>,
    );
  const merged = at(doc, [
    "paths",
    "/orders",
    "get",
    "responses",
    "200",
    "content",
    "application/json",
    "schema",
  ]) as { type: string; required: string[]; properties: Record<string, unknown>; allOf?: unknown };
  assert.equal(merged.allOf, undefined);
  assert.deepEqual(merged.required, ["id", "total"]);
  assert.deepEqual(Object.keys(merged.properties).sort(), ["id", "total"]);
});

test("an allOf with a discriminator is left alone", async () => {
  const { doc } = await canonicalize(`
openapi: 3.1.0
info: { title: Orders, version: "1" }
paths:
  /orders:
    get:
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                discriminator: { propertyName: kind }
                allOf:
                  - type: object
                    properties: { kind: { type: string } }
`);
  assert.match(JSON.stringify(doc), /allOf/);
});

test("spec health scores response coverage and names the gaps", async () => {
  const { health } = await canonicalize(
    minimal(`  /orders:
    get:
      summary: List orders
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema: { type: array, items: { type: string } }
  /orders/{id}:
    delete:
      responses:
        "204": { description: gone }
`),
  );
  assert.equal(health.operations, 2);
  assert.equal(health.documentedResponses, 1);
  assert.equal(healthVerdict(health).label, "THIN");
});

test("a spec with no operations is UNUSABLE, and says so", async () => {
  const { health } = await canonicalize(`
openapi: 3.0.3
info: { title: Empty, version: "1" }
paths: {}
`);
  assert.equal(health.score, 0);
  assert.equal(healthVerdict(health).label, "UNUSABLE");
  assert.ok(health.warnings.some((w) => w.includes("no operations")));
});

test("a request body with no schema is called out as a blind spot", async () => {
  const { health } = await canonicalize(
    minimal(`  /orders:
    post:
      requestBody:
        content:
          application/json: {}
      responses:
        "201": { description: created }
`),
  );
  assert.equal(health.schemalessBodies, 1);
  assert.ok(health.warnings.some((w) => w.includes("request body with no schema")));
});
