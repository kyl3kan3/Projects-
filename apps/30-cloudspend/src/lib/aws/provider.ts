/**
 * The cloud provider seam.
 *
 * There is no AWS credential in a development or CI environment, so every AWS
 * call sits behind this narrow interface with two implementations: the real one
 * (`real.ts`, AWS SDK v3 + sts:AssumeRole) and a deterministic synthetic one
 * (`demo.ts`). The synthetic one is selected automatically when no platform AWS
 * credential is configured, which means the entire pipeline around the call —
 * normalisation, baselines, detection, correlation, budgets, digests, waste
 * ranking, alert dedupe — is exercisable end to end without AWS.
 *
 * Accounts fed by the synthetic provider store `provider = "demo"` and every
 * screen that shows their numbers says so. Nothing here ever presents synthetic
 * figures as a real bill.
 */

import type { AwsAccount, WasteKind } from "@/db/schema";
import { env } from "@/lib/env";

/** One normalised cost line, ready to become a `cost_facts` row. */
export interface CostLine {
  /** Start of the hour (or day, at daily grain), UTC. */
  ts: Date;
  service: string;
  region: string;
  usageType: string;
  amountMicros: number;
  tags?: Record<string, string>;
  resourceId?: string | null;
}

/** A contributor to an anomaly: usage type or resource, dollar-ranked. */
export interface ContributorLine {
  label: string;
  detail: string;
  amountMicros: number;
}

export interface WasteCandidate {
  kind: WasteKind;
  /** Stable per resource/group, so a rescan updates rather than duplicates. */
  resourceKey: string;
  title: string;
  remedy: string;
  region: string;
  evidence: string;
  resourceCount: number;
  estMonthlySavingMicros: number;
}

export interface CostQuery {
  start: Date;
  /** Exclusive. */
  end: Date;
  granularity: "hour" | "day";
}

export type VerifyResult =
  | { ok: true; accountId: string; regions: string[] }
  | { ok: false; error: string };

export interface CloudProvider {
  readonly kind: "aws" | "demo";
  /** Assume the role and confirm the identity + external id actually work. */
  verify(account: AwsAccount): Promise<VerifyResult>;
  fetchCosts(account: AwsAccount, query: CostQuery): Promise<CostLine[]>;
  /** Top usage types / resources inside one service+region window. */
  fetchContributors(
    account: AwsAccount,
    opts: { service: string; region: string; start: Date; end: Date },
  ): Promise<ContributorLine[]>;
  fetchWaste(account: AwsAccount): Promise<WasteCandidate[]>;
  /** CUR objects under the configured bucket/prefix, newest first. */
  listCurObjects(account: AwsAccount): Promise<Array<{ key: string; size: number }>>;
  /** The raw CUR CSV for one object (gzip is transparently decoded). */
  fetchCurObject(account: AwsAccount, key: string): Promise<string>;
}

/**
 * Pick an implementation. `demo` accounts always get the synthetic feed even if
 * a real credential is present, so a demo account can never quietly start
 * charging Cost Explorer requests against someone's bill.
 */
export async function providerFor(account: AwsAccount): Promise<CloudProvider> {
  if (account.provider === "demo" || !env.awsConfigured) {
    const { demoProvider } = await import("./demo");
    return demoProvider;
  }
  const { awsProvider } = await import("./real");
  return awsProvider;
}

/** Which provider a *new* account will use, before it exists. */
export function defaultProviderKind(): "aws" | "demo" {
  return env.awsConfigured ? "aws" : "demo";
}
