/**
 * src/core/contract-tests.ts
 *
 * Contract-suite generation: emit a runnable Vitest/Jest suite asserting the
 * shapes consumers depend on — status codes, required fields, enum membership,
 * nullability, types — phrased from the consumer's point of view.
 *
 * The generated file is deliberately dependency-free (global `fetch`, one tiny
 * `at()` helper) so a customer can drop it into their repo and run it under
 * either runner without adding supertest or a mock server. It reads its target
 * from `API_BASE_URL`, which means the same file runs against staging, a local
 * server, or a recorded mock.
 *
 * Two things beyond generation matter, and both are why this is a product
 * rather than a template:
 *
 *  - **Drift.** Regenerating must not silently overwrite a suite an engineer
 *    has customized, so `detectDrift` compares assertion *identities* between
 *    the stored suite and a fresh generation and reports what moved.
 *  - **Staleness.** When a diff lands, `staleAssertions` names the exact
 *    assertions that would now fail — the "run this before your consumers do"
 *    artifact.
 */

import { HTTP_METHODS, isObject, type Json, type JsonObject } from "./canonicalize";
import { fieldMatches, type DeclaredUsage } from "./impact";
import type { Finding } from "./rules";

export type Framework = "vitest" | "jest";

export interface SuiteOptions {
  framework: Framework;
  apiName: string;
  /** The deploy this suite was generated from, e.g. `4d81e07`. */
  deployLabel: string;
  /** When present, the suite is scoped to what this consumer declared. */
  consumerName?: string;
  declaredUsage?: DeclaredUsage;
}

export type AssertionKind = "status" | "required" | "enum" | "type" | "nullable";

export interface AssertionRef {
  /** Stable identity across regenerations: kind + endpoint + field. */
  id: string;
  kind: AssertionKind;
  method: string;
  endpoint: string;
  status: string;
  fieldPath: string | null;
  description: string;
}

export interface GeneratedSuite {
  filename: string;
  source: string;
  assertions: AssertionRef[];
}

/* ---------------------------------------------------------------- utilities */

const q = (s: string) => JSON.stringify(s);

/** A sample path for a templated route: `/v1/orders/{id}` → `/v1/orders/1`. */
function samplePath(path: string): string {
  return path.replace(/\{[^}]+\}/g, "1");
}

function firstSuccessResponse(op: JsonObject): { status: string; schema: JsonObject } | null {
  const responses = isObject(op.responses) ? op.responses : {};
  const codes = Object.keys(responses)
    .filter((c) => /^2\d\d$/.test(c))
    .sort();
  for (const code of codes) {
    const res = responses[code];
    if (!isObject(res)) continue;
    const content = isObject(res.content) ? res.content : {};
    const json = content["application/json"] ?? Object.values(content)[0];
    if (isObject(json) && isObject(json.schema)) return { status: code, schema: json.schema };
  }
  if (codes.length > 0) {
    const res = responses[codes[0]];
    if (isObject(res)) return { status: codes[0], schema: {} };
  }
  return null;
}

function typeNames(schema: JsonObject): string[] {
  const t = schema.type;
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}

/* ------------------------------------------------------------ the generator */

interface Emitted {
  ref: AssertionRef;
  /** One line of test body. */
  line: string;
}

