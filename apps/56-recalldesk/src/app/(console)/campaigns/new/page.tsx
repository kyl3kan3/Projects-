import type { Metadata } from "next";
import { hasRole, requireUser } from "@/lib/auth";
import { EmptyState, ScreenHeader } from "@/components/ui";
import { visitValueCentsFor } from "@/lib/attribution";
import { channelAllowed, planSpec } from "@/lib/plans";
import { CHASE_BUCKETS, type OverdueBucket } from "@/lib/recall";
import { listTemplates } from "@/server/campaigns";
import { overdueSummary } from "@/server/overdue";
import { CampaignBuilder } from "./CampaignBuilder";
import { createCampaignAction } from "../actions";

export const metadata: Metadata = { title: "New campaign" };
export const dynamic = "force-dynamic";

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { practice, location } = await requireUser();
  const params = await searchParams;
  const raw = Array.isArray(params.buckets) ? params.buckets[0] : params.buckets;
  const defaultBuckets = (raw ?? "")
    .split(",")
    .filter((b): b is OverdueBucket => (CHASE_BUCKETS as string[]).includes(b));

  const [templates, summary] = await Promise.all([
    listTemplates(practice.id),
    overdueSummary({
      locationId: location.id,
      visitValueCents: visitValueCentsFor(practice.settings),
    }),
  ]);

  // The front desk can read campaigns but not build one: launching spends the
  // practice's reputation across a whole segment. The action refuses too — this is
  // just the honest version of the same answer.
  if (!hasRole((await requireUser()).user, "office_manager")) {
    return (
      <main className="screen">
        <ScreenHeader label="Reactivation" title="New campaign" />
        <EmptyState
          icon="shield-line"
          title="Campaigns need office-manager access"
          body="Building and launching a campaign reaches a whole segment of the roster at once, so it sits with whoever runs the schedule. You can work today's call queue and confirm booking requests."
          action={{ href: "/queue", label: "Go to the call queue" }}
        />
      </main>
    );
  }

  const smsGate = channelAllowed(practice.plan, "sms");
  const bucketCounts = Object.fromEntries(
    CHASE_BUCKETS.map((b) => [b, summary.byBucket[b].patients]),
  );

  return (
    <main className="screen">
      <ScreenHeader label="Reactivation" title="New campaign" />
      <CampaignBuilder
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          channel: t.channel,
          subject: t.subject,
          body: t.body,
        }))}
        smsAllowed={smsGate.ok}
        smsReason={smsGate.ok ? "" : smsGate.reason}
        maxSteps={planSpec(practice.plan).maxSequenceSteps}
        bucketCounts={bucketCounts}
        defaultBuckets={defaultBuckets}
        action={createCampaignAction}
      />
    </main>
  );
}
