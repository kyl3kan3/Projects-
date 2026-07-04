/**
 * src/core/rules.ts
 *
 * The breaking-change ruleset: divergences in, classified findings out.
 * Every rule has an id, a level (breaking | risky | compatible | info), a
 * human-readable reason template, and fixture pairs. Policy overrides can
 * promote/demote rules per API.
 *
 * TODO:
 * - [ ] The 30-50 rule corpus (removed operation, removed enum value,
 *       added required request property, narrowed response type, removed
 *       status code, content-type removal, ...).
 * - [ ] classify(divergences, policy): apply rules + overrides, roll up
 *       the verdict (any breaking -> breaking).
 * - [ ] Reason templates cite the OpenAPI semantics violated — reviewable,
 *       never a black box.
 * - [ ] Rule docs generated from this file (the taxonomy is content).
 */

export type FindingLevel = "breaking" | "risky" | "compatible" | "info";

export interface Finding {
  ruleId: string;
  level: FindingLevel;
  jsonPointer: string;
  message: string;
}

export function classify(_divergences: unknown[], _policy?: unknown): Finding[] {
  throw new Error("Not implemented");
}
