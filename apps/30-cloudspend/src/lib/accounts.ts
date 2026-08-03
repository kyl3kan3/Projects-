/**
 * Connecting an AWS account — the five-minute path from ROADMAP phase 1.
 *
 * The shape:
 *
 * 1. We mint a unique external id and show a CloudFormation quick-create link
 *    plus the exact policy the stack will create (`aws/policy.ts`).
 * 2. The customer creates the stack and confirms. We `sts:AssumeRole` to check
 *    the round trip actually works before claiming the account is connected —
 *    "connected" that turns out to mean "we never tried" is the worst possible
 *    onboarding bug for a product whose pitch is trust.
 * 3. On success we backfill three months of Cost Explorer history so the
 *    dashboard is useful immediately rather than in a fortnight.
 *
 * With no platform AWS credential the synthetic provider is used, the account is
 * stored with `provider = "demo"`, and every surface says so.
 */

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { awsAccounts, deploys, type AwsAccount, type Org } from "@/db/schema";
import { env } from "@/lib/env";
import { canAddAccount, accountLimitMessage } from "@/lib/plans";
import {
  accountIdFromRoleArn,
  expectedRoleArn,
  formatExternalId,
  parseAccountId,
  quickCreateUrl,
} from "@/lib/aws/policy";
import { defaultProviderKind, providerFor } from "@/lib/aws/provider";
import { backfillAccount } from "@/lib/ingestion";
import { demoDeploys } from "@/lib/aws/demo";

export async function listAccounts(orgId: string): Promise<AwsAccount[]> {
  const db = getDb();
  return db
    .select()
    .from(awsAccounts)
    .where(eq(awsAccounts.orgId, orgId))
    .orderBy(awsAccounts.createdAt);
}

export async function verifiedAccounts(orgId: string): Promise<AwsAccount[]> {
  return (await listAccounts(orgId)).filter((a) => a.connectStatus === "verified");
}

export async function getAccount(orgId: string, id: string): Promise<AwsAccount | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(awsAccounts)
    .where(and(eq(awsAccounts.orgId, orgId), eq(awsAccounts.id, id)));
  return row ?? null;
}

/**
 * The account the dashboard is currently showing. A requested id that is not
 * this org's is ignored rather than 404'd — an account switcher pointing at a
 * deleted account should not break the money screen.
 */
export async function resolveSelected(
  orgId: string,
  requested?: string,
): Promise<{ selected: AwsAccount | null; accounts: AwsAccount[] }> {
  const accounts = await verifiedAccounts(orgId);
  if (accounts.length === 0) return { selected: null, accounts };
  const match = requested ? accounts.find((a) => a.id === requested) : undefined;
  return { selected: match ?? accounts[0], accounts };
}

export interface CreateAccountInput {
  accountId: string;
  label: string;
  roleArn?: string;
  curBucket?: string;
  curPrefix?: string;
}

export async function createAccount(org: Org, input: CreateAccountInput): Promise<AwsAccount> {
  const digits = parseAccountId(input.accountId);
  if (!digits) throw new Error("An AWS account id is 12 digits — check the number and try again");
  const label = input.label.trim();
  if (label.length < 2) throw new Error("Give the account a name you'll recognise, like 4821-prod");

  const existing = await listAccounts(org.id);
  if (existing.some((a) => a.accountId === digits)) {
    throw new Error(`Account ${digits} is already connected`);
  }
  if (!canAddAccount(org.plan, existing.length)) {
    throw new Error(accountLimitMessage(org.plan));
  }

  const roleArn = input.roleArn?.trim() || expectedRoleArn(digits);
  const arnAccount = accountIdFromRoleArn(roleArn);
  if (!arnAccount) throw new Error("That doesn't look like an IAM role ARN");
  if (arnAccount !== digits) {
    throw new Error(`That role ARN belongs to account ${arnAccount}, not ${digits}`);
  }

  const db = getDb();
  const [row] = await db
    .insert(awsAccounts)
    .values({
      orgId: org.id,
      accountId: digits,
      label,
      roleArn,
      externalId: formatExternalId(randomBytes(12).toString("hex")),
      provider: defaultProviderKind(),
      curBucket: input.curBucket?.trim() || null,
      curPrefix: input.curPrefix?.trim() || null,
      connectStatus: "pending",
    })
    .returning();
  return row;
}

/** The quick-create link for one pending account. */
export function connectLink(account: AwsAccount): string {
  return quickCreateUrl({
    templateUrl: env.aws.templateUrl,
    externalId: account.externalId,
    platformAccountId: env.aws.platformAccountId,
    stackName: `cloudspend-${account.accountId}`,
  });
}

export interface VerifyOutcome {
  ok: boolean;
  error?: string;
  factsIngested?: number;
  provider?: "aws" | "demo";
}

/**
 * Verify the assume-role round trip and, on success, backfill. Failure is stored
 * on the row with the AWS message so the connect screen can show what to fix.
 */
export async function verifyAndBackfill(
  account: AwsAccount,
  asOf: Date = new Date(),
): Promise<VerifyOutcome> {
  const db = getDb();
  const provider = await providerFor(account);
  const result = await provider.verify(account);

  if (!result.ok) {
    await db
      .update(awsAccounts)
      .set({ connectStatus: "error", connectError: result.error })
      .where(eq(awsAccounts.id, account.id));
    return { ok: false, error: result.error };
  }

  const [verified] = await db
    .update(awsAccounts)
    .set({
      connectStatus: "verified",
      connectError: null,
      verifiedAt: asOf,
      provider: provider.kind,
      regions: result.regions.slice(0, 20),
    })
    .where(eq(awsAccounts.id, account.id))
    .returning();

  // Demo accounts get deploy markers to correlate against, so the correlation
  // feature has something honest to show. They are demo data, and labelled so.
  if (provider.kind === "demo") {
    const markers = demoDeploys(verified);
    if (markers.length) {
      await db
        .insert(deploys)
        .values(markers.map((m) => ({ ...m, orgId: verified.orgId, source: "webhook" })))
        .onConflictDoNothing();
    }
  }

  const backfill = await backfillAccount(verified, asOf);
  return { ok: true, factsIngested: backfill.facts, provider: provider.kind };
}

export async function updateCurConfig(
  account: AwsAccount,
  input: { curBucket: string; curPrefix: string },
): Promise<void> {
  const bucket = input.curBucket.trim();
  if (bucket && !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error("That isn't a valid S3 bucket name");
  }
  const db = getDb();
  await db
    .update(awsAccounts)
    .set({
      curBucket: bucket || null,
      curPrefix: input.curPrefix.trim() || null,
      // Re-pointing the report means the previous coverage claim is void.
      curCoveredThrough: bucket ? account.curCoveredThrough : null,
    })
    .where(eq(awsAccounts.id, account.id));
}

/** Re-point an account at a different role ARN (a re-created stack, usually). */
export async function updateRoleArn(account: AwsAccount, roleArn: string): Promise<void> {
  const trimmed = roleArn.trim();
  const arnAccount = accountIdFromRoleArn(trimmed);
  if (!arnAccount) throw new Error("That doesn't look like an IAM role ARN");
  if (arnAccount !== account.accountId) {
    throw new Error(`That role ARN belongs to account ${arnAccount}, not ${account.accountId}`);
  }
  const db = getDb();
  await db.update(awsAccounts).set({ roleArn: trimmed }).where(eq(awsAccounts.id, account.id));
}

export async function removeAccount(orgId: string, accountId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(awsAccounts)
    .where(and(eq(awsAccounts.orgId, orgId), eq(awsAccounts.id, accountId)));
}
