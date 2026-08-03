/**
 * src/core/rules.ts
 *
 * The breaking-change ruleset: divergences in, classified findings out.
 *
 * Every rule carries an id, a default level, a reason template, and a `why` —
 * the OpenAPI semantics the change violates. The `why` is not decoration: the
 * product's whole differentiation claim is "honest classification, reviewable,
 * never a black-box AI says risky", so a finding a reviewer disagrees with has
 * to be arguable on the page rather than appealed to support.
 *
 * Levels are assigned from the point of view of the party who has to comply:
 *
 *   - request side → the **caller** complies, so tightening breaks
 *   - response side → the **consumer** parses, so widening breaks
 *
 * Any rule can be promoted or demoted per API through a policy override — the
 * README's "additive enum values are breaking for us" case — or silenced
 * outright with `ignore`. The default corpus errs toward *risky* rather than
 * *breaking* wherever the community genuinely disagrees, because a check that
 * cries wolf gets `continue-on-error` within a week (README, Key Risk 1).
 */

import type { Divergence } from "./diff";
import type { Json } from "./canonicalize";

export type FindingLevel = "breaking" | "risky" | "compatible" | "info";
export type Verdict = "breaking" | "risky" | "compatible";

export interface Rule {
  id: string;
  level: FindingLevel;
  /** Which side of the contract the rule reasons about. */
  side: "request" | "response" | "operation";
  /** Short title with `{var}` slots — becomes the finding's headline. */
  template: string;
  /** The OpenAPI/HTTP semantics being violated. Shown under the headline. */
  why: string;
}

