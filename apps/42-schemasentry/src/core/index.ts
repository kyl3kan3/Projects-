/**
 * src/core/index.ts
 *
 * The engine's public surface — one function that takes two raw specs and
 * returns everything a verdict needs. The CLI's offline `diff`, the API's
 * `push` pipeline, and the synchronous `check` endpoint all call this, so
 * there is exactly one code path that can produce a verdict and it is the one
 * the tests exercise.
 */

import { canonicalize, type CanonicalResult, type JsonObject } from "./canonicalize";
import { diffDocuments, ENGINE_VERSION, type Divergence } from "./diff";
import {
  classify,
  failsCheck,
  normalizePolicy,
  rollUp,
  summarize,
  type DiffSummary,
  type Finding,
  type Policy,
  type Verdict,
} from "./rules";
import { computeImpact, type ConsumerImpactResult, type ConsumerRecord } from "./impact";

export * from "./canonicalize";
export * from "./diff";
export * from "./rules";
export * from "./impact";
export * from "./changelog";
export * from "./contract-tests";

export interface DiffResult {
  engineVersion: string;
  verdict: Verdict;
  summary: DiffSummary;
  findings: Finding[];
  divergences: Divergence[];
  impacts: ConsumerImpactResult[];
  /** True when this verdict should fail CI under the supplied policy. */
  fails: boolean;
}

/** Diff two already-canonical documents. */
export function diffCanonical(
  from: JsonObject,
  to: JsonObject,
  policy: Policy,
  consumers: ConsumerRecord[] = [],
): DiffResult {
  const divergences = diffDocuments(from, to);
  const findings = classify(divergences, policy);
  const verdict = rollUp(findings);
  return {
    engineVersion: ENGINE_VERSION,
    verdict,
    summary: summarize(findings),
    findings,
    divergences,
    impacts: computeImpact(findings, consumers),
    fails: failsCheck(verdict, policy),
  };
}

export interface RawDiffResult extends DiffResult {
  from: CanonicalResult;
  to: CanonicalResult;
}

/** Canonicalize both sides, then diff. Throws `SpecParseError` on bad input. */
export async function diffRaw(
  rawFrom: string,
  rawTo: string,
  policyInput: unknown = undefined,
  consumers: ConsumerRecord[] = [],
): Promise<RawDiffResult> {
  const policy = normalizePolicy(policyInput);
  const [from, to] = await Promise.all([canonicalize(rawFrom), canonicalize(rawTo)]);
  return { ...diffCanonical(from.doc, to.doc, policy, consumers), from, to };
}

export { ENGINE_VERSION };
