/**
 * src/core/canonicalize.ts
 *
 * Spec canonicalization: YAML/JSON in, a normalized OpenAPI document out —
 * the precondition for meaningful diffs. Part of the OSS engine core.
 *
 * Three jobs, in order:
 *
 *  1. **Parse** YAML or JSON and check it is an OpenAPI 3.0.x / 3.1.x
 *     document. A 2.0 (Swagger) file is rejected with a reason, not silently
 *     half-diffed.
 *  2. **Dereference** internal `$ref`s so the diff walk compares shapes, not
 *     pointers — a spec that renames `#/components/schemas/Order` to
 *     `.../OrderV2` without changing a field has broken nobody, and a
 *     pointer-level diff would scream. Cycles become an
 *     `{ "x-circular-ref": "<pointer>" }` marker instead of exploding.
 *  3. **Normalize** so cosmetic edits produce zero findings: keys sorted,
 *     3.0's `nullable: true` expressed as 3.1's type union, single-element
 *     `type` arrays collapsed, semantics-preserving `allOf` merged, `required`
 *     and `enum` de-duplicated and sorted.
 *
 * `$ref` resolution is deliberately **local-only** — no `json-schema-ref-parser`,
 * no network. Fetching a URL named inside untrusted customer input from the
 * ingest path is an SSRF hole, and the diff engine has no business making
 * network calls. A remote `$ref` becomes a spec-health warning telling the
 * user to bundle the spec first.
 */

import YAML from "yaml";

/** A JSON value, which is all an OpenAPI document ever is once parsed. */
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type JsonObject = { [k: string]: Json };

export interface SpecHealth {
  /** 0-100. How much of the document is diffable at all. */
  score: number;
  warnings: string[];
  /** Operation count — shown verbatim on the timeline row. */
  operations: number;
  /** Operations with at least one response carrying a schema. */
  documentedResponses: number;
  /** Operations whose request body has no schema — a blind spot for diffs. */
  schemalessBodies: number;
}

export class SpecParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpecParseError";
  }
}

export const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export const isObject = (v: unknown): v is JsonObject =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/* ------------------------------------------------------------------ parse */

/** Parse YAML or JSON. YAML is a superset of JSON, so one parser covers both. */
export function parseSpec(raw: string): JsonObject {
  if (!raw || !raw.trim()) throw new SpecParseError("The spec file is empty.");
  let parsed: unknown;
  try {
    parsed = YAML.parse(raw, { merge: true });
  } catch (err) {
    const detail = err instanceof Error ? err.message.split("\n")[0] : String(err);
    throw new SpecParseError(`Could not parse the spec as YAML or JSON: ${detail}`);
  }
  if (!isObject(parsed)) {
    throw new SpecParseError("The spec must be a YAML mapping or JSON object at the top level.");
  }
  return parsed;
}

/** Assert the document is an OpenAPI version this engine understands. */
export function assertSupportedVersion(doc: JsonObject): string {
  if (typeof doc.swagger === "string") {
    throw new SpecParseError(
      `Swagger ${doc.swagger} is not supported. Convert to OpenAPI 3.0 or 3.1 first (swagger2openapi does this).`,
    );
  }
  const version = doc.openapi;
  if (typeof version !== "string") {
    throw new SpecParseError(
      'Missing the top-level "openapi" version string — is this an OpenAPI document?',
    );
  }
  if (!/^3\.(0|1)(\.\d+)?$/.test(version)) {
    throw new SpecParseError(`OpenAPI ${version} is not supported. This engine reads 3.0.x and 3.1.x.`);
  }
  return version;
}

/* ------------------------------------------------------------- dereference */