const RULE_LIST: Rule[] = [
  /* ---------------------------------------------------------- operations --- */
  {
    id: "operation.removed",
    level: "breaking",
    side: "operation",
    template: "Removed operation {endpoint}",
    why: "Every consumer calling this path and method now gets 404 or 405. Nothing in the response contract can compensate for an endpoint that no longer exists.",
  },
  {
    id: "operation.added",
    level: "compatible",
    side: "operation",
    template: "Added operation {endpoint}",
    why: "New surface. No existing caller is affected, though consumers will not use it until you tell them it exists.",
  },
  {
    id: "operation.deprecated",
    level: "risky",
    side: "operation",
    template: "Deprecated {endpoint}",
    why: "OpenAPI `deprecated: true` announces intent to remove. Nothing breaks today, but every consumer of this operation now has migration work with no stated deadline.",
  },
  {
    id: "operation.operation-id.changed",
    level: "risky",
    side: "operation",
    template: "Renamed operationId on {endpoint}: {from} → {to}",
    why: "`operationId` is what SDK generators turn into a method name. The HTTP contract is unchanged, but a regenerated client is a source-breaking change for anyone who upgrades it.",
  },
  {
    id: "operation.security.added",
    level: "breaking",
    side: "operation",
    template: "Authentication now required on {endpoint}",
    why: "The operation moved from an empty `security: []` to a non-empty requirement. Unauthenticated callers that worked will get 401.",
  },
  {
    id: "operation.security.removed",
    level: "compatible",
    side: "operation",
    template: "Authentication no longer required on {endpoint}",
    why: "Existing callers still send their credentials and are still accepted. Worth reviewing as a security change even though it breaks nobody.",
  },

  /* ---------------------------------------------------------- parameters --- */
  {
    id: "parameter.required.added",
    level: "breaking",
    side: "request",
    template: "Added required {in} parameter `{name}` to {endpoint}",
    why: "A `required: true` parameter must be present on every request. Callers written against the previous spec do not send it and will be rejected.",
  },
  {
    id: "parameter.optional.added",
    level: "compatible",
    side: "request",
    template: "Added optional {in} parameter `{name}` to {endpoint}",
    why: "Optional parameters may be omitted, so requests that predate it stay valid.",
  },
  {
    id: "parameter.required.removed",
    level: "breaking",
    side: "request",
    template: "Removed required {in} parameter `{name}` from {endpoint}",
    why: "The parameter callers were obliged to send is gone from the contract, so the server no longer promises to honour it. Requests still parse, but the behaviour they were selecting has silently changed — the worst kind of break, because nothing errors.",
  },
  {
    id: "parameter.optional.removed",
    level: "risky",
    side: "request",
    template: "Removed optional {in} parameter `{name}` from {endpoint}",
    why: "Callers that were passing this parameter are now ignored. No error is returned, so the change surfaces as wrong results rather than a failure.",
  },
  {
    id: "parameter.became-required",
    level: "breaking",
    side: "request",
    template: "Parameter `{name}` on {endpoint} is now required",
    why: "Requests that legally omitted an optional parameter are now rejected.",
  },
  {
    id: "parameter.became-optional",
    level: "compatible",
    side: "request",
    template: "Parameter `{name}` on {endpoint} is now optional",
    why: "Relaxing a requirement cannot invalidate a request that already satisfied it.",
  },

  /* -------------------------------------------------------- request body --- */
  {
    id: "request.body.added.required",
    level: "breaking",
    side: "request",
    template: "{endpoint} now requires a request body",
    why: "`requestBody.required: true` where there was no body at all. Existing callers send nothing and will be rejected.",
  },
  {
    id: "request.body.added.optional",
    level: "compatible",
    side: "request",
    template: "{endpoint} accepts an optional request body",
    why: "Bodyless requests remain valid.",
  },
  {
    id: "request.body.removed",
    level: "risky",
    side: "request",
    template: "{endpoint} no longer declares a request body",
    why: "Callers still sending a body are now sending something the contract does not describe. Usually ignored rather than rejected, which makes it a silent behaviour change.",
  },
  {
    id: "request.body.became-required",
    level: "breaking",
    side: "request",
    template: "Request body on {endpoint} is now required",
    why: "`requestBody.required` flipped to true. Requests that omitted the body were valid and are not any more.",
  },
  {
    id: "request.body.became-optional",
    level: "compatible",
    side: "request",
    template: "Request body on {endpoint} is now optional",
    why: "Every request that previously carried a body still does.",
  },
  {
    id: "request.content-type.removed",
    level: "breaking",
    side: "request",
    template: "{endpoint} no longer accepts `{mediaType}`",
    why: "The media type is gone from `requestBody.content`, so callers sending that Content-Type get 415 Unsupported Media Type.",
  },
  {
    id: "request.content-type.added",
    level: "compatible",
    side: "request",
    template: "{endpoint} also accepts `{mediaType}`",
    why: "An additional accepted encoding. Existing Content-Types are untouched.",
  },

  /* ----------------------------------------------------------- responses --- */
  {
    id: "response.success-status.removed",
    level: "breaking",
    side: "response",
    template: "Removed {status} response from {endpoint}",
    why: "A success status consumers branch on can no longer occur. Client code that treats it as the happy path will fall through to its error handling.",
  },
  {
    id: "response.error-status.removed",
    level: "risky",
    side: "response",
    template: "Removed {status} response from {endpoint}",
    why: "An error condition consumers may handle specifically is no longer declared. Their handling becomes dead code, and whatever replaced it is now undocumented.",
  },
  {
    id: "response.success-status.added",
    level: "risky",
    side: "response",
    template: "Added {status} response to {endpoint}",
    why: "A second success shape. Consumers matching only the original status will treat this as unexpected — the classic cause of a partner integration failing on a code path that ships months later.",
  },
  {
    id: "response.error-status.added",
    level: "compatible",
    side: "response",
    template: "Added {status} response to {endpoint}",
    why: "Newly documented error condition. Well-behaved clients already treat unknown 4xx/5xx as failure.",
  },
  {
    id: "response.content-type.removed",
    level: "breaking",
    side: "response",
    template: "{status} on {endpoint} no longer returns `{mediaType}`",
    why: "Consumers sending `Accept: {mediaType}` will get 406, or a body their parser cannot read.",
  },
  {
    id: "response.content-type.added",
    level: "compatible",
    side: "response",
    template: "{status} on {endpoint} can also return `{mediaType}`",
    why: "Content negotiation gained an option. Existing Accept headers still resolve as before.",
  },
  {
    id: "response.header.removed",
    level: "breaking",
    side: "response",
    template: "Removed response header `{name}` from {status} on {endpoint}",
    why: "Declared response headers are part of the contract — pagination cursors and rate-limit counters live there. Consumers reading it now read undefined.",
  },
  {
    id: "response.header.added",
    level: "compatible",
    side: "response",
    template: "Added response header `{name}` to {status} on {endpoint}",
    why: "Extra headers are ignored by consumers that do not know about them.",
  },

  /* ------------------------------------------------------ schema: fields --- */
  {
    id: "request.property.added.required",
    level: "breaking",
    side: "request",
    template: "Added required request property `{field}`",
    why: "A property listed in `required` must be present. Payloads built against the previous spec omit it and will fail validation.",
  },
  {
    id: "request.property.added.optional",
    level: "compatible",
    side: "request",
    template: "Added optional request property `{field}`",
    why: "Optional properties may be absent, so existing payloads stay valid.",
  },
  {
    id: "request.property.removed",
    level: "risky",
    side: "request",
    template: "Removed request property `{field}`",
    why: "Callers still sending the property are now sending something undescribed. Most servers ignore it, so intent is lost without an error — verify the value is not still needed.",
  },
  {
    id: "request.property.required.added",
    level: "breaking",
    side: "request",
    template: "Request property `{field}` is now required",
    why: "The property moved into `required`. Payloads that legally omitted it are rejected.",
  },
  {
    id: "request.property.required.removed",
    level: "compatible",
    side: "request",
    template: "Request property `{field}` is now optional",
    why: "Relaxing `required` cannot invalidate a payload that already included the property.",
  },
  {
    id: "response.property.removed",
    level: "breaking",
    side: "response",
    template: "Removed response field `{field}`",
    why: "Consumers reading this field get undefined. This is the single most common cause of a partner integration breaking after a deploy.",
  },
  {
    id: "response.property.added",
    level: "compatible",
    side: "response",
    template: "Added response field `{field}` ({types})",
    why: "Additive response fields are ignored by consumers that do not know about them, provided they do not validate strictly.",
  },
  {
    id: "response.property.required.removed",
    level: "breaking",
    side: "response",
    template: "Response field `{field}` is no longer guaranteed",
    why: "The field left `required`, so it may now be absent. Consumers that read it unconditionally will see undefined on some responses and not others — an intermittent break, which is worse than a clean one.",
  },
  {
    id: "response.property.required.added",
    level: "compatible",
    side: "response",
    template: "Response field `{field}` is now always present",
    why: "A stronger guarantee. Consumers already handled it being present.",
  },

  /* ------------------------------------------------------- schema: types --- */
  {
    id: "request.type.narrowed",
    level: "breaking",
    side: "request",
    template: "Narrowed request type of `{field}`: {from} → {to}",
    why: "The set of accepted JSON types shrank. Values callers were allowed to send are now rejected.",
  },
  {
    id: "request.type.widened",
    level: "compatible",
    side: "request",
    template: "Widened request type of `{field}`: {from} → {to}",
    why: "More types accepted. Everything valid before is still valid.",
  },
  {
    id: "request.type.changed",
    level: "breaking",
    side: "request",
    template: "Changed request type of `{field}`: {from} → {to}",
    why: "The accepted type is disjoint from what it was. Every existing caller sends the wrong type.",
  },
  {
    id: "response.type.widened",
    level: "breaking",
    side: "response",
    template: "Widened response type of `{field}`: {from} → {to}",
    why: "The field can now hold types the consumer's parser was never written for. In a typed client this is a deserialization failure, not a soft warning.",
  },
  {
    id: "response.type.narrowed",
    level: "compatible",
    side: "response",
    template: "Narrowed response type of `{field}`: {from} → {to}",
    why: "Fewer possible types. Any consumer handling the wider set still handles this.",
  },
  {
    id: "response.type.changed",
    level: "breaking",
    side: "response",
    template: "Changed response type of `{field}`: {from} → {to}",
    why: "The returned type is disjoint from what consumers parse.",
  },
  {
    id: "request.nullable.added",
    level: "compatible",
    side: "request",
    template: "Request field `{field}` now accepts null",
    why: "Callers may keep sending non-null values.",
  },
  {
    id: "request.nullable.removed",
    level: "breaking",
    side: "request",
    template: "Request field `{field}` no longer accepts null",
    why: "`null` left the accepted type union. Callers explicitly sending null — a normal way to clear a value — are now rejected.",
  },
  {
    id: "response.nullable.added",
    level: "breaking",
    side: "response",
    template: "Response field `{field}` can now be null",
    why: "Consumers that dereference this field without a null check will throw. Nullability is the most under-noticed breaking change in a spec diff because the field name never moves.",
  },
  {
    id: "response.nullable.removed",
    level: "compatible",
    side: "response",
    template: "Response field `{field}` is no longer null",
    why: "A stronger guarantee; null handling on the consumer side becomes dead code.",
  },

  /* ------------------------------------------------------- schema: enums --- */
  {
    id: "request.enum.value-removed",
    level: "breaking",
    side: "request",
    template: "Removed accepted value `{value}` from `{field}`",
    why: "The value left the request `enum`, so a caller sending it fails validation.",
  },
  {
    id: "request.enum.value-added",
    level: "compatible",
    side: "request",
    template: "Added accepted value `{value}` to `{field}`",
    why: "A larger accepted set. Existing values still validate. Promote this rule in your policy if your consumers pin the accepted set.",
  },
  {
    id: "response.enum.value-removed",
    level: "breaking",
    side: "response",
    template: "Removed enum value `{value}` from `{field}`",
    why: "Consumers branching on this value lose a case, and whatever the API returns instead is a value their closed enum type cannot deserialize. The behaviour it represented did not disappear — it moved somewhere undocumented.",
  },
  {
    id: "response.enum.value-added",
    level: "risky",
    side: "response",
    template: "Added enum value `{value}` to `{field}`",
    why: "A consumer with an exhaustive switch or a generated closed enum hits a value it has never seen. Nothing fails in your tests; it fails in theirs.",
  },
  {
    id: "request.enum.constrained",
    level: "breaking",
    side: "request",
    template: "Request field `{field}` is now restricted to {values}",
    why: "A previously free-form field gained an `enum`. Any other value callers were sending is now rejected.",
  },
  {
    id: "request.enum.unconstrained",
    level: "compatible",
    side: "request",
    template: "Request field `{field}` accepts any value",
    why: "The `enum` was dropped, so previously valid values remain valid.",
  },
  {
    id: "response.enum.constrained",
    level: "compatible",
    side: "response",
    template: "Response field `{field}` is now restricted to {values}",
    why: "A narrower promise about what can come back. Consumers handling the free-form field already cope.",
  },
  {
    id: "response.enum.unconstrained",
    level: "breaking",
    side: "response",
    template: "Response field `{field}` is no longer a closed set",
    why: "The `enum` was dropped from a response field, so any string can now appear. Generated clients typed this as an enum and will fail to deserialize.",
  },

  /* ------------------------------------------------- schema: constraints --- */
  {
    id: "request.constraint.tightened",
    level: "breaking",
    side: "request",
    template: "Tightened {constraint} on `{field}`: {from} → {to}",
    why: "Values inside the old bound are outside the new one, so requests that validated no longer do.",
  },
  {
    id: "request.constraint.loosened",
    level: "compatible",
    side: "request",
    template: "Loosened {constraint} on `{field}`: {from} → {to}",
    why: "A wider accepted range. Everything valid before is still valid.",
  },
  {
    id: "request.pattern.added",
    level: "breaking",
    side: "request",
    template: "Added pattern constraint on `{field}`",
    why: "A `pattern` regex now applies where none did. Any value not matching `{pattern}` is rejected.",
  },
  {
    id: "request.pattern.removed",
    level: "compatible",
    side: "request",
    template: "Removed pattern constraint on `{field}`",
    why: "Dropping a regex can only widen what validates.",
  },
  {
    id: "request.pattern.changed",
    level: "risky",
    side: "request",
    template: "Changed pattern on `{field}`",
    why: "Regexes are not comparable for containment in general, so the engine cannot prove whether this widens or narrows. Review it: `{from}` → `{to}`.",
  },
  {
    id: "request.format.changed",
    level: "risky",
    side: "request",
    template: "Changed request format of `{field}`: {from} → {to}",
    why: "`format` is an annotation many validators enforce. Whether existing values still pass depends on the validator, so this needs a human.",
  },
  {
    id: "response.format.changed",
    level: "risky",
    side: "response",
    template: "Changed response format of `{field}`: {from} → {to}",
    why: "Consumers commonly parse by format — `date-time` into a Date, `int64` into a big integer. A different format means a different wire encoding for the same field name.",
  },
  {
    id: "request.additional-properties.closed",
    level: "breaking",
    side: "request",
    template: "Request object `{field}` no longer accepts extra properties",
    why: "`additionalProperties: false` rejects any key not explicitly declared. Callers sending forward-compatible extras are now rejected wholesale.",
  },
  {
    id: "request.additional-properties.opened",
    level: "compatible",
    side: "request",
    template: "Request object `{field}` now accepts extra properties",
    why: "Strictness was relaxed; every payload that validated still does.",
  },
  {
    id: "response.additional-properties.closed",
    level: "compatible",
    side: "response",
    template: "Response object `{field}` no longer includes extra properties",
    why: "A narrower promise about the response body.",
  },
  {
    id: "response.additional-properties.opened",
    level: "risky",
    side: "response",
    template: "Response object `{field}` may now include extra properties",
    why: "Consumers validating responses strictly (a common contract-test pattern) will start failing on keys they have never seen.",
  },
  {
    id: "request.combinator.branch-removed",
    level: "breaking",
    side: "request",
    template: "Removed a {combinator} branch on `{field}` ({from} → {to})",
    why: "One of the accepted shapes is gone. Callers sending it no longer validate.",
  },
  {
    id: "request.combinator.branch-added",
    level: "compatible",
    side: "request",
    template: "Added a {combinator} branch on `{field}` ({from} → {to})",
    why: "An additional accepted shape.",
  },
  {
    id: "response.combinator.branch-removed",
    level: "compatible",
    side: "response",
    template: "Removed a {combinator} branch on `{field}` ({from} → {to})",
    why: "One fewer shape can come back.",
  },
  {
    id: "response.combinator.branch-added",
    level: "risky",
    side: "response",
    template: "Added a {combinator} branch on `{field}` ({from} → {to})",
    why: "A new response shape consumers have never parsed. Whether it breaks them depends on how their deserializer handles an unmatched variant.",
  },

  /* ------------------------------------------------------------- servers --- */
  {
    id: "server.removed",
    level: "risky",
    side: "operation",
    template: "Removed server `{url}`",
    why: "Consumers with this base URL hardcoded — which is most of them — lose their target. Nothing in the schema changed, so a schema-only diff would miss it entirely.",
  },
  {
    id: "server.added",
    level: "compatible",
    side: "operation",
    template: "Added server `{url}`",
    why: "An additional base URL. Existing ones still resolve.",
  },
];

