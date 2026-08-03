/**
 * The deterministic synthetic provider.
 *
 * Selected automatically when no platform AWS credential is configured. It is
 * not a stub: it produces a seasonal, plausible bill with a real seeded
 * incident, so the baseline engine, detector, correlator, budget ladder, digest
 * and waste ranking all run against data with the shape of the real thing.
 *
 * Two properties matter and are tested:
 *
 * 1. **Deterministic per hour.** Every figure is a pure function of
 *    (account id, service, usage type, hour). Re-running ingestion for the same
 *    hour produces the same number, so the pipeline is idempotent.
 * 2. **Anchored to the account, not to `now`.** The seeded incident begins at a
 *    fixed offset from the account's creation timestamp. If it were anchored to
 *    wall-clock time, yesterday's ingested hour would change value today.
 *
 * Accounts fed by this provider are stored with `provider = "demo"` and are
 * labelled as demo data everywhere they are shown.
 */

import type { AwsAccount } from "@/db/schema";
import { dollarsToMicros } from "@/lib/money";
import { addHours, floorHour, hourKey } from "@/lib/dates";
import type {
  CloudProvider,
  ContributorLine,
  CostLine,
  CostQuery,
  VerifyResult,
  WasteCandidate,
} from "./provider";

/* ------------------------------------------------------------ determinism */