function walkSchema(
  schema: JsonObject,
  ctx: { method: string; endpoint: string; status: string; fieldPath: string | null; declared?: DeclaredUsage },
  out: Emitted[],
  depth = 0,
): void {
  if (depth > 4) return;

  const wanted = (fieldPath: string): boolean => {
    const declared = ctx.declared;
    if (!declared || declared.fields.length === 0) return true;
    return declared.fields.some((d) => fieldMatches(d, fieldPath));
  };

  const accessor = ctx.fieldPath === null ? "body" : `at(body, ${q(ctx.fieldPath)})`;

  const types = typeNames(schema);
  if (ctx.fieldPath !== null && types.length > 0 && wanted(ctx.fieldPath)) {
    const nullable = types.includes("null");
    const core = types.filter((t) => t !== "null");
    if (core.length === 1) {
      out.push({
        ref: {
          id: `type:${ctx.method} ${ctx.endpoint}:${ctx.fieldPath}`,
          kind: nullable ? "nullable" : "type",
          method: ctx.method,
          endpoint: ctx.endpoint,
          status: ctx.status,
          fieldPath: ctx.fieldPath,
          description: nullable
            ? `\`${ctx.fieldPath}\` is ${core[0]} or null`
            : `\`${ctx.fieldPath}\` is a ${core[0]}`,
        },
        line: nullable
          ? `    expectType(${accessor}, ${q(core[0])}, true, ${q(ctx.fieldPath)});`
          : `    expectType(${accessor}, ${q(core[0])}, false, ${q(ctx.fieldPath)});`,
      });
    }
  }

  if (Array.isArray(schema.enum) && ctx.fieldPath !== null && wanted(ctx.fieldPath)) {
    const values = schema.enum.filter((v): v is string | number => typeof v === "string" || typeof v === "number");
    if (values.length > 0) {
      out.push({
        ref: {
          id: `enum:${ctx.method} ${ctx.endpoint}:${ctx.fieldPath}`,
          kind: "enum",
          method: ctx.method,
          endpoint: ctx.endpoint,
          status: ctx.status,
          fieldPath: ctx.fieldPath,
          description: `\`${ctx.fieldPath}\` is one of ${values.map(String).join(", ")}`,
        },
        line: `    expectOneOf(${accessor}, ${JSON.stringify(values)}, ${q(ctx.fieldPath)});`,
      });
    }
  }

  const props = isObject(schema.properties) ? schema.properties : null;
  const required = new Set(
    Array.isArray(schema.required) ? schema.required.filter((r): r is string => typeof r === "string") : [],
  );

  if (props) {
    for (const name of Object.keys(props).sort()) {
      const child = props[name];
      if (!isObject(child)) continue;
      const childPath = ctx.fieldPath === null ? name : `${ctx.fieldPath}.${name}`;
      if (required.has(name) && wanted(childPath)) {
        out.push({
          ref: {
            id: `required:${ctx.method} ${ctx.endpoint}:${childPath}`,
            kind: "required",
            method: ctx.method,
            endpoint: ctx.endpoint,
            status: ctx.status,
            fieldPath: childPath,
            description: `\`${childPath}\` is always present`,
          },
          line: `    expectPresent(body, ${q(childPath)});`,
        });
      }
      walkSchema(child, { ...ctx, fieldPath: childPath }, out, depth + 1);
    }
  }

  const items = schema.items;
  if (isObject(items)) {
    const childPath = ctx.fieldPath === null ? "[0]" : `${ctx.fieldPath}.0`;
    walkSchema(items, { ...ctx, fieldPath: childPath }, out, depth + 1);
  }
}

const PRELUDE = (framework: Framework) => `import { describe, it, expect } from ${q(framework)};

/**
 * Generated by SchemaSentry. Edit freely — regeneration reports drift instead
 * of overwriting your changes.
 *
 * Point it at a running API:  API_BASE_URL=https://staging.example.com npx ${framework} run
 */
const BASE = process.env.API_BASE_URL ?? "http://localhost:8080";

async function call(method: string, path: string) {
  const res = await fetch(new URL(path, BASE), {
    method,
    headers: {
      accept: "application/json",
      ...(process.env.API_TOKEN ? { authorization: \`Bearer \${process.env.API_TOKEN}\` } : {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

/** Read a dotted path. Numeric segments index into arrays. */
function at(root: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, seg) => {
    if (node === null || node === undefined) return undefined;
    if (Array.isArray(node)) return node[Number(seg)];
    if (typeof node === "object") return (node as Record<string, unknown>)[seg];
    return undefined;
  }, root);
}

function jsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function expectPresent(root: unknown, path: string) {
  expect(at(root, path), \`\${path} must be present\`).not.toBeUndefined();
}

function expectType(value: unknown, type: string, nullable: boolean, path: string) {
  if (value === undefined) return; // presence is asserted separately
  if (nullable && value === null) return;
  const actual = jsonType(value);
  const ok = actual === type || (type === "number" && actual === "integer");
  expect(ok, \`\${path} should be \${type}\${nullable ? " or null" : ""}, got \${actual}\`).toBe(true);
}

function expectOneOf(value: unknown, allowed: Array<string | number>, path: string) {
  if (value === undefined || value === null) return;
  expect(allowed, \`\${path} returned \${String(value)}, which is not in the declared enum\`).toContain(
    value as string | number,
  );
}
`;

/**
 * Emit a runnable suite for one deploy's canonical document, optionally scoped
 * to a single consumer's declared usage.
 */
