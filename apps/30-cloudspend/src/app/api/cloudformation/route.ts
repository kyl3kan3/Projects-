/**
 * The CloudFormation template, served as plain YAML.
 *
 * README.md's third differentiator is that the security-conscious can read the
 * policy before they click. That means the template has to be readable at a URL
 * they can send to whoever signs off — not just rendered inside a dashboard they
 * would have to log into.
 *
 * It is generated from the same single source as the policy shown on the connect
 * screen (`lib/aws/policy.ts`), so the two can never drift.
 *
 * Public and cacheable on purpose: the document contains no secret. The external
 * id and our account id are stack *parameters*, filled in per customer by the
 * quick-create link.
 */

import type { NextRequest } from "next/server";
import { cloudFormationTemplate } from "@/lib/aws/policy";

export const runtime = "nodejs";

export function GET(req: NextRequest): Response {
  const bucket = new URL(req.url).searchParams.get("curBucket");
  return new Response(cloudFormationTemplate({ curBucket: bucket }), {
    headers: {
      "content-type": "text/yaml; charset=utf-8",
      "content-disposition": 'inline; filename="cloudspend-readonly-role.yml"',
      "cache-control": "public, max-age=3600",
    },
  });
}