function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic [0,1) from a string — no global state, no Math.random. */
function unit(input: string): number {
  let t = (hash32(input) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/* --------------------------------------------------------- the demo estate */

interface DemoService {
  service: string;
  region: string;
  usageType: string;
  /** Dollars per hour at the weekday-daytime plateau. */
  peakHourly: number;
  /** How much of the plateau remains at the quietest hour (0–1). */
  trough: number;
  shape: "business" | "flat" | "nightly-batch";
}

const ESTATE: DemoService[] = [
  {
    service: "Amazon Elastic Compute Cloud - Compute",
    region: "us-east-1",
    usageType: "BoxUsage:m6i.2xlarge",
    peakHourly: 12.4,
    trough: 0.58,
    shape: "business",
  },
  {
    service: "Amazon Relational Database Service",
    region: "us-east-1",
    usageType: "InstanceUsage:db.r6g.xlarge",
    peakHourly: 3.85,
    trough: 0.82,
    shape: "nightly-batch",
  },
  {
    service: "Amazon Simple Storage Service",
    region: "us-east-1",
    usageType: "TimedStorage-ByteHrs",
    peakHourly: 1.18,
    trough: 0.96,
    shape: "flat",
  },
  {
    service: "AWS Lambda",
    region: "us-east-1",
    usageType: "Lambda-GB-Second",
    peakHourly: 0.74,
    trough: 0.31,
    shape: "business",
  },
  {
    service: "Amazon Virtual Private Cloud",
    region: "us-east-1",
    usageType: "NatGateway-Bytes",
    peakHourly: 1.06,
    trough: 0.64,
    shape: "business",
  },
  {
    service: "AmazonCloudWatch",
    region: "us-east-1",
    usageType: "DataProcessing-Bytes",
    peakHourly: 0.36,
    trough: 0.9,
    shape: "flat",
  },
  {
    service: "Amazon Elastic Container Service",
    region: "eu-west-1",
    usageType: "Fargate-vCPU-Hours:perCPU",
    peakHourly: 2.15,
    trough: 0.6,
    shape: "business",
  },
  {
    service: "AWS Data Transfer",
    region: "us-east-1",
    usageType: "DataTransfer-Out-Bytes",
    peakHourly: 0.92,
    trough: 0.4,
    shape: "business",
  },
];

/** Weekday/hour multiplier — the seasonality the baseline engine has to learn. */
function seasonalMultiplier(svc: DemoService, dow: number, hour: number): number {
  const weekend = dow === 0 || dow === 6;
  if (svc.shape === "flat") return weekend ? 0.98 : 1;
  if (svc.shape === "nightly-batch") {
    // A backup window at 03:00–04:00 UTC every night: the classic false positive
    // a day-of-week × hour baseline has to absorb without alerting.
    const batch = hour === 3 || hour === 4 ? 1.45 : 1;
    return (weekend ? 0.92 : 1) * 0.9 * batch;
  }
  // Business shape: ramps 12:00–22:00 UTC (US working day), quiet overnight.
  const day = Math.max(0, Math.cos(((hour - 17) / 24) * Math.PI * 2));
  const level = svc.trough + (1 - svc.trough) * day;
  return level * (weekend ? 0.72 : 1);
}

/* ------------------------------------------------------- seeded incident */

/**
 * The seeded incident: an EC2 runaway that begins 30 hours before the account
 * was connected, and a NAT-gateway egress climb 20 hours before. Both are
 * sustained, which is what the detector is required to distinguish from a single
 * noisy hour.
 */
function incidentOnsets(account: AwsAccount): {
  ec2: Date;
  nat: Date;
} {
  const anchor = floorHour(account.createdAt);
  return { ec2: addHours(anchor, -30), nat: addHours(anchor, -20) };
}

function incidentExtraHourly(account: AwsAccount, svc: DemoService, ts: Date): number {
  const { ec2, nat } = incidentOnsets(account);
  if (svc.usageType === "BoxUsage:m6i.2xlarge" && ts >= ec2) return 14.2; // ≈ +$341/day
  if (svc.usageType === "NatGateway-Bytes" && ts >= nat) return 3.67; // ≈ +$88/day
  return 0;
}

/** Dollars for one estate line in one hour. Pure. */
function hourlyDollars(account: AwsAccount, svc: DemoService, ts: Date): number {
  const dow = ts.getUTCDay();
  const hour = ts.getUTCHours();
  const base = svc.peakHourly * seasonalMultiplier(svc, dow, hour);
  const jitter = 0.94 + unit(`${account.accountId}|${svc.usageType}|${hourKey(ts)}`) * 0.12;
  return base * jitter + incidentExtraHourly(account, svc, ts);
}

/* ------------------------------------------------------------- the tags */

/** Tag attribution: services belong to teams, which is what budgets scope on. */
function tagsFor(svc: DemoService): Record<string, string> {
  const team =
    svc.service.includes("Lambda") || svc.service.includes("Container")
      ? "platform"
      : svc.service.includes("Relational") || svc.service.includes("Simple Storage")
        ? "data"
        : "api";
  return { Team: team, Environment: "production" };
}

/* --------------------------------------------------------- the provider */

export const demoProvider: CloudProvider = {
  kind: "demo",

  async verify(account: AwsAccount): Promise<VerifyResult> {
    // The synthetic feed cannot assume a role, so it verifies the shape of what
    // the customer typed and nothing more. This is why the connect screen says
    // "demo data" rather than "connected".
    if (!/^\d{12}$/.test(account.accountId)) {
      return { ok: false, error: "AWS account id must be 12 digits" };
    }
    if (!account.externalId) return { ok: false, error: "Missing external id" };
    return { ok: true, accountId: account.accountId, regions: ["us-east-1", "eu-west-1"] };
  },

  async fetchCosts(account: AwsAccount, query: CostQuery): Promise<CostLine[]> {
    const lines: CostLine[] = [];
    const step = query.granularity === "day" ? 24 : 1;
    const first =
      query.granularity === "day"
        ? new Date(`${query.start.toISOString().slice(0, 10)}T00:00:00Z`)
        : floorHour(query.start);
    for (let ts = first; ts < query.end; ts = addHours(ts, step)) {
      for (const svc of ESTATE) {
        let dollars = 0;
        for (let h = 0; h < step; h++) {
          const at = addHours(ts, h);
          if (at >= query.end) break;
          dollars += hourlyDollars(account, svc, at);
        }
        if (dollars <= 0) continue;
        lines.push({
          ts: new Date(ts),
          service: svc.service,
          region: svc.region,
          usageType: svc.usageType,
          amountMicros: dollarsToMicros(dollars),
          tags: tagsFor(svc),
        });
      }
    }
    return lines;
  },

  async fetchContributors(
    account: AwsAccount,
    opts: { service: string; region: string; start: Date; end: Date },
  ): Promise<ContributorLine[]> {
    const hours = Math.max(1, Math.round((opts.end.getTime() - opts.start.getTime()) / 3_600_000));
    if (opts.service.startsWith("Amazon Elastic Compute Cloud")) {
      // The runaway: three GPU instances launched by the bad deploy, plus the
      // steady-state fleet underneath them.
      return [
        {
          label: "i-09f3c2ab7d41e8b60",
          detail: "g4dn.xlarge · us-east-1a",
          amountMicros: dollarsToMicros(0.526 * hours * 4),
        },
        {
          label: "i-0b7e14d9a2c6f3081",
          detail: "g4dn.xlarge · us-east-1b",
          amountMicros: dollarsToMicros(0.526 * hours * 3),
        },
        {
          label: "i-04c81f6b3e9d5a742",
          detail: "g4dn.xlarge · us-east-1a",
          amountMicros: dollarsToMicros(0.526 * hours * 2),
        },
        {
          label: "BoxUsage:m6i.2xlarge",
          detail: "steady-state fleet · 14 instances",
          amountMicros: dollarsToMicros(0.384 * hours * 14),
        },
      ];
    }
    if (opts.service.includes("Virtual Private Cloud")) {
      return [
        {
          label: "nat-0c9a4f7b21e8d6350",
          detail: "NatGateway-Bytes · us-east-1a",
          amountMicros: dollarsToMicros(0.132 * hours * 7),
        },
        {
          label: "NatGateway-Hours",
          detail: "3 gateways · us-east-1",
          amountMicros: dollarsToMicros(0.045 * hours * 3),
        },
      ];
    }
    return [
      {
        label: `${opts.service.split(" ").slice(-2).join(" ")} usage`,
        detail: `${opts.region} · all usage types`,
        amountMicros: dollarsToMicros(0.21 * hours),
      },
    ];
  },

  async fetchWaste(): Promise<WasteCandidate[]> {
    return [
      {
        kind: "unattached_ebs",
        resourceKey: "ebs:unattached:us-east-1",
        title: "8 unattached EBS volumes",
        remedy: "Delete or snapshot; last attached 47d ago",
        region: "us-east-1",
        evidence: "3.2 TiB gp3, no attachment since 2026-05-28",
        resourceCount: 8,
        estMonthlySavingMicros: dollarsToMicros(611),
      },
      {
        kind: "idle_instance",
        resourceKey: "ec2:idle:g4dn:us-east-1",
        title: "3 idle g4dn GPU instances",
        remedy: "Stop them; CPU under 3% for 14 days",
        region: "us-east-1",
        evidence: "Max CPU 2.8%, GPU util 0% over 14d (CloudWatch)",
        resourceCount: 3,
        estMonthlySavingMicros: dollarsToMicros(438),
      },
      {
        kind: "oversized",
        resourceKey: "rds:oversized:db.r6g.xlarge",
        title: "RDS db.r6g.xlarge running at 11% CPU",
        remedy: "Right-size to db.r6g.large; keep the same storage",
        region: "us-east-1",
        evidence: "P95 CPU 11%, P95 connections 24 of 800 over 30d",
        resourceCount: 1,
        estMonthlySavingMicros: dollarsToMicros(342),
      },
      {
        kind: "oversized",
        resourceKey: "vpc:nat:idle:eu-west-1",
        title: "NAT gateway with almost no traffic",
        remedy: "Route the two subnets through the us-east-1 gateway",
        region: "eu-west-1",
        evidence: "1.4 GB processed in 30d, $0.045/hr fixed charge",
        resourceCount: 1,
        estMonthlySavingMicros: dollarsToMicros(260),
      },
      {
        kind: "old_snapshot",
        resourceKey: "ebs:snapshots:older-than-180d",
        title: "Stale snapshots older than 180d",
        remedy: "Keep the newest per volume; delete 214 others",
        region: "us-east-1",
        evidence: "214 snapshots, 6.1 TiB, oldest 2024-11-03",
        resourceCount: 214,
        estMonthlySavingMicros: dollarsToMicros(196),
      },
    ];
  },

  async listCurObjects(account: AwsAccount): Promise<Array<{ key: string; size: number }>> {
    if (!account.curBucket) return [];
    const prefix = (account.curPrefix || "cur").replace(/^\/+|\/+$/g, "");
    const day = floorHour(addHours(new Date(), -24)).toISOString().slice(0, 10);
    return [{ key: `${prefix}/cloudspend/${day}/cloudspend-00001.csv`, size: 48_231 }];
  },

  async fetchCurObject(account: AwsAccount, key: string): Promise<string> {
    // A CUR extract for the 24 hours the object covers, at resource grain —
    // exactly what makes CUR the accuracy path over Cost Explorer.
    const day = /(\d{4}-\d{2}-\d{2})/.exec(key)?.[1];
    const start = day
      ? new Date(`${day}T00:00:00Z`)
      : floorHour(addHours(new Date(), -24));
    const header = [
      "identity/LineItemId",
      "lineItem/UsageAccountId",
      "lineItem/UsageStartDate",
      "product/ProductName",
      "product/region",
      "lineItem/UsageType",
      "lineItem/ResourceId",
      "lineItem/UnblendedCost",
      "resourceTags/user:Team",
      "resourceTags/user:Environment",
    ].join(",");
    const rows: string[] = [header];
    for (let h = 0; h < 24; h++) {
      const ts = addHours(start, h);
      for (const svc of ESTATE) {
        const dollars = hourlyDollars(account, svc, ts);
        const tags = tagsFor(svc);
        const resource =
          svc.usageType === "BoxUsage:m6i.2xlarge"
            ? "arn:aws:ec2:us-east-1:instance/i-09f3c2ab7d41e8b60"
            : "";
        rows.push(
          [
            `${hash32(`${svc.usageType}${ts.toISOString()}`)}`,
            account.accountId,
            ts.toISOString(),
            `"${svc.service}"`,
            svc.region,
            svc.usageType,
            resource,
            dollars.toFixed(10),
            tags.Team,
            tags.Environment,
          ].join(","),
        );
      }
    }
    return rows.join("\n");
  },
};

/**
 * Deploy markers to seed alongside a demo account, so the correlation feature
 * has something honest to correlate against. The bad one lands two hours before
 * the seeded EC2 onset — the sentence README.md promises: "spike began 2h after
 * deploy abc123 of api-server".
 */
export function demoDeploys(account: AwsAccount): Array<{
  serviceName: string;
  sha: string;
  deployedAt: Date;
  repo: string;
  commitUrl: string;
  actor: string;
  environment: string;
}> {
  const { ec2 } = incidentOnsets(account);
  const base = {
    repo: "acme/api-server",
    actor: "dana",
    environment: "production",
    source: "webhook",
  };
  return [
    {
      ...base,
      serviceName: "api-server",
      sha: "9f3c2ab",
      deployedAt: addHours(ec2, -2),
      commitUrl: "https://github.com/acme/api-server/commit/9f3c2ab",
    },
    {
      ...base,
      serviceName: "api-server",
      sha: "41d8e07",
      deployedAt: addHours(ec2, -26),
      commitUrl: "https://github.com/acme/api-server/commit/41d8e07",
    },
    {
      ...base,
      serviceName: "worker",
      sha: "b52a9c4",
      deployedAt: addHours(ec2, -50),
      repo: "acme/worker",
      commitUrl: "https://github.com/acme/worker/commit/b52a9c4",
    },
  ];
}