export const RULES: ReadonlyMap<string, Rule> = new Map(RULE_LIST.map((r) => [r.id, r]));

/** The taxonomy, for the docs page and the policy editor. */
export function allRules(): Rule[] {
  return [...RULE_LIST].sort((a, b) => a.id.localeCompare(b.id));
}

/* ------------------------------------------------------------------- policy */

export type PolicyLevel = FindingLevel | "ignore";

export interface Policy {
  /** ruleId → level, or "ignore" to drop the finding entirely. */
  overrides: Record<string, PolicyLevel>;
  /** The level at which `schemasentry check` exits non-zero. */
  failOn: "breaking" | "risky";
}

export const DEFAULT_POLICY: Policy = { overrides: {}, failOn: "breaking" };

export function normalizePolicy(raw: unknown): Policy {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_POLICY };
  const value = raw as Record<string, unknown>;
  const overrides: Record<string, PolicyLevel> = {};
  const rawOverrides = value.overrides;
  if (typeof rawOverrides === "object" && rawOverrides !== null) {
    for (const [id, level] of Object.entries(rawOverrides as Record<string, unknown>)) {
      if (!RULES.has(id)) continue; // a rule the engine dropped: ignore silently
      if (level === "breaking" || level === "risky" || level === "compatible" || level === "info" || level === "ignore") {
        overrides[id] = level;
      }
    }
  }
  const failOn = value.failOn === "risky" ? "risky" : "breaking";
  return { overrides, failOn };
}

