/**
 * src/core/diff.ts
 *
 * The semantic diff walk: two canonical documents in, divergences out. The
 * heart of the OSS engine core — pure, deterministic, no I/O.
 *
 * The walk is **direction-aware**, which is the whole reason a semantic diff
 * beats a textual one:
 *
 *   - On the **request** side the caller is the one who has to comply, so
 *     *tightening* breaks them: a new required property, a removed enum value
 *     they were allowed to send, a narrower type, `additionalProperties`
 *     flipping to `false`.
 *   - On the **response** side the consumer is the one parsing, so *widening*
 *     breaks them: a field that can now be null, a new enum value their
 *     switch does not handle, a removed field they read.
 *
 * The same JSON edit is therefore breaking in one direction and free in the
 * other, and a symmetric diff cannot tell you which. Every divergence carries
 * the exact JSON pointer it was found at (so the verdict is reviewable), the
 * before/after excerpt (so the UI can draw the mini-diff), and a dotted
 * `fieldPath` (so the consumer registry can be intersected with it).
 */

import { HTTP_METHODS, isObject, type Json, type JsonObject } from "./canonicalize";

export const ENGINE_VERSION = "1.0.0";

export type Side = "request" | "response" | "operation";

export interface Divergence {
  /** Matches a rule id in `rules.ts`. One divergence, one rule. */
  ruleId: string;
  /** RFC 6901 pointer into the *new* document (or the old one for removals). */
  jsonPointer: string;
  /** `/v1/orders` — the templated path, absent for document-level changes. */
  endpoint?: string;
  /** Upper-case HTTP method. */
  method?: string;
  side: Side;
  /** Dotted field path inside the schema: `items.status`. Used for impact. */
  fieldPath?: string;
  /** Values interpolated into the rule's reason template. */
  vars: Record<string, string>;
  before?: Json;
  after?: Json;
}

/* ------------------------------------------------------------------ helpers */

const esc = (s: string) => s.replace(/~/g, "~0").replace(/\//g, "~1");

function typeSet(schema: JsonObject): Set<string> {
  const t = schema.type;
  if (typeof t === "string") return new Set([t]);
  if (Array.isArray(t)) return new Set(t.filter((x): x is string => typeof x === "string"));
  if (schema["x-nullable"] === true) return new Set(["null"]);
  return new Set();
}

const fmtTypes = (s: Set<string>) => (s.size === 0 ? "any" : [...s].sort().join(" | "));

const isSubset = (a: Set<string>, b: Set<string>) => [...a].every((x) => b.has(x));

function enumSet(schema: JsonObject): Map<string, Json> {
  const out = new Map<string, Json>();
  if (Array.isArray(schema.enum)) for (const v of schema.enum) out.set(JSON.stringify(v), v);
  return out;
}

function requiredSet(schema: JsonObject): Set<string> {
  return new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((r): r is string => typeof r === "string")
      : [],
  );
}

const properties = (schema: JsonObject): JsonObject =>
  isObject(schema.properties) ? schema.properties : {};