function resolvePointer(root: JsonObject, pointer: string): Json | undefined {
  const parts = pointer
    .replace(/^#\/?/, "")
    .split("/")
    .filter((p) => p.length > 0)
    .map((p) => decodeURIComponent(p).replace(/~1/g, "/").replace(/~0/g, "~"));
  let node: Json = root;
  for (const part of parts) {
    if (Array.isArray(node)) {
      const idx = Number(part);
      if (!Number.isInteger(idx) || idx < 0 || idx >= node.length) return undefined;
      node = node[idx];
    } else if (isObject(node)) {
      if (!(part in node)) return undefined;
      node = node[part];
    } else {
      return undefined;
    }
  }
  return node;
}

/**
 * Inline every local `$ref`. `seen` is the stack of pointers currently being
 * expanded, so a self-referential schema (a comment with replies, say)
 * terminates with a marker rather than recursing forever.
 */
function deref(node: Json, root: JsonObject, seen: string[], warnings: Set<string>): Json {
  if (Array.isArray(node)) return node.map((n) => deref(n, root, seen, warnings));
  if (!isObject(node)) return node;

  const ref = node.$ref;
  if (typeof ref === "string") {
    if (!ref.startsWith("#")) {
      warnings.add(
        `External $ref left unresolved: ${ref}. Bundle the spec before pushing (redocly bundle / swagger-cli bundle) so changes inside it are diffed.`,
      );
      return { ...node };
    }
    if (seen.includes(ref)) return { "x-circular-ref": ref };
    const target = resolvePointer(root, ref);
    if (target === undefined) {
      warnings.add(`Dangling $ref: ${ref} does not resolve inside the document.`);
      return { "x-unresolved-ref": ref };
    }
    // Sibling keys alongside $ref are legal in 3.1 and act as overrides.
    const siblings = Object.fromEntries(Object.entries(node).filter(([k]) => k !== "$ref"));
    const expanded = deref(target, root, [...seen, ref], warnings);
    if (isObject(expanded) && Object.keys(siblings).length > 0) {
      return { ...expanded, ...(deref(siblings, root, seen, warnings) as JsonObject) };
    }
    return expanded;
  }

  const out: JsonObject = {};
  for (const [k, v] of Object.entries(node)) out[k] = deref(v, root, seen, warnings);
  return out;
}

/* ---------------------------------------------------------------- normalize */

/** Sort object keys so a reordered spec file diffs to nothing. */
function sortKeys(node: Json): Json {
  if (Array.isArray(node)) return node.map(sortKeys);
  if (!isObject(node)) return node;
  const out: JsonObject = {};
  for (const k of Object.keys(node).sort()) out[k] = sortKeys(node[k]);
  return out;
}

/**
 * Is this a plain object schema safe to merge into a sibling under `allOf`?
 * Anything with its own combinator or a discriminator is left alone — merging
 * those changes meaning.
 */
function isMergeableObjectSchema(s: Json): s is JsonObject {
  if (!isObject(s)) return false;
  if ("oneOf" in s || "anyOf" in s || "not" in s || "discriminator" in s) return false;
  if ("x-circular-ref" in s || "x-unresolved-ref" in s) return false;
  const type = s.type;
  if (type !== undefined && type !== "object") return false;
  return true;
}

/** Merge `allOf: [{object}, {object}]` into one object schema. */
function collapseAllOf(schema: JsonObject): JsonObject {
  const branches = schema.allOf;
  if (!Array.isArray(branches) || branches.length === 0) return schema;
  if (!branches.every(isMergeableObjectSchema)) return schema;

  const rest = Object.fromEntries(Object.entries(schema).filter(([k]) => k !== "allOf"));
  if (!isMergeableObjectSchema(rest)) return schema;

  const merged: JsonObject = { ...rest };
  const properties: JsonObject = isObject(rest.properties) ? { ...rest.properties } : {};
  const required = new Set<string>(
    Array.isArray(rest.required)
      ? rest.required.filter((r): r is string => typeof r === "string")
      : [],
  );

  for (const branch of branches as JsonObject[]) {
    for (const [k, v] of Object.entries(branch)) {
      if (k === "properties") {
        if (isObject(v)) for (const [p, ps] of Object.entries(v)) properties[p] = ps;
      } else if (k === "required") {
        if (Array.isArray(v)) for (const r of v) if (typeof r === "string") required.add(r);
      } else if (k !== "allOf" && !(k in merged)) {
        merged[k] = v;
      }
    }
  }
  if (Object.keys(properties).length > 0) merged.properties = properties;
  else delete merged.properties;
  if (required.size > 0) merged.required = [...required].sort();
  else delete merged.required;
  if (merged.type === undefined && Object.keys(properties).length > 0) merged.type = "object";
  return merged;
}

/**
 * Express 3.0's `nullable: true` the way 3.1 does — as `"null"` in the type
 * union — so the same API described by either version canonicalizes
 * identically and no finding is emitted for the version bump alone.
 */
function normalizeNullability(schema: JsonObject): JsonObject {
  const out: JsonObject = { ...schema };
  const nullable = out.nullable === true;
  delete out.nullable;

  let types: string[] | undefined;
  if (typeof out.type === "string") types = [out.type];
  else if (Array.isArray(out.type)) {
    types = out.type.filter((t): t is string => typeof t === "string");
  }

  if (types) {
    const set = new Set(types);
    if (nullable) set.add("null");
    const sorted = [...set].sort();
    out.type = sorted.length === 1 ? sorted[0] : sorted;
  } else if (nullable) {
    // No declared type: keep the fact, since a diff on it still matters.
    out["x-nullable"] = true;
  }
  return out;
}

/** Recursively normalize every schema-shaped node in the document. */
function normalizeSchemas(node: Json): Json {
  if (Array.isArray(node)) return node.map(normalizeSchemas);
  if (!isObject(node)) return node;

  let out: JsonObject = {};
  for (const [k, v] of Object.entries(node)) out[k] = normalizeSchemas(v);

  const looksLikeSchema =
    "type" in out ||
    "properties" in out ||
    "items" in out ||
    "allOf" in out ||
    "oneOf" in out ||
    "anyOf" in out ||
    "enum" in out ||
    "nullable" in out;

  if (looksLikeSchema) {
    out = collapseAllOf(out);
    out = normalizeNullability(out);
    if (Array.isArray(out.required)) {
      const req = out.required.filter((r): r is string => typeof r === "string");
      out.required = [...new Set(req)].sort();
    }
    if (Array.isArray(out.enum)) {
      // Enum order is not semantic; sort by JSON encoding so a reordered enum
      // list is not reported as a change.
      out.enum = [...out.enum].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
  }
  return out;
}

/* ------------------------------------------------------------ spec health */

function computeHealth(doc: JsonObject, warnings: Set<string>): SpecHealth {
  const paths = isObject(doc.paths) ? doc.paths : {};
  let operations = 0;
  let documentedResponses = 0;
  let schemalessBodies = 0;
  let operationsWithProse = 0;

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isObject(pathItem)) continue;
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!isObject(op)) continue;
      operations += 1;
      if (typeof op.summary === "string" || typeof op.description === "string") {
        operationsWithProse += 1;
      }

      const responses = isObject(op.responses) ? op.responses : {};
      const hasSchema = Object.values(responses).some((r) => {
        if (!isObject(r)) return false;
        const content = isObject(r.content) ? r.content : {};
        return Object.values(content).some((c) => isObject(c) && isObject(c.schema));
      });
      if (hasSchema) documentedResponses += 1;
      else if (Object.keys(responses).length === 0) {
        warnings.add(
          `${method.toUpperCase()} ${path} declares no responses — nothing to diff for its consumers.`,
        );
      }

      const body = op.requestBody;
      if (isObject(body)) {
        const content = isObject(body.content) ? body.content : {};
        const bodyHasSchema = Object.values(content).some((c) => isObject(c) && isObject(c.schema));
        if (!bodyHasSchema) {
          schemalessBodies += 1;
          warnings.add(
            `${method.toUpperCase()} ${path} has a request body with no schema — request-side breakage is invisible.`,
          );
        }
      }
    }
  }

  if (operations === 0) {
    warnings.add("The document declares no operations. SchemaSentry has nothing to watch yet.");
  }

  // Response coverage is what consumers actually depend on, so it carries the
  // most weight; prose coverage is a smaller, honest component.
  const responseCoverage = operations === 0 ? 0 : documentedResponses / operations;
  const proseCoverage = operations === 0 ? 0 : operationsWithProse / operations;
  const bodyPenalty = operations === 0 ? 0 : schemalessBodies / operations;
  const score =
    operations === 0
      ? 0
      : Math.round(100 * (0.7 * responseCoverage + 0.2 * proseCoverage + 0.1 * (1 - bodyPenalty)));

  return {
    score: Math.max(0, Math.min(100, score)),
    warnings: [...warnings].sort(),
    operations,
    documentedResponses,
    schemalessBodies,
  };
}

