/**
 * src/core/contract-tests.ts
 *
 * Contract-suite generation: emit runnable Vitest/Jest suites asserting the
 * shapes consumers depend on (status codes, required fields, enum
 * membership, nullability), phrased from the consumer's perspective.
 *
 * TODO:
 * - [ ] generateSuite(deploy, consumer?): walk declared usage (or full
 *       spec) -> test file source as a string.
 * - [ ] Drift-aware regeneration: diff against a customized copy and mark
 *       drift rather than overwriting.
 * - [ ] Stale flagging: when a diff lands, name the exact assertions that
 *       would now fail.
 */

export interface SuiteOptions {
  framework: "vitest" | "jest";
}

export function generateSuite(_deploy: unknown, _options: SuiteOptions): string {
  throw new Error("Not implemented");
}