export function generateSuite(doc: JsonObject, options: SuiteOptions): GeneratedSuite {
  const declared = options.declaredUsage;
  const paths = isObject(doc.paths) ? doc.paths : {};
  const blocks: string[] = [];
  const assertions: AssertionRef[] = [];

  const wantedEndpoint = (method: string, path: string): boolean => {
    if (!declared || declared.endpoints.length === 0) return true;
    return declared.endpoints.some((e) => {
      const m = /^\s*([A-Za-z]+)\s+(\/\S*)\s*$/.exec(e);
      return m !== null && m[1].toUpperCase() === method && m[2] === path;
    });
  };

  for (const path of Object.keys(paths).sort()) {
    const item = paths[path];
    if (!isObject(item)) continue;
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!isObject(op)) continue;
      const M = method.toUpperCase();
      if (!wantedEndpoint(M, path)) continue;
      // Only read-only operations are safe to call unattended.
      if (M !== "GET" && M !== "HEAD") continue;

      const success = firstSuccessResponse(op);
      if (!success) continue;

      const emitted: Emitted[] = [];
      walkSchema(success.schema, { method: M, endpoint: path, status: success.status, fieldPath: null, declared }, emitted);

      const statusRef: AssertionRef = {
        id: `status:${M} ${path}:${success.status}`,
        kind: "status",
        method: M,
        endpoint: path,
        status: success.status,
        fieldPath: null,
        description: `responds ${success.status}`,
      };

      const seen = new Set<string>();
      const lines: string[] = [];
      for (const e of emitted) {
        if (seen.has(e.ref.id)) continue;
        seen.add(e.ref.id);
        assertions.push(e.ref);
        lines.push(e.line);
      }
      assertions.push(statusRef);

      const who = options.consumerName ? `${options.consumerName} depends on` : "consumers depend on";
      blocks.push(
        [
          `describe(${q(`${M} ${path}`)}, () => {`,
          `  it(${q(`returns ${success.status} with the shape ${who}`)}, async () => {`,
          `    const res = await call(${q(M)}, ${q(samplePath(path))});`,
          `    expect(res.status).toBe(${Number(success.status)});`,
          `    const body = res.body;`,
          ...(lines.length > 0 ? lines : ["    expect(body).not.toBeUndefined();"]),
          `  });`,
          `});`,
        ].join("\n"),
      );
    }
  }

  const header = [
    `/*`,
    ` * ${options.apiName} contract suite`,
    options.consumerName ? ` * Consumer: ${options.consumerName}` : ` * Scope: every documented GET response`,
    ` * Generated from deploy ${options.deployLabel}`,
    ` * Assertions: ${assertions.length}`,
    ` */`,
    ``,
  ].join("\n");

  const body =
    blocks.length > 0
      ? blocks.join("\n\n")
      : [
          `describe(${q(options.apiName)}, () => {`,
          `  it("has no unattended-testable GET responses declared yet", () => {`,
          `    // SchemaSentry generates assertions from documented GET responses.`,
          `    // Add response schemas to the spec and regenerate.`,
          `    expect(true).toBe(true);`,
          `  });`,
          `});`,
        ].join("\n");

  const slug = (options.consumerName ?? options.apiName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return {
    filename: `${slug || "api"}.contract.test.ts`,
    source: `${header}${PRELUDE(options.framework)}\n${body}\n`,
    assertions,
  };
}

/* ------------------------------------------------------------------- drift */

export interface Drift {
  added: AssertionRef[];
  removed: AssertionRef[];
  unchanged: number;
}

/**
 * Compare a stored suite's assertions against a fresh generation. Regeneration
 * never overwrites: it reports what a human would have to reconcile.
 */
export function detectDrift(stored: AssertionRef[], fresh: AssertionRef[]): Drift {
  const storedIds = new Map(stored.map((a) => [a.id, a]));
  const freshIds = new Map(fresh.map((a) => [a.id, a]));
  const added = fresh.filter((a) => !storedIds.has(a.id));
  const removed = stored.filter((a) => !freshIds.has(a.id));
  const unchanged = fresh.length - added.length;
  return { added, removed, unchanged };
}

export interface StaleAssertion {
  assertion: AssertionRef;
  finding: Finding;
}

/**
 * Which assertions in a suite would fail if this diff shipped. Matched on
 * endpoint + method, then narrowed by field when both sides name one.
 */
export function staleAssertions(assertions: AssertionRef[], findings: Finding[]): StaleAssertion[] {
  const out: StaleAssertion[] = [];
  for (const assertion of assertions) {
    for (const finding of findings) {
      if (finding.level !== "breaking" && finding.level !== "risky") continue;
      if (finding.side === "request") continue; // request-side changes do not fail a read assertion
      if (finding.endpoint !== null) {
        if (finding.endpoint !== assertion.endpoint) continue;
        if ((finding.method ?? "").toUpperCase() !== assertion.method) continue;
      }
      if (finding.fieldPath && assertion.fieldPath) {
        if (!fieldMatches(finding.fieldPath, assertion.fieldPath)) continue;
      } else if (finding.fieldPath && !assertion.fieldPath) {
        // A field-level change cannot fail the status-code assertion.
        if (assertion.kind === "status") continue;
      }
      out.push({ assertion, finding });
      break;
    }
  }
  return out;
}

/** Serialize the assertion list for storage beside the suite source. */
export function assertionsToJson(assertions: AssertionRef[]): Json {
  return assertions.map((a) => ({ ...a })) as unknown as Json;
}

export function assertionsFromJson(raw: unknown): AssertionRef[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((a): a is AssertionRef => {
    if (!isObject(a as Json)) return false;
    const o = a as Record<string, unknown>;
    return typeof o.id === "string" && typeof o.endpoint === "string" && typeof o.method === "string";
  });
}