/* -------------------------------------------------------------- mini-diffs */

export interface DiffLine {
  kind: "ctx" | "del" | "add";
  text: string;
}

function renderLines(value: Json | undefined): string[] {
  if (value === undefined) return [];
  const json = JSON.stringify(value, null, 2) ?? "null";
  return json.split("\n");
}

const MAX_LINES = 7;

/**
 * The finding's excerpt — never a full-file dump (DESIGN.md: "the finding is
 * the excerpt"). Removed lines come out as `del`, added as `add`, unchanged
 * surrounding structure as `ctx`, and the whole thing is capped so a big
 * schema cannot push the card off the screen.
 */
export function miniDiff(d: Divergence): DiffLine[] {
  const before = renderLines(d.before);
  const after = renderLines(d.after);
  const beforeSet = new Set(before);
  const afterSet = new Set(after);

  const lines: DiffLine[] = [];
  for (const text of before) lines.push({ kind: afterSet.has(text) ? "ctx" : "del", text });
  for (const text of after) if (!beforeSet.has(text)) lines.push({ kind: "add", text });

  if (lines.length <= MAX_LINES) return lines;

  // Keep every changed line (capped), then the first and last context lines so
  // the excerpt still reads as a fragment of a structure.
  const changed = lines.filter((l) => l.kind !== "ctx").slice(0, MAX_LINES - 2);
  const firstCtx = lines.find((l) => l.kind === "ctx");
  const lastCtx = [...lines].reverse().find((l) => l.kind === "ctx");
  const out: DiffLine[] = [];
  if (firstCtx) out.push(firstCtx);
  out.push(...changed);
  if (lastCtx && lastCtx !== firstCtx) out.push({ kind: "ctx", text: lastCtx.text });
  return out;
}

