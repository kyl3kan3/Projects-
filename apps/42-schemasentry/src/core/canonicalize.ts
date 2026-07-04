/**
 * src/core/canonicalize.ts
 *
 * Spec canonicalization: YAML/JSON in, a normalized OpenAPI document out —
 * the precondition for meaningful diffs. Part of the OSS engine core.
 *
 * TODO:
 * - [ ] Parse YAML/JSON (yaml + zod guards); accept 3.0.x and 3.1.
 * - [ ] Dereference $refs (json-schema-ref-parser), preserving circular-ref
 *       markers instead of exploding.
 * - [ ] Normalize: sort keys, expand shorthand (type arrays, nullable),
 *       inline allOf where semantics-preserving.
 * - [ ] Spec-health report: completeness score, undocumented-response
 *       warnings, schema-less bodies — surfaced honestly at onboarding.
 */

export interface SpecHealth {
  score: number;
  warnings: string[];
}

export async function canonicalize(_raw: string): Promise<{ doc: unknown; health: SpecHealth }> {
  throw new Error("Not implemented");
}