/** A short, readable rendering of a value for a reason template. */
export function short(value: Json | undefined, max = 48): string {
  if (value === undefined) return "absent";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

const joinField = (base: string | undefined, seg: string) => (base ? `${base}.${seg}` : seg);

interface Ctx {
  pointer: string;
  side: Side;
  endpoint?: string;
  method?: string;
  fieldPath?: string;
  /** Status code, for response-side messages. */
  status?: string;
  mediaType?: string;
}

/* ---------------------------------------------------------------- schema diff */

/**
 * Compare two schemas at the same position. `depth` bounds the recursion so a
 * pathological (or circular-marked) schema cannot spin.
 */
function diffSchema(before: Json, after: Json, ctx: Ctx, out: Divergence[], depth = 0): void {
  if (depth > 24) return;
  if (!isObject(before) || !isObject(after)) return;
  const req = ctx.side === "request";

  /* ---- type & nullability ---- */
  const tb = typeSet(before);
  const ta = typeSet(after);
  if (fmtTypes(tb) !== fmtTypes(ta)) {
    const nullBefore = tb.has("null");
    const nullAfter = ta.has("null");
    const coreBefore = new Set([...tb].filter((t) => t !== "null"));
    const coreAfter = new Set([...ta].filter((t) => t !== "null"));
    const coreSame = fmtTypes(coreBefore) === fmtTypes(coreAfter);

    if (coreSame && nullBefore !== nullAfter) {
      out.push({
        ruleId: nullAfter
          ? req
            ? "request.nullable.added"
            : "response.nullable.added"
          : req
            ? "request.nullable.removed"
            : "response.nullable.removed",
        jsonPointer: `${ctx.pointer}/type`,
        endpoint: ctx.endpoint,
        method: ctx.method,
        side: ctx.side,
        fieldPath: ctx.fieldPath,
        vars: { field: ctx.fieldPath ?? "(body)", types: fmtTypes(ta) },
        before: before.type ?? null,
        after: after.type ?? null,
      });
    } else if (coreBefore.size > 0 && coreAfter.size > 0 && isSubset(coreAfter, coreBefore)) {
      out.push({
        ruleId: req ? "request.type.narrowed" : "response.type.narrowed",
        jsonPointer: `${ctx.pointer}/type`,
        endpoint: ctx.endpoint,
        method: ctx.method,
        side: ctx.side,
        fieldPath: ctx.fieldPath,
        vars: { field: ctx.fieldPath ?? "(body)", from: fmtTypes(tb), to: fmtTypes(ta) },
        before: before.type ?? null,
        after: after.type ?? null,
      });
    } else if (coreBefore.size > 0 && coreAfter.size > 0 && isSubset(coreBefore, coreAfter)) {
      out.push({
        ruleId: req ? "request.type.widened" : "response.type.widened",
        jsonPointer: `${ctx.pointer}/type`,
        endpoint: ctx.endpoint,
        method: ctx.method,
        side: ctx.side,
        fieldPath: ctx.fieldPath,
        vars: { field: ctx.fieldPath ?? "(body)", from: fmtTypes(tb), to: fmtTypes(ta) },
        before: before.type ?? null,
        after: after.type ?? null,
      });
    } else {
      out.push({
        ruleId: req ? "request.type.changed" : "response.type.changed",
        jsonPointer: `${ctx.pointer}/type`,
        endpoint: ctx.endpoint,
        method: ctx.method,
        side: ctx.side,
        fieldPath: ctx.fieldPath,
        vars: { field: ctx.fieldPath ?? "(body)", from: fmtTypes(tb), to: fmtTypes(ta) },
        before: before.type ?? null,
        after: after.type ?? null,
      });
    }
  }

  /* ---- enum membership ---- */
  const eb = enumSet(before);
  const ea = enumSet(after);
  if (eb.size > 0 || ea.size > 0) {
    if (eb.size === 0 && ea.size > 0) {
      out.push({
        ruleId: req ? "request.enum.constrained" : "response.enum.constrained",
        jsonPointer: `${ctx.pointer}/enum`,
        endpoint: ctx.endpoint,
        method: ctx.method,
        side: ctx.side,
        fieldPath: ctx.fieldPath,
        vars: { field: ctx.fieldPath ?? "(body)", values: [...ea.keys()].map((k) => JSON.parse(k) as string).join(", ") },
        before: null,
        after: after.enum ?? null,
      });
    } else if (eb.size > 0 && ea.size === 0) {
      out.push({
        ruleId: req ? "request.enum.unconstrained" : "response.enum.unconstrained",
        jsonPointer: `${ctx.pointer}/enum`,
        endpoint: ctx.endpoint,
        method: ctx.method,
        side: ctx.side,
        fieldPath: ctx.fieldPath,
        vars: { field: ctx.fieldPath ?? "(body)" },
        before: before.enum ?? null,
        after: null,
      });
    } else {
      for (const [key, value] of eb) {
        if (ea.has(key)) continue;
        out.push({
          ruleId: req ? "request.enum.value-removed" : "response.enum.value-removed",
          jsonPointer: `${ctx.pointer}/enum`,
          endpoint: ctx.endpoint,
          method: ctx.method,
          side: ctx.side,
          fieldPath: ctx.fieldPath,
          vars: { field: ctx.fieldPath ?? "(body)", value: short(value) },
          before: before.enum ?? null,
          after: after.enum ?? null,
        });
      }
      for (const [key, value] of ea) {
        if (eb.has(key)) continue;
        out.push({
          ruleId: req ? "request.enum.value-added" : "response.enum.value-added",
          jsonPointer: `${ctx.pointer}/enum`,
          endpoint: ctx.endpoint,
          method: ctx.method,
          side: ctx.side,
          fieldPath: ctx.fieldPath,
          vars: { field: ctx.fieldPath ?? "(body)", value: short(value) },
          before: before.enum ?? null,
          after: after.enum ?? null,
        });
      }
    }
  }

  /* ---- format ---- */
  if (before.format !== after.format && (before.format !== undefined || after.format !== undefined)) {
    out.push({
      ruleId: req ? "request.format.changed" : "response.format.changed",
      jsonPointer: `${ctx.pointer}/format`,
      endpoint: ctx.endpoint,
      method: ctx.method,
      side: ctx.side,
      fieldPath: ctx.fieldPath,
      vars: {
        field: ctx.fieldPath ?? "(body)",
        from: short(before.format ?? null),
        to: short(after.format ?? null),
      },
      before: before.format ?? null,
      after: after.format ?? null,
    });
  }

  /* ---- constraints (request side only: tightening is what breaks callers) -- */
  if (req) diffConstraints(before, after, ctx, out);

  /* ---- additionalProperties ---- */
  const apBefore = before.additionalProperties;
  const apAfter = after.additionalProperties;
  const apClosed = (v: Json | undefined) => v === false;
  if (!apClosed(apBefore) && apClosed(apAfter)) {
    out.push({
      ruleId: req ? "request.additional-properties.closed" : "response.additional-properties.closed",
      jsonPointer: `${ctx.pointer}/additionalProperties`,
      endpoint: ctx.endpoint,
      method: ctx.method,
      side: ctx.side,
      fieldPath: ctx.fieldPath,
      vars: { field: ctx.fieldPath ?? "(body)" },
      before: apBefore ?? true,
      after: false,
    });
  } else if (apClosed(apBefore) && !apClosed(apAfter)) {
    out.push({
      ruleId: req ? "request.additional-properties.opened" : "response.additional-properties.opened",
      jsonPointer: `${ctx.pointer}/additionalProperties`,
      endpoint: ctx.endpoint,
      method: ctx.method,
      side: ctx.side,
      fieldPath: ctx.fieldPath,
      vars: { field: ctx.fieldPath ?? "(body)" },
      before: false,
      after: apAfter ?? true,
    });
  }

  /* ---- object properties & required-ness ---- */
  const pb = properties(before);
  const pa = properties(after);
  const rb = requiredSet(before);
  const ra = requiredSet(after);

  for (const name of Object.keys(pb).sort()) {
    if (name in pa) continue;
    out.push({
      ruleId: req ? "request.property.removed" : "response.property.removed",
      jsonPointer: `${ctx.pointer}/properties/${esc(name)}`,
      endpoint: ctx.endpoint,
      method: ctx.method,
      side: ctx.side,
      fieldPath: joinField(ctx.fieldPath, name),
      vars: { field: joinField(ctx.fieldPath, name), required: rb.has(name) ? "required" : "optional" },
      before: pb[name],
      after: undefined,
    });
  }

  for (const name of Object.keys(pa).sort()) {
    if (name in pb) continue;
    const nowRequired = ra.has(name);
    out.push({
      ruleId: req
        ? nowRequired
          ? "request.property.added.required"
          : "request.property.added.optional"
        : "response.property.added",
      jsonPointer: `${ctx.pointer}/properties/${esc(name)}`,
      endpoint: ctx.endpoint,
      method: ctx.method,
      side: ctx.side,
      fieldPath: joinField(ctx.fieldPath, name),
      vars: { field: joinField(ctx.fieldPath, name), types: fmtTypes(typeSet(pa[name] as JsonObject)) },
      before: undefined,
      after: pa[name],
    });
  }

  // Required-ness flips only matter for properties present on both sides;
  // a property that was added is already reported with its required-ness.
  for (const name of Object.keys(pa).sort()) {
    if (!(name in pb)) continue;
    const was = rb.has(name);
    const now = ra.has(name);
    if (was === now) continue;
    out.push({
      ruleId: req
        ? now
          ? "request.property.required.added"
          : "request.property.required.removed"
        : now
          ? "response.property.required.added"
          : "response.property.required.removed",
      jsonPointer: `${ctx.pointer}/required`,
      endpoint: ctx.endpoint,
      method: ctx.method,
      side: ctx.side,
      fieldPath: joinField(ctx.fieldPath, name),
      vars: { field: joinField(ctx.fieldPath, name) },
      before: before.required ?? [],
      after: after.required ?? [],
    });
  }

  for (const name of Object.keys(pa).sort()) {
    if (!(name in pb)) continue;
    diffSchema(
      pb[name],
      pa[name],
      { ...ctx, pointer: `${ctx.pointer}/properties/${esc(name)}`, fieldPath: joinField(ctx.fieldPath, name) },
      out,
      depth + 1,
    );
  }

  /* ---- array items ---- */
  if (isObject(before.items) && isObject(after.items)) {
    diffSchema(
      before.items,
      after.items,
      { ...ctx, pointer: `${ctx.pointer}/items`, fieldPath: ctx.fieldPath ? `${ctx.fieldPath}[]` : "[]" },
      out,
      depth + 1,
    );
  }

  /* ---- combinators: compare branch counts, then position-wise ---- */
  for (const key of ["oneOf", "anyOf", "allOf"] as const) {
    const bb = Array.isArray(before[key]) ? (before[key] as Json[]) : null;
    const aa = Array.isArray(after[key]) ? (after[key] as Json[]) : null;
    if (!bb || !aa) continue;
    if (bb.length !== aa.length) {
      out.push({
        ruleId:
          aa.length < bb.length
            ? req
              ? "request.combinator.branch-removed"
              : "response.combinator.branch-removed"
            : req
              ? "request.combinator.branch-added"
              : "response.combinator.branch-added",
        jsonPointer: `${ctx.pointer}/${key}`,
        endpoint: ctx.endpoint,
        method: ctx.method,
        side: ctx.side,
        fieldPath: ctx.fieldPath,
        vars: {
          field: ctx.fieldPath ?? "(body)",
          combinator: key,
          from: String(bb.length),
          to: String(aa.length),
        },
        before: bb.length,
        after: aa.length,
      });
      continue;
    }
    for (let i = 0; i < aa.length; i++) {
      diffSchema(bb[i], aa[i], { ...ctx, pointer: `${ctx.pointer}/${key}/${i}` }, out, depth + 1);
    }
  }
}

const NUMERIC_TIGHTEN: Array<{ key: string; tightenedWhen: "increased" | "decreased"; label: string }> = [
  { key: "minimum", tightenedWhen: "increased", label: "minimum" },
  { key: "maximum", tightenedWhen: "decreased", label: "maximum" },
  { key: "exclusiveMinimum", tightenedWhen: "increased", label: "exclusive minimum" },
  { key: "exclusiveMaximum", tightenedWhen: "decreased", label: "exclusive maximum" },
  { key: "minLength", tightenedWhen: "increased", label: "minimum length" },
  { key: "maxLength", tightenedWhen: "decreased", label: "maximum length" },
  { key: "minItems", tightenedWhen: "increased", label: "minimum items" },
  { key: "maxItems", tightenedWhen: "decreased", label: "maximum items" },
];

function diffConstraints(before: JsonObject, after: JsonObject, ctx: Ctx, out: Divergence[]): void {
  for (const { key, tightenedWhen, label } of NUMERIC_TIGHTEN) {
    const b = before[key];
    const a = after[key];
    if (typeof b !== "number" && typeof a !== "number") continue;
    if (b === a) continue;
    const tightened =
      typeof a === "number" &&
      (typeof b !== "number" ||
        (tightenedWhen === "increased" ? a > b : a < b));
    out.push({
      ruleId: tightened ? "request.constraint.tightened" : "request.constraint.loosened",
      jsonPointer: `${ctx.pointer}/${key}`,
      endpoint: ctx.endpoint,
      method: ctx.method,
      side: ctx.side,
      fieldPath: ctx.fieldPath,
      vars: {
        field: ctx.fieldPath ?? "(body)",
        constraint: label,
        from: short(b ?? null),
        to: short(a ?? null),
      },
      before: b ?? null,
      after: a ?? null,
    });
  }

  if (before.pattern !== after.pattern) {
    if (typeof after.pattern === "string" && typeof before.pattern !== "string") {
      out.push({
        ruleId: "request.pattern.added",
        jsonPointer: `${ctx.pointer}/pattern`,
        endpoint: ctx.endpoint,
        method: ctx.method,
        side: ctx.side,
        fieldPath: ctx.fieldPath,
        vars: { field: ctx.fieldPath ?? "(body)", pattern: short(after.pattern) },
        before: null,
        after: after.pattern,
      });
    } else if (typeof before.pattern === "string" && typeof after.pattern !== "string") {
      out.push({
        ruleId: "request.pattern.removed",
        jsonPointer: `${ctx.pointer}/pattern`,
        endpoint: ctx.endpoint,
        method: ctx.method,
        side: ctx.side,
        fieldPath: ctx.fieldPath,
        vars: { field: ctx.fieldPath ?? "(body)", pattern: short(before.pattern) },
        before: before.pattern,
        after: null,
      });
    } else {
      out.push({
        ruleId: "request.pattern.changed",
        jsonPointer: `${ctx.pointer}/pattern`,
        endpoint: ctx.endpoint,
        method: ctx.method,
        side: ctx.side,
        fieldPath: ctx.fieldPath,
        vars: {
          field: ctx.fieldPath ?? "(body)",
          from: short(before.pattern ?? null),
          to: short(after.pattern ?? null),
        },
        before: before.pattern ?? null,
        after: after.pattern ?? null,
      });
    }
  }
}

/* --------------------------------------------------------------- content maps */

function diffContent(
  before: JsonObject,
  after: JsonObject,
  ctx: Ctx,
  out: Divergence[],
): void {
  const bMedia = isObject(before) ? before : {};
  const aMedia = isObject(after) ? after : {};
  const req = ctx.side === "request";
  // Content-type rules name the operation in their template, so the vars have
  // to carry it — a missing var renders as a literal `{endpoint}` in the UI.
  const mediaVars = (mt: string) => ({
    mediaType: mt,
    status: ctx.status ?? "",
    endpoint: `${ctx.method ?? ""} ${ctx.endpoint ?? ""}`.trim(),
  });

  for (const mt of Object.keys(bMedia).sort()) {
    if (mt in aMedia) continue;
    out.push({
      ruleId: req ? "request.content-type.removed" : "response.content-type.removed",
      jsonPointer: `${ctx.pointer}/${esc(mt)}`,
      endpoint: ctx.endpoint,
      method: ctx.method,
      side: ctx.side,
      vars: mediaVars(mt),
      before: mt,
      after: undefined,
    });
  }
  for (const mt of Object.keys(aMedia).sort()) {
    if (mt in bMedia) continue;
    out.push({
      ruleId: req ? "request.content-type.added" : "response.content-type.added",
      jsonPointer: `${ctx.pointer}/${esc(mt)}`,
      endpoint: ctx.endpoint,
      method: ctx.method,
      side: ctx.side,
      vars: mediaVars(mt),
      before: undefined,
      after: mt,
    });
  }
  for (const mt of Object.keys(aMedia).sort()) {
    if (!(mt in bMedia)) continue;
    const b = bMedia[mt];
    const a = aMedia[mt];
    if (!isObject(b) || !isObject(a)) continue;
    if (isObject(b.schema) && isObject(a.schema)) {
      diffSchema(b.schema, a.schema, { ...ctx, pointer: `${ctx.pointer}/${esc(mt)}/schema`, mediaType: mt }, out);
    }
  }
}

/* ----------------------------------------------------------------- operations */

interface ParamKey {
  name: string;
  location: string;
}

function paramMap(list: Json | undefined): Map<string, JsonObject> {
  const out = new Map<string, JsonObject>();
  if (!Array.isArray(list)) return out;
  for (const p of list) {
    if (!isObject(p)) continue;
    const name = typeof p.name === "string" ? p.name : null;
    const location = typeof p.in === "string" ? p.in : null;
    if (!name || !location) continue;
    out.set(`${location}:${name}`, p);
  }
  return out;
}

const parseParamKey = (key: string): ParamKey => {
  const idx = key.indexOf(":");
  return { location: key.slice(0, idx), name: key.slice(idx + 1) };
};

/** Path-level parameters are inherited by every operation in the path item. */
function effectiveParams(pathItem: JsonObject, op: JsonObject): Map<string, JsonObject> {
  const merged = paramMap(pathItem.parameters);
  for (const [k, v] of paramMap(op.parameters)) merged.set(k, v);
  return merged;
}

function diffOperation(
  path: string,
  method: string,
  beforePathItem: JsonObject,
  afterPathItem: JsonObject,
  before: JsonObject,
  after: JsonObject,
  out: Divergence[],
): void {
  const endpoint = path;
  const M = method.toUpperCase();
  const base = `/paths/${esc(path)}/${method}`;

  /* ---- deprecation & identity ---- */
  if (before.deprecated !== true && after.deprecated === true) {
    out.push({
      ruleId: "operation.deprecated",
      jsonPointer: `${base}/deprecated`,
      endpoint,
      method: M,
      side: "operation",
      vars: { endpoint: `${M} ${path}` },
      before: false,
      after: true,
    });
  }
  if (
    typeof before.operationId === "string" &&
    typeof after.operationId === "string" &&
    before.operationId !== after.operationId
  ) {
    out.push({
      ruleId: "operation.operation-id.changed",
      jsonPointer: `${base}/operationId`,
      endpoint,
      method: M,
      side: "operation",
      vars: { endpoint: `${M} ${path}`, from: before.operationId, to: after.operationId },
      before: before.operationId,
      after: after.operationId,
    });
  }

  /* ---- security ---- */
  const secCount = (op: JsonObject) => (Array.isArray(op.security) ? op.security.length : -1);
  const sb = secCount(before);
  const sa = secCount(after);
  if (sb === 0 && sa > 0) {
    out.push({
      ruleId: "operation.security.added",
      jsonPointer: `${base}/security`,
      endpoint,
      method: M,
      side: "operation",
      vars: { endpoint: `${M} ${path}` },
      before: [],
      after: after.security ?? null,
    });
  } else if (sb > 0 && sa === 0) {
    out.push({
      ruleId: "operation.security.removed",
      jsonPointer: `${base}/security`,
      endpoint,
      method: M,
      side: "operation",
      vars: { endpoint: `${M} ${path}` },
      before: before.security ?? null,
      after: [],
    });
  }

  /* ---- parameters ---- */
  const pbAll = effectiveParams(beforePathItem, before);
  const paAll = effectiveParams(afterPathItem, after);

  for (const [key, param] of [...pbAll].sort(([a], [b]) => a.localeCompare(b))) {
    if (paAll.has(key)) continue;
    const { name, location } = parseParamKey(key);
    out.push({
      ruleId: param.required === true ? "parameter.required.removed" : "parameter.optional.removed",
      jsonPointer: `${base}/parameters`,
      endpoint,
      method: M,
      side: "request",
      fieldPath: name,
      vars: { endpoint: `${M} ${path}`, name, in: location },
      before: param,
      after: undefined,
    });
  }
  for (const [key, param] of [...paAll].sort(([a], [b]) => a.localeCompare(b))) {
    if (pbAll.has(key)) continue;
    const { name, location } = parseParamKey(key);
    out.push({
      ruleId: param.required === true ? "parameter.required.added" : "parameter.optional.added",
      jsonPointer: `${base}/parameters`,
      endpoint,
      method: M,
      side: "request",
      fieldPath: name,
      vars: { endpoint: `${M} ${path}`, name, in: location },
      before: undefined,
      after: param,
    });
  }
  for (const [key, paramAfter] of [...paAll].sort(([a], [b]) => a.localeCompare(b))) {
    const paramBefore = pbAll.get(key);
    if (!paramBefore) continue;
    const { name, location } = parseParamKey(key);
    if (paramBefore.required !== true && paramAfter.required === true) {
      out.push({
        ruleId: "parameter.became-required",
        jsonPointer: `${base}/parameters`,
        endpoint,
        method: M,
        side: "request",
        fieldPath: name,
        vars: { endpoint: `${M} ${path}`, name, in: location },
        before: false,
        after: true,
      });
    } else if (paramBefore.required === true && paramAfter.required !== true) {
      out.push({
        ruleId: "parameter.became-optional",
        jsonPointer: `${base}/parameters`,
        endpoint,
        method: M,
        side: "request",
        fieldPath: name,
        vars: { endpoint: `${M} ${path}`, name, in: location },
        before: true,
        after: false,
      });
    }
    if (isObject(paramBefore.schema) && isObject(paramAfter.schema)) {
      diffSchema(
        paramBefore.schema,
        paramAfter.schema,
        {
          pointer: `${base}/parameters/${esc(location)}:${esc(name)}/schema`,
          side: "request",
          endpoint,
          method: M,
          fieldPath: name,
        },
        out,
      );
    }
  }

  /* ---- request body ---- */
  const bBody = isObject(before.requestBody) ? before.requestBody : null;
  const aBody = isObject(after.requestBody) ? after.requestBody : null;
  if (!bBody && aBody) {
    out.push({
      ruleId: aBody.required === true ? "request.body.added.required" : "request.body.added.optional",
      jsonPointer: `${base}/requestBody`,
      endpoint,
      method: M,
      side: "request",
      vars: { endpoint: `${M} ${path}` },
      before: undefined,
      after: aBody.required === true ? { required: true } : { required: false },
    });
  } else if (bBody && !aBody) {
    out.push({
      ruleId: "request.body.removed",
      jsonPointer: `${base}/requestBody`,
      endpoint,
      method: M,
      side: "request",
      vars: { endpoint: `${M} ${path}` },
      before: { required: bBody.required === true },
      after: undefined,
    });
  } else if (bBody && aBody) {
    if (bBody.required !== true && aBody.required === true) {
      out.push({
        ruleId: "request.body.became-required",
        jsonPointer: `${base}/requestBody/required`,
        endpoint,
        method: M,
        side: "request",
        vars: { endpoint: `${M} ${path}` },
        before: false,
        after: true,
      });
    } else if (bBody.required === true && aBody.required !== true) {
      out.push({
        ruleId: "request.body.became-optional",
        jsonPointer: `${base}/requestBody/required`,
        endpoint,
        method: M,
        side: "request",
        vars: { endpoint: `${M} ${path}` },
        before: true,
        after: false,
      });
    }
    diffContent(
      isObject(bBody.content) ? bBody.content : {},
      isObject(aBody.content) ? aBody.content : {},
      { pointer: `${base}/requestBody/content`, side: "request", endpoint, method: M },
      out,
    );
  }

  /* ---- responses ---- */
  const bRes = isObject(before.responses) ? before.responses : {};
  const aRes = isObject(after.responses) ? after.responses : {};
  const isSuccess = (code: string) => /^2/.test(code);

  for (const code of Object.keys(bRes).sort()) {
    if (code in aRes) continue;
    out.push({
      ruleId: isSuccess(code) ? "response.success-status.removed" : "response.error-status.removed",
      jsonPointer: `${base}/responses/${esc(code)}`,
      endpoint,
      method: M,
      side: "response",
      vars: { endpoint: `${M} ${path}`, status: code },
      before: code,
      after: undefined,
    });
  }
  for (const code of Object.keys(aRes).sort()) {
    if (code in bRes) continue;
    out.push({
      ruleId: isSuccess(code) ? "response.success-status.added" : "response.error-status.added",
      jsonPointer: `${base}/responses/${esc(code)}`,
      endpoint,
      method: M,
      side: "response",
      vars: { endpoint: `${M} ${path}`, status: code },
      before: undefined,
      after: code,
    });
  }
  for (const code of Object.keys(aRes).sort()) {
    if (!(code in bRes)) continue;
    const b = bRes[code];
    const a = aRes[code];
    if (!isObject(b) || !isObject(a)) continue;

    // Response headers consumers read (pagination cursors, rate limits).
    const hb = isObject(b.headers) ? b.headers : {};
    const ha = isObject(a.headers) ? a.headers : {};
    for (const h of Object.keys(hb).sort()) {
      if (h in ha) continue;
      out.push({
        ruleId: "response.header.removed",
        jsonPointer: `${base}/responses/${esc(code)}/headers/${esc(h)}`,
        endpoint,
        method: M,
        side: "response",
        fieldPath: h,
        vars: { endpoint: `${M} ${path}`, status: code, name: h },
        before: h,
        after: undefined,
      });
    }
    for (const h of Object.keys(ha).sort()) {
      if (h in hb) continue;
      out.push({
        ruleId: "response.header.added",
        jsonPointer: `${base}/responses/${esc(code)}/headers/${esc(h)}`,
        endpoint,
        method: M,
        side: "response",
        fieldPath: h,
        vars: { endpoint: `${M} ${path}`, status: code, name: h },
        before: undefined,
        after: h,
      });
    }

    diffContent(
      isObject(b.content) ? b.content : {},
      isObject(a.content) ? a.content : {},
      { pointer: `${base}/responses/${esc(code)}/content`, side: "response", endpoint, method: M, status: code },
      out,
    );
  }
}

/* --------------------------------------------------------------------- entry */

/** Every operation in a document, keyed `METHOD path`. */
export function operationIndex(doc: JsonObject): Map<string, { path: string; method: string }> {
  const out = new Map<string, { path: string; method: string }>();
  const paths = isObject(doc.paths) ? doc.paths : {};
  for (const path of Object.keys(paths)) {
    const item = paths[path];
    if (!isObject(item)) continue;
    for (const method of HTTP_METHODS) {
      if (isObject(item[method])) out.set(`${method.toUpperCase()} ${path}`, { path, method });
    }
  }
  return out;
}

/**
 * Diff two canonicalized documents. Deterministic: the same pair always
 * produces the same divergences in the same order.
 */
export function diffDocuments(from: JsonObject, to: JsonObject): Divergence[] {
  const out: Divergence[] = [];
  const beforePaths = isObject(from.paths) ? from.paths : {};
  const afterPaths = isObject(to.paths) ? to.paths : {};
  const beforeOps = operationIndex(from);
  const afterOps = operationIndex(to);

  for (const key of [...beforeOps.keys()].sort()) {
    if (afterOps.has(key)) continue;
    const { path, method } = beforeOps.get(key)!;
    out.push({
      ruleId: "operation.removed",
      jsonPointer: `/paths/${esc(path)}/${method}`,
      endpoint: path,
      method: method.toUpperCase(),
      side: "operation",
      vars: { endpoint: key },
      before: key,
      after: undefined,
    });
  }
  for (const key of [...afterOps.keys()].sort()) {
    if (beforeOps.has(key)) continue;
    const { path, method } = afterOps.get(key)!;
    out.push({
      ruleId: "operation.added",
      jsonPointer: `/paths/${esc(path)}/${method}`,
      endpoint: path,
      method: method.toUpperCase(),
      side: "operation",
      vars: { endpoint: key },
      before: undefined,
      after: key,
    });
  }
  for (const key of [...afterOps.keys()].sort()) {
    if (!beforeOps.has(key)) continue;
    const { path, method } = afterOps.get(key)!;
    const bItem = beforePaths[path];
    const aItem = afterPaths[path];
    if (!isObject(bItem) || !isObject(aItem)) continue;
    const bOp = bItem[method];
    const aOp = aItem[method];
    if (!isObject(bOp) || !isObject(aOp)) continue;
    diffOperation(path, method, bItem, aItem, bOp, aOp, out);
  }

  /* ---- servers: a removed base URL strands every consumer pointed at it ---- */
  const serverUrls = (doc: JsonObject) =>
    Array.isArray(doc.servers)
      ? doc.servers
          .filter(isObject)
          .map((s) => (typeof s.url === "string" ? s.url : null))
          .filter((u): u is string => u !== null)
      : [];
  const bServers = new Set(serverUrls(from));
  const aServers = new Set(serverUrls(to));
  for (const url of [...bServers].sort()) {
    if (aServers.has(url)) continue;
    out.push({
      ruleId: "server.removed",
      jsonPointer: "/servers",
      side: "operation",
      vars: { url },
      before: url,
      after: undefined,
    });
  }
  for (const url of [...aServers].sort()) {
    if (bServers.has(url)) continue;
    out.push({
      ruleId: "server.added",
      jsonPointer: "/servers",
      side: "operation",
      vars: { url },
      before: undefined,
      after: url,
    });
  }

  return out;
}
