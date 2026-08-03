/**
 * The real AWS provider: sts:AssumeRole into the customer's account, then Cost
 * Explorer / EC2 / CloudWatch / S3 reads through the temporary credential.
 *
 * **Unexercised in this environment.** There is no AWS credential here, so every
 * function below is compiled and type-checked but never run; `providerFor()`
 * selects the synthetic provider instead. Everything downstream of the seam —
 * normalisation, baselines, detection, correlation, budgets, digests, waste
 * ranking, alert dedupe — is exercised against real Postgres.
 *
 * Two things in here are load-bearing and worth knowing:
 *
 * - **Cost Explorer's hourly grain only covers the last 14 days.** Anything older
 *   must be requested at DAILY grain, which is why the 3-month backfill is split
 *   in two (see `ingestion.ts`).
 * - **Cost Explorer costs $0.01 per request.** Every query here is batched to the
 *   widest window and the fewest group-bys that still answer the question; the
 *   poll cadence lives in the caller, not here.
 */

import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  type Granularity,
} from "@aws-sdk/client-cost-explorer";
import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import {
  DescribeInstancesCommand,
  DescribeRegionsCommand,
  DescribeSnapshotsCommand,
  DescribeVolumesCommand,
  EC2Client,
} from "@aws-sdk/client-ec2";
import { CloudWatchClient, GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { gunzipSync } from "node:zlib";
import type { AwsAccount } from "@/db/schema";
import { env } from "@/lib/env";
import { dollarsToMicros } from "@/lib/money";
import { addDays, dayKey } from "@/lib/dates";
import type {
  CloudProvider,
  ContributorLine,
  CostLine,
  CostQuery,
  VerifyResult,
  WasteCandidate,
} from "./provider";

/** Shaped as the SDK's `AwsCredentialIdentity`, plus our own expiry bookkeeping. */
interface Creds {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
}

/** Assumed-role credentials, cached until five minutes before expiry. */
const credCache = new Map<string, Creds>();

async function assume(account: AwsAccount): Promise<Creds> {
  const cached = credCache.get(account.id);
  if (cached && cached.expiration.getTime() - Date.now() > 5 * 60_000) return cached;

  const sts = new STSClient({ region: env.aws.region });
  const out = await sts.send(
    new AssumeRoleCommand({
      RoleArn: account.roleArn,
      ExternalId: account.externalId,
      RoleSessionName: `cloudspend-${account.id.slice(0, 8)}`,
      DurationSeconds: 3600,
    }),
  );
  const c = out.Credentials;
  if (!c?.AccessKeyId || !c.SecretAccessKey || !c.SessionToken) {
    throw new Error("AssumeRole returned no credentials");
  }
  const creds: Creds = {
    accessKeyId: c.AccessKeyId,
    secretAccessKey: c.SecretAccessKey,
    sessionToken: c.SessionToken,
    expiration: c.Expiration ?? new Date(Date.now() + 3_000_000),
  };
  credCache.set(account.id, creds);
  return creds;
}

function ceGranularity(g: CostQuery["granularity"]): Granularity {
  return g === "hour" ? "HOURLY" : "DAILY";
}

/**
 * Cost Explorer wants `YYYY-MM-DD` at DAILY grain and a full ISO-8601 instant at
 * HOURLY grain, and it rejects the wrong one. Getting this backwards is a 400
 * with a message that does not say which field is wrong.
 */
function ceTimePeriod(query: CostQuery): { Start: string; End: string } {
  if (query.granularity === "hour") {
    return {
      Start: query.start.toISOString().replace(/\.\d{3}Z$/, "Z"),
      End: query.end.toISOString().replace(/\.\d{3}Z$/, "Z"),
    };
  }
  return { Start: dayKey(query.start), End: dayKey(query.end) };
}

export const awsProvider: CloudProvider = {
  kind: "aws",

  async verify(account: AwsAccount): Promise<VerifyResult> {
    try {
      const creds = await assume(account);
      const sts = new STSClient({ region: env.aws.region, credentials: creds });
      const who = await sts.send(new GetCallerIdentityCommand({}));
      const accountId = who.Account;
      if (!accountId) return { ok: false, error: "Could not read the account id from STS" };
      if (accountId !== account.accountId) {
        return {
          ok: false,
          error: `That role belongs to account ${accountId}, not ${account.accountId}`,
        };
      }
      const ec2 = new EC2Client({ region: env.aws.region, credentials: creds });
      const regions = await ec2.send(new DescribeRegionsCommand({}));
      return {
        ok: true,
        accountId,
        regions: (regions.Regions ?? [])
          .map((r) => r.RegionName)
          .filter((r): r is string => Boolean(r)),
      };
    } catch (err) {
      return { ok: false, error: describeAwsError(err) };
    }
  },

  async fetchCosts(account: AwsAccount, query: CostQuery): Promise<CostLine[]> {
    const creds = await assume(account);
    const ce = new CostExplorerClient({ region: "us-east-1", credentials: creds });
    const lines: CostLine[] = [];
    let nextToken: string | undefined;

    do {
      const out = await ce.send(
        new GetCostAndUsageCommand({
          TimePeriod: ceTimePeriod(query),
          Granularity: ceGranularity(query.granularity),
          Metrics: ["UnblendedCost"],
          // Two group-bys is Cost Explorer's hard maximum. Service+region is the
          // grain every screen needs; usage type is fetched per-anomaly instead.
          GroupBy: [
            { Type: "DIMENSION", Key: "SERVICE" },
            { Type: "DIMENSION", Key: "REGION" },
          ],
          NextPageToken: nextToken,
        }),
      );
      for (const period of out.ResultsByTime ?? []) {
        const start = period.TimePeriod?.Start;
        if (!start) continue;
        const ts = new Date(start.length === 10 ? `${start}T00:00:00Z` : start);
        for (const group of period.Groups ?? []) {
          const amount = group.Metrics?.UnblendedCost?.Amount;
          if (!amount) continue;
          const micros = dollarsToMicros(amount);
          if (micros === 0) continue;
          lines.push({
            ts,
            service: group.Keys?.[0] ?? "Unknown service",
            region: group.Keys?.[1] ?? "global",
            // Cost Explorer cannot return a third dimension in the same call;
            // CUR ingestion replaces these rows with resource-level truth.
            usageType: "all",
            amountMicros: micros,
          });
        }
      }
      nextToken = out.NextPageToken;
    } while (nextToken);

    return lines;
  },

  async fetchContributors(
    account: AwsAccount,
    opts: { service: string; region: string; start: Date; end: Date },
  ): Promise<ContributorLine[]> {
    const creds = await assume(account);
    const ce = new CostExplorerClient({ region: "us-east-1", credentials: creds });
    const out = await ce.send(
      new GetCostAndUsageCommand({
        TimePeriod: { Start: dayKey(opts.start), End: dayKey(addDays(opts.end, 1)) },
        Granularity: "DAILY",
        Metrics: ["UnblendedCost"],
        GroupBy: [{ Type: "DIMENSION", Key: "USAGE_TYPE" }],
        Filter: {
          And: [
            { Dimensions: { Key: "SERVICE", Values: [opts.service] } },
            { Dimensions: { Key: "REGION", Values: [opts.region] } },
          ],
        },
      }),
    );
    const totals = new Map<string, number>();
    for (const period of out.ResultsByTime ?? []) {
      for (const group of period.Groups ?? []) {
        const key = group.Keys?.[0];
        const amount = group.Metrics?.UnblendedCost?.Amount;
        if (!key || !amount) continue;
        totals.set(key, (totals.get(key) ?? 0) + dollarsToMicros(amount));
      }
    }
    return [...totals.entries()]
      .map(([label, amountMicros]) => ({
        label,
        detail: `${opts.service} · ${opts.region}`,
        amountMicros,
      }))
      .sort((a, b) => b.amountMicros - a.amountMicros)
      .slice(0, 5);
  },

  async fetchWaste(account: AwsAccount): Promise<WasteCandidate[]> {
    const creds = await assume(account);
    const regions = account.regions.length ? account.regions : [env.aws.region];
    const found: WasteCandidate[] = [];

    for (const region of regions) {
      const ec2 = new EC2Client({ region, credentials: creds });
      const cw = new CloudWatchClient({ region, credentials: creds });

      // --- unattached volumes -------------------------------------------------
      const volumes = await ec2.send(
        new DescribeVolumesCommand({
          Filters: [{ Name: "status", Values: ["available"] }],
        }),
      );
      const loose = volumes.Volumes ?? [];
      if (loose.length) {
        const gib = loose.reduce((sum, v) => sum + (v.Size ?? 0), 0);
        const oldest = loose
          .map((v) => v.CreateTime?.getTime() ?? Date.now())
          .reduce((a, b) => Math.min(a, b), Date.now());
        found.push({
          kind: "unattached_ebs",
          resourceKey: `ebs:unattached:${region}`,
          title: `${loose.length} unattached EBS volume${loose.length === 1 ? "" : "s"}`,
          remedy: "Delete or snapshot; nothing has attached them",
          region,
          evidence: `${gib} GiB idle, oldest created ${dayKey(new Date(oldest))}`,
          resourceCount: loose.length,
          // gp3 list price, the conservative estimate.
          estMonthlySavingMicros: dollarsToMicros(gib * 0.08),
        });
      }

      // --- idle instances -----------------------------------------------------
      const instances = await ec2.send(
        new DescribeInstancesCommand({
          Filters: [{ Name: "instance-state-name", Values: ["running"] }],
        }),
      );
      const running = (instances.Reservations ?? []).flatMap((r) => r.Instances ?? []);
      const idle: string[] = [];
      let maxCpu = 0;
      for (const inst of running.slice(0, 40)) {
        if (!inst.InstanceId) continue;
        const stats = await cw.send(
          new GetMetricStatisticsCommand({
            Namespace: "AWS/EC2",
            MetricName: "CPUUtilization",
            Dimensions: [{ Name: "InstanceId", Value: inst.InstanceId }],
            StartTime: addDays(new Date(), -14),
            EndTime: new Date(),
            Period: 86_400,
            Statistics: ["Maximum"],
          }),
        );
        const peak = Math.max(0, ...(stats.Datapoints ?? []).map((d) => d.Maximum ?? 0));
        if ((stats.Datapoints ?? []).length >= 7 && peak < 5) {
          idle.push(inst.InstanceId);
          maxCpu = Math.max(maxCpu, peak);
        }
      }
      if (idle.length) {
        found.push({
          kind: "idle_instance",
          resourceKey: `ec2:idle:${region}`,
          title: `${idle.length} idle EC2 instance${idle.length === 1 ? "" : "s"}`,
          remedy: "Stop them; nothing has used the CPU for two weeks",
          region,
          evidence: `Peak CPU ${maxCpu.toFixed(1)}% over 14d — ${idle.slice(0, 3).join(", ")}`,
          resourceCount: idle.length,
          // Charged hours are the only thing we can price without instance-type
          // rate cards; m5.large on-demand is used as the floor.
          estMonthlySavingMicros: dollarsToMicros(idle.length * 0.096 * 730),
        });
      }

      // --- aged snapshots -----------------------------------------------------
      const snapshots = await ec2.send(
        new DescribeSnapshotsCommand({ OwnerIds: ["self"], MaxResults: 1000 }),
      );
      const cutoff = addDays(new Date(), -180).getTime();
      const stale = (snapshots.Snapshots ?? []).filter(
        (s) => (s.StartTime?.getTime() ?? Date.now()) < cutoff,
      );
      if (stale.length) {
        const gib = stale.reduce((sum, s) => sum + (s.VolumeSize ?? 0), 0);
        found.push({
          kind: "old_snapshot",
          resourceKey: `ebs:snapshots:older-than-180d:${region}`,
          title: "Stale snapshots older than 180d",
          remedy: "Keep the newest per volume; delete the rest",
          region,
          evidence: `${stale.length} snapshots, ~${gib} GiB source volume size`,
          resourceCount: stale.length,
          estMonthlySavingMicros: dollarsToMicros(gib * 0.05),
        });
      }
    }

    return found;
  },

  async listCurObjects(account: AwsAccount): Promise<Array<{ key: string; size: number }>> {
    if (!account.curBucket) return [];
    const creds = await assume(account);
    const s3 = new S3Client({ region: env.aws.region, credentials: creds });
    const out = await s3.send(
      new ListObjectsV2Command({
        Bucket: account.curBucket,
        Prefix: account.curPrefix || undefined,
        MaxKeys: 200,
      }),
    );
    return (out.Contents ?? [])
      .filter((o) => o.Key && /\.csv(\.gz)?$/.test(o.Key))
      .map((o) => ({ key: o.Key as string, size: o.Size ?? 0 }))
      .sort((a, b) => (a.key < b.key ? 1 : -1));
  },

  async fetchCurObject(account: AwsAccount, key: string): Promise<string> {
    if (!account.curBucket) throw new Error("No CUR bucket configured");
    const creds = await assume(account);
    const s3 = new S3Client({ region: env.aws.region, credentials: creds });
    const out = await s3.send(new GetObjectCommand({ Bucket: account.curBucket, Key: key }));
    const bytes = await out.Body?.transformToByteArray();
    if (!bytes) throw new Error(`CUR object ${key} was empty`);
    const buf = Buffer.from(bytes);
    return key.endsWith(".gz") ? gunzipSync(buf).toString("utf8") : buf.toString("utf8");
  },
};

/**
 * AWS error messages are the difference between "fix your trust policy" and a
 * shrug, so they are surfaced to the customer verbatim where they are useful and
 * translated where they are not.
 */
export function describeAwsError(err: unknown): string {
  const name = (err as { name?: string })?.name ?? "";
  const message = (err as { message?: string })?.message ?? String(err);
  if (name === "AccessDenied" || /not authorized to perform: sts:AssumeRole/.test(message)) {
    return "AWS refused the role. Check the external id matches, and that the stack finished creating.";
  }
  if (name === "ExpiredToken" || name === "InvalidClientTokenId") {
    return "CloudSpend's own AWS credential was rejected. This is on us — try again shortly.";
  }
  if (/DataUnavailableException/.test(name + message)) {
    return "Cost Explorer has no data for this account yet. AWS takes up to 24h after the first enable.";
  }
  return message.slice(0, 300);
}