/* --------------------------------------------------------------- the entry */

export interface CanonicalResult {
  doc: JsonObject;
  health: SpecHealth;
  version: string;
  title: string;
  /** The API's own version field, e.g. "2024-11-01" — informational. */
  apiVersion: string | null;
}

/**
 * Canonicalize a raw spec. Async only because the signature is part of the
 * published engine surface; the current implementation does no I/O.
 */
export async function canonicalize(raw: string): Promise<CanonicalResult> {
  const parsed = parseSpec(raw);
  const version = assertSupportedVersion(parsed);

  const warnings = new Set<string>();
  const dereferenced = deref(parsed, parsed, [], warnings) as JsonObject;
  const normalized = sortKeys(normalizeSchemas(dereferenced)) as JsonObject;

  // `components` is pure plumbing once refs are inlined; keeping it would make
  // every diff report the same change twice — once inline, once in components.
  delete normalized.components;

  const info = isObject(normalized.info) ? normalized.info : {};
  const health = computeHealth(normalized, warnings);

  return {
    doc: normalized,
    health,
    version,
    title: typeof info.title === "string" && info.title.trim() ? info.title.trim() : "Untitled API",
    apiVersion: typeof info.version === "string" ? info.version : null,
  };
}

/** A one-line honest verdict on whether this spec can support good diffs. */
export function healthVerdict(health: SpecHealth): { label: string; detail: string } {
  if (health.operations === 0) {
    return { label: "UNUSABLE", detail: "No operations found. Nothing can be diffed." };
  }
  if (health.score >= 80) {
    return {
      label: "GOOD",
      detail: `${health.documentedResponses} of ${health.operations} operations have response schemas.`,
    };
  }
  if (health.score >= 50) {
    return {
      label: "THIN",
      detail: `Only ${health.documentedResponses} of ${health.operations} operations have response schemas — response breakage in the rest is invisible.`,
    };
  }
  return {
    label: "POOR",
    detail: `${health.operations - health.documentedResponses} of ${health.operations} operations have no response schema. Diffs stay near-empty until the spec describes what it returns.`,
  };
}
