/**
 * src/core/diff.ts
 *
 * The semantic diff walk: two canonical documents in, findings out. The
 * heart of the OSS engine core — pure, deterministic, benchmarked.
 *
 * TODO:
 * - [ ] Walk operations (path + method), parameters, request bodies,
 *       responses, content types, headers.
 * - [ ] Schema comparison: type changes, required-ness, nullability, enum
 *       membership, additionalProperties, format, numeric bounds.
 * - [ ] Emit divergences with exact JSON-pointer paths + before/after
 *       excerpt lines (the mini-diff data).
 * - [ ] Direction-aware semantics: request tightening breaks callers,
 *       response narrowing breaks consumers — never a naive symmetric diff.
 * - [ ] ENGINE_VERSION stamped on every result; fixture pairs drive tests.
 */

export const ENGINE_VERSION = "0.1.0";

export interface Divergence {
  jsonPointer: string;
  endpoint?: string;
  method?: string;
  kind: string;
  before?: unknown;
  after?: unknown;
}

export function diffDocuments(_from: unknown, _to: unknown): Divergence[] {
  throw new Error("Not implemented");
}
