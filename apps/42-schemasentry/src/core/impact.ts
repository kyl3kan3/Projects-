/**
 * src/core/impact.ts
 *
 * Consumer-aware verdicts — the product's second differentiator. A generic
 * diff says "you removed an enum value"; intersecting it with the registry
 * says "this breaks Acme's webhook handler, which reads `order.status` and
 * branches on `cancelled`". That sentence is the one an engineer forwards to
 * their PM verbatim, so the matching has to be precise and, when it cannot be
 * precise, honest about it.
 *
 * Matching is deliberately conservative:
 *
 *  - A consumer with **no declared usage** is never reported as impacted. A
 *    registry row nobody filled in must not manufacture blast radius.
 *  - A consumer that declared endpoints but no fields is impacted by anything
 *    touching those endpoints, and the reason says so — "uses GET /v1/orders"
 *    rather than a fabricated field-level claim.
 *  - Field paths match on a **suffix**, so `status` matches `items.status` and
 *    `data.order.status` matches `order.status`, but `items.status` does not
 *    match `customer.status`.
 */

import type { Finding, Verdict } from "./rules";

export interface DeclaredUsage {
  /** `"GET /v1/orders"`. The method is required — a path alone is ambiguous. */
  endpoints: string[];
  /** Dotted field paths: `order.status`, `items[].total_cents`, or bare `status`. */
  fields: string[];
  /** Enum values the consumer branches on: `cancelled`, `refunded`. */
  enumValues: string[];
}

export const EMPTY_USAGE: DeclaredUsage = { endpoints: [], fields: [], enumValues: [] };

export function normalizeUsage(raw: unknown): DeclaredUsage {
  const value = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown): string[] =>
    Array.isArray(v)
      ? [...new Set(v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean))].sort()
      : [];
  return { endpoints: list(value.endpoints), fields: list(value.fields), enumValues: list(value.enumValues) };
}

export function usageIsEmpty(u: DeclaredUsage): boolean {
  return u.endpoints.length === 0 && u.fields.length === 0 && u.enumValues.length === 0;
}

/** `GET /v1/orders` → `{ method: "GET", path: "/v1/orders" }`. */
function parseEndpoint(spec: string): { method: string; path: string } | null {
  const m = /^\s*([A-Za-z]+)\s+(\/\S*)\s*$/.exec(spec);
  if (!m) return null;
  return { method: m[1].toUpperCase(), path: m[2] };
}

/**
 * Split a field path into comparable segments.
 *
 * Array traversal is spelled three ways in practice — `items[].status` from the
 * diff walk, `items.0.status` from a generated test's accessor, and
 * `items.status` from a human typing into the registry — and all three mean the
 * same field. Both the `[]` marker and bare numeric indices are dropped so they
 * compare equal; without this a contract assertion on `data.0.status` never
 * matches a finding on `data[].status` and staleness detection silently returns
 * nothing.
 */
function fieldSegments(path: string): string[] {
  return path
    .toLowerCase()
    .replace(/\[\d*\]/g, "")
    .split(".")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^\d+$/.test(s));
}

/** True when one segment list is a suffix of the other. */
export function fieldMatches(declared: string, found: string): boolean {
  const d = fieldSegments(declared);
  const f = fieldSegments(found);
  if (d.length === 0 || f.length === 0) return false;
  const [shortSeg, longSeg] = d.length <= f.length ? [d, f] : [f, d];
  const offset = longSeg.length - shortSeg.length;
  return shortSeg.every((seg, i) => longSeg[offset + i] === seg);
}

