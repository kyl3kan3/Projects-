import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { EmptyState, Pill, ScreenHeader } from "@/components/ui";
import { count } from "@/lib/format";
import { bucketLabel, type OverdueBucket } from "@/lib/recall";
import { listCampaigns } from "@/server/campaigns";
import { senderMode } from "@/server/notify";

export const metadata: Metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const { location } = await requireUser();
  const campaigns = await listCampaigns(location.id);
  const sender = senderMode();

  return (
    <main className="screen">
      <ScreenHeader
        label="Sequences"
        title="Campaigns"
        action={
          <Link href="/campaigns/new" className="btn-quiet">
            New
          </Link>
        }
      />

      <p className="t-secondary" style={{ marginTop: 0 }}>
        {sender.reason}
      </p>

      {campaigns.length === 0 ? (
        <EmptyState
          icon="send-steps"
          title="No campaigns yet"
          body="A campaign is a segment plus a sequence: who to reach, and the two or three messages that reach them. Your account came with a 6–12 month winback draft to start from."
          action={{ href: "/campaigns/new", label: "Build a campaign" }}
        />
      ) : (
        <section>
          {campaigns.map((summary) => {
            const buckets = (summary.campaign.segment.buckets ?? []) as OverdueBucket[];
            const stepsDone = summary.steps.length
              ? Math.min(
                  summary.steps.length,
                  Math.max(1, Math.round((summary.touchesSent / Math.max(1, summary.enrolled)) * 10) / 10),
                )
              : 0;
            return (
              <Link
                key={summary.campaign.id}
                href={`/campaigns/${summary.campaign.id}`}
                className="row"
                style={{ display: "flex" }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="t-title" style={{ display: "block" }}>
                    {summary.campaign.name}
                  </span>
                  <span className="t-secondary" style={{ display: "block" }}>
                    {buckets.map(bucketLabel).join(", ") || "no buckets"} ·{" "}
                    {summary.campaign.status === "draft"
                      ? `${count(summary.segmentSize)} would enrol`
                      : `${count(summary.enrolled)} enrolled, ${count(summary.active)} active`}
                  </span>
                  <span className="t-secondary" style={{ display: "block" }}>
                    {count(summary.touchesSent)} touches · {count(summary.stoppedBooked)} stopped after
                    booking
                  </span>
                </span>
                <span style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                  <span className="t-mono">
                    {summary.steps.length ? `${stepsDone.toFixed(0)}/${summary.steps.length}` : "0/0"}
                  </span>
                  <StatusPill status={summary.campaign.status} />
                </span>
              </Link>
            );
          })}
        </section>
      )}

      <div className="thumb-bar">
        <Link href="/campaigns/new" className="btn btn-primary">
          New campaign
        </Link>
      </div>
    </main>
  );
}

function StatusPill({ status }: { status: string }) {
  switch (status) {
    case "running":
      return <Pill tone="aqua">Running</Pill>;
    case "paused":
      return <Pill tone="amber">Paused</Pill>;
    case "completed":
      return <Pill tone="green">Complete</Pill>;
    default:
      return <Pill tone="quiet">Draft</Pill>;
  }
}