/* ------------------------------------------------------------- classifying */

export interface Finding {
  ruleId: string;
  level: FindingLevel;
  /** Default level before policy — so the UI can show "demoted by policy". */
  defaultLevel: FindingLevel;
  jsonPointer: string;
  endpoint: string | null;
  method: string | null;
  side: "request" | "response" | "operation";
  fieldPath: string | null;
  message: string;
  why: string;
  diffLines: DiffLine[];
  vars: Record<string, string>;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => vars[key] ?? `{${key}}`);
}

/** Divergences in, findings out, with the API's policy applied. */
export function classify(divergences: Divergence[], policy: Policy = DEFAULT_POLICY): Finding[] {
  const out: Finding[] = [];
  for (const d of divergences) {
    const rule = RULES.get(d.ruleId);
    if (!rule) continue; // an engine upgrade removed the rule; drop it quietly
    const override = policy.overrides[rule.id];
    if (override === "ignore") continue;
    out.push({
      ruleId: rule.id,
      level: override ?? rule.level,
      defaultLevel: rule.level,
      jsonPointer: d.jsonPointer,
      endpoint: d.endpoint ?? null,
      method: d.method ?? null,
      side: rule.side,
      fieldPath: d.fieldPath ?? null,
      message: fill(rule.template, d.vars),
      why: fill(rule.why, d.vars),
      diffLines: miniDiff(d),
      vars: d.vars,
    });
  }
  return sortFindings(out);
}