/** Strip the JSON quoting `short()` leaves on a string enum value. */
function bareValue(v: string | undefined): string | null {
  if (!v) return null;
  const trimmed = v.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export interface ImpactDetail {
  /** Index into the findings array the impact was computed from. */
  findingIndex: number;
  ruleId: string;
  level: Finding["level"];
  message: string;
  /** Why this consumer, in the consumer's own declared terms. */
  reason: string;
}

export interface ConsumerImpactResult {
  consumerId: string;
  name: string;
  impacted: boolean;
  /** The worst level among matched findings, or null when nothing matched. */
  worst: Verdict | null;
  details: ImpactDetail[];
  /** Set when the consumer has nothing declared, so the UI can say so. */
  undeclared: boolean;
}

export interface ConsumerRecord {
  id: string;
  name: string;
  declaredUsage: DeclaredUsage;
}

/**
 * Intersect a diff's findings with each consumer's declared usage.
 *
 * `impacted` counts only breaking and risky findings: a consumer is not
 * "impacted" by a compatible change even when it lands squarely on a field
 * they read, and saying otherwise would train people to ignore the column.
 */
export function computeImpact(
  findings: Finding[],
  consumers: ConsumerRecord[],
): ConsumerImpactResult[] {
  return consumers.map((consumer) => {
    const usage = consumer.declaredUsage;
    const undeclared = usageIsEmpty(usage);
    if (undeclared) {
      return { consumerId: consumer.id, name: consumer.name, impacted: false, worst: null, details: [], undeclared: true };
    }

    const declaredEndpoints = usage.endpoints
      .map(parseEndpoint)
      .filter((e): e is { method: string; path: string } => e !== null);

    const details: ImpactDetail[] = [];

    findings.forEach((finding, findingIndex) => {
      if (finding.level === "info") return;

      const reasons: string[] = [];

      // Does the finding land on an endpoint this consumer named? A finding
      // with no endpoint (a removed server, say) reaches every consumer.
      const endpointHit =
        finding.endpoint === null
          ? declaredEndpoints.length > 0
          : declaredEndpoints.some(
              (e) => e.path === finding.endpoint && e.method === (finding.method ?? "").toUpperCase(),
            );

      const matchedField = finding.fieldPath
        ? usage.fields.find((declared) => fieldMatches(declared, finding.fieldPath!))
        : undefined;

      const value = bareValue(finding.vars.value);
      const matchedEnum =
        value !== null && usage.enumValues.some((v) => v.toLowerCase() === value.toLowerCase())
          ? value
          : undefined;

      if (endpointHit && finding.endpoint !== null) {
        if (matchedField) reasons.push(`declares \`${matchedField}\` on ${finding.method} ${finding.endpoint}`);
        else if (!finding.fieldPath) reasons.push(`calls ${finding.method} ${finding.endpoint}`);
        else if (usage.fields.length === 0) reasons.push(`calls ${finding.method} ${finding.endpoint}`);
      } else if (endpointHit && finding.endpoint === null) {
        reasons.push("integrates against this API's declared servers");
      } else if (matchedField && declaredEndpoints.length === 0) {
        // Fields declared without endpoints: still a real, if broader, claim.
        reasons.push(`declares \`${matchedField}\``);
      }

      if (matchedEnum && (endpointHit || declaredEndpoints.length === 0)) {
        reasons.push(`branches on \`${matchedEnum}\``);
      }

      if (reasons.length === 0) return;
      details.push({
        findingIndex,
        ruleId: finding.ruleId,
        level: finding.level,
        message: finding.message,
        reason: reasons.join(" and "),
      });
    });

    const worst: Verdict | null = details.some((d) => d.level === "breaking")
      ? "breaking"
      : details.some((d) => d.level === "risky")
        ? "risky"
        : details.length > 0
          ? "compatible"
          : null;

    return {
      consumerId: consumer.id,
      name: consumer.name,
      impacted: worst === "breaking" || worst === "risky",
      worst,
      details,
      undeclared: false,
    };
  });
}

/** `12 ENDPOINTS · 41 FIELDS` — the consumer row's mono count in DESIGN.md. */
export function usageSummary(u: DeclaredUsage): string {
  const parts = [
    `${u.endpoints.length} ENDPOINT${u.endpoints.length === 1 ? "" : "S"}`,
    `${u.fields.length} FIELD${u.fields.length === 1 ? "" : "S"}`,
  ];
  if (u.enumValues.length > 0) {
    parts.push(`${u.enumValues.length} VALUE${u.enumValues.length === 1 ? "" : "S"}`);
  }
  return parts.join(" · ");
}

/** "Breaks: Acme webhooks · iOS app" — the finding card's impact row. */
export function impactedNamesForFinding(
  impacts: ConsumerImpactResult[],
  findingIndex: number,
): string[] {
  return impacts
    .filter((i) => i.details.some((d) => d.findingIndex === findingIndex && (d.level === "breaking" || d.level === "risky")))
    .map((i) => i.name);
}
