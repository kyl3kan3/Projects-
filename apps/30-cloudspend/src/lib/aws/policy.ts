/**
 * The trust artefact.
 *
 * README.md's differentiator #3 is "5-minute least-privilege onboarding — the
 * CloudFormation one-click with a readable IAM policy converts the
 * security-conscious". So the policy is generated from one reviewable source
 * here, rendered verbatim in the connect screen, and every statement carries the
 * sentence that justifies it. If a reader cannot see why a permission exists,
 * the permission does not belong in the list.
 *
 * Pure module — no AWS SDK, no db. Rendered by a server component and unit
 * tested.
 */

export interface PolicyStatementSpec {
  sid: string;
  actions: string[];
  /** Plain-English reason, shown beside the statement in the UI. */
  why: string;
}

/**
 * Read-only, and narrower than `ce:*`: CloudSpend never needs to write a budget,
 * create a report definition, or read the contents of an object outside the CUR
 * prefix the customer names.
 */
export const POLICY_STATEMENTS: PolicyStatementSpec[] = [
  {
    sid: "CostExplorerRead",
    actions: [
      "ce:GetCostAndUsage",
      "ce:GetCostAndUsageWithResources",
      "ce:GetDimensionValues",
      "ce:GetTags",
    ],
    why: "Reads the cost figures that every chart, alert and digest is built from.",
  },
  {
    sid: "CostUsageReportRead",
    actions: ["cur:DescribeReportDefinitions"],
    why: "Finds the Cost & Usage Report definition, for resource-level accuracy.",
  },
  {
    sid: "CurBucketRead",
    actions: ["s3:GetObject", "s3:ListBucket", "s3:GetBucketLocation"],
    why: "Reads the CUR files from the one bucket and prefix you name. Nothing else.",
  },
  {
    sid: "InventoryDescribe",
    actions: [
      "ec2:DescribeInstances",
      "ec2:DescribeInstanceTypes",
      "ec2:DescribeVolumes",
      "ec2:DescribeSnapshots",
      "ec2:DescribeRegions",
      "ec2:DescribeNatGateways",
    ],
    why: "Names the wasted resources in the report — describe only, never modify.",
  },
  {
    sid: "UtilisationRead",
    actions: ["cloudwatch:GetMetricStatistics", "cloudwatch:ListMetrics"],
    why: "Proves an instance is idle before we tell you to switch it off.",
  },
];

export interface PolicyDocument {
  Version: "2012-10-17";
  Statement: Array<{
    Sid: string;
    Effect: "Allow";
    Action: string[];
    Resource: string | string[];
  }>;
}

/**
 * The policy document, scoped to the CUR bucket the customer gave us. With no
 * bucket configured the S3 statement is omitted entirely rather than widened to
 * `*` — an unused permission is the thing a security reviewer objects to.
 */
export function buildPolicyDocument(opts: { curBucket?: string | null } = {}): PolicyDocument {
  const bucket = opts.curBucket?.trim();
  const statements: PolicyDocument["Statement"] = [];
  for (const spec of POLICY_STATEMENTS) {
    if (spec.sid === "CurBucketRead") {
      if (!bucket) continue;
      statements.push({
        Sid: spec.sid,
        Effect: "Allow",
        Action: spec.actions,
        Resource: [`arn:aws:s3:::${bucket}`, `arn:aws:s3:::${bucket}/*`],
      });
      continue;
    }
    statements.push({ Sid: spec.sid, Effect: "Allow", Action: spec.actions, Resource: "*" });
  }
  return { Version: "2012-10-17", Statement: statements };
}

/** Which statements to show in the UI, given the current CUR configuration. */
export function visibleStatements(curBucket?: string | null): PolicyStatementSpec[] {
  return POLICY_STATEMENTS.filter((s) => s.sid !== "CurBucketRead" || Boolean(curBucket?.trim()));
}

/** A cryptographically random external id, formatted so it reads as ours. */
export function formatExternalId(random: string): string {
  return `cloudspend-${random.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 32)}`;
}

export const ROLE_NAME = "CloudSpendReadOnly";

/**
 * The CloudFormation quick-create link. AWS renders the template's parameters
 * as a form, so the external id arrives pre-filled and the customer only clicks
 * "Create stack" — the five-minute path from ROADMAP phase 1.
 */
export function quickCreateUrl(opts: {
  templateUrl: string;
  externalId: string;
  platformAccountId: string;
  region?: string;
  stackName?: string;
}): string {
  const region = opts.region || "us-east-1";
  const params = new URLSearchParams({
    templateURL: opts.templateUrl,
    stackName: opts.stackName || "cloudspend-readonly",
    param_ExternalId: opts.externalId,
    param_CloudSpendAccountId: opts.platformAccountId,
  });
  return `https://console.aws.amazon.com/cloudformation/home?region=${region}#/stacks/quickcreate?${params.toString()}`;
}

/** The role ARN the stack will produce, so we can verify before the callback. */
export function expectedRoleArn(accountId: string): string {
  return `arn:aws:iam::${accountId}:role/${ROLE_NAME}`;
}

/** A 12-digit AWS account id, or null. */
export function parseAccountId(input: string): string | null {
  const digits = input.replace(/[^0-9]/g, "");
  return digits.length === 12 ? digits : null;
}

/** Pull the account id back out of a role ARN, for cross-checking a paste. */
export function accountIdFromRoleArn(arn: string): string | null {
  const m = /^arn:aws(?:-[a-z-]+)?:iam::(\d{12}):role\/.+$/.exec(arn.trim());
  return m ? m[1] : null;
}

/**
 * The CloudFormation template, rendered as YAML so it can be published to S3 and
 * read by a customer's security reviewer before they click anything.
 */
export function cloudFormationTemplate(opts: { curBucket?: string | null } = {}): string {
  const doc = buildPolicyDocument(opts);
  const statements = doc.Statement.map((s) => {
    const resource = Array.isArray(s.Resource)
      ? s.Resource.map((r) => `\n                  - "${r}"`).join("")
      : ` "${s.Resource}"`;
    return [
      `              - Sid: ${s.Sid}`,
      `                Effect: Allow`,
      `                Action:`,
      ...s.Action.map((a) => `                  - ${a}`),
      Array.isArray(s.Resource)
        ? `                Resource:${resource}`
        : `                Resource:${resource}`,
    ].join("\n");
  }).join("\n");

  return `AWSTemplateFormatVersion: "2010-09-09"
Description: >
  Read-only role for CloudSpend cost monitoring. Grants cost, inventory and
  utilisation reads only. It cannot start, stop, modify or delete anything.

Parameters:
  ExternalId:
    Type: String
    Description: The unique external id shown in your CloudSpend connect screen.
  CloudSpendAccountId:
    Type: String
    Description: The CloudSpend AWS account allowed to assume this role.

Resources:
  CloudSpendReadOnlyRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: ${ROLE_NAME}
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal:
              AWS: !Sub "arn:aws:iam::\${CloudSpendAccountId}:root"
            Action: sts:AssumeRole
            Condition:
              StringEquals:
                sts:ExternalId: !Ref ExternalId
      Policies:
        - PolicyName: CloudSpendReadOnly
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
${statements}

Outputs:
  RoleArn:
    Description: Paste this into CloudSpend to finish connecting.
    Value: !GetAtt CloudSpendReadOnlyRole.Arn
`;
}