const LEVEL_ORDER: Record<FindingLevel, number> = { breaking: 0, risky: 1, compatible: 2, info: 3 };

/** breaking → risky → compatible → info, then by endpoint, then by pointer. */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const byLevel = LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level];
    if (byLevel !== 0) return byLevel;
    const byEndpoint = (a.endpoint ?? "").localeCompare(b.endpoint ?? "");
    if (byEndpoint !== 0) return byEndpoint;
    return a.jsonPointer.localeCompare(b.jsonPointer);
  });
}

export interface DiffSummary {
  breaking: number;
  risky: number;
  compatible: number;
  info: number;
  total: number;
}

export function summarize(findings: Finding[]): DiffSummary {
  const s: DiffSummary = { breaking: 0, risky: 0, compatible: 0, info: 0, total: findings.length };
  for (const f of findings) s[f.level] += 1;
  return s;
}

/**
 * Roll the findings up to one word. `info` never contributes: it is the level
 * an acknowledged finding is demoted to, and the whole point of an ack is that
 * the verdict stops counting it.
 */
export function rollUp(findings: Finding[]): Verdict {
  if (findings.some((f) => f.level === "breaking")) return "breaking";
  if (findings.some((f) => f.level === "risky")) return "risky";
  return "compatible";
}

/** Does this verdict fail the CI check under this policy? */
export function failsCheck(verdict: Verdict, policy: Policy): boolean {
  if (policy.failOn === "risky") return verdict === "breaking" || verdict === "risky";
  return verdict === "breaking";
}
