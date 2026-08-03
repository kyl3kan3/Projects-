import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { Icon } from "@/components/icons";
import { Banner, Pill, ScreenHeader } from "@/components/ui";
import { count } from "@/lib/format";
import { sendingAllowed } from "@/lib/plans";
import { bucketLabel, type OverdueBucket } from "@/lib/recall";
import { campaignSummary, stepStats } from "@/server/campaigns";
import { senderMode } from "@/server/notify";
import { CampaignControls } from "./CampaignControls";
import { launchCampaignAction, setStatusAction } from "../actions";

export const metadata: Metadata = { title: "Campaign" };
export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireUser();

  const [campaign] = await getDb()
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), inArray(campaigns.locationId, ctx.locations.map((l) => l.id))));
  if (!campaign) notFound();

  const [summary, stats] = await Promise.all([campaignSummary(campaign), stepStats(campaign.id)]);
  const gate = sendingAllowed(ctx.practice);
  const sender = senderMode();
  const buckets = (campaign.segment.buckets ?? []) as OverdueBucket[];

  return (
    <main className="screen">
      <ScreenHeader
        label={buckets.map(bucketLabel).join(", ") || "No buckets"}
        title={campaign.name}
        action={<StatusPill status={campaign.status} />}
      />

      {!gate.ok && <Banner tone="amber">{gate.reason}</Banner>}
      {gate.ok && (sender.email === "dry_run" || sender.sms === "dry_run") && (
        <Banner tone="aqua">{sender.reason}</Banner>
      )}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 16,
          paddingTop: 16,
        }}
      >
        <Stat
          label={campaign.status === "draft" ? "Would enrol" : "Enrolled"}
          value={count(campaign.status === "draft" ? summary.segmentSize : summary.enrolled)}
        />
        <Stat label="Active" value={count(summary.active)} />
        <Stat label="Touches" value={count(summary.touchesSent)} />
      </section>

      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 16 }}>
        <p className="t-label" style={{ margin: "0 0 12px" }}>
          The sequence
        </p>
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {summary.steps.map((step, index) => {
            const stat = stats.get(step.templateId);
            const last = index === summary.steps.length - 1;
            return (
              <li key={step.id} style={{ display: "flex", gap: 12 }}>
                <span
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    paddingTop: 4,
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      border: "1.75px solid var(--color-aqua)",
                      background: (stat?.sent ?? 0) > 0 ? "var(--color-aqua)" : "transparent",
                    }}
                  />
                  {!last && (
                    <span style={{ flex: 1, width: 1, background: "var(--color-hairline)", minHeight: 40 }} />
                  )}
                </span>
                <span style={{ paddingBottom: last ? 0 : 20, flex: 1, minWidth: 0 }}>
                  <span className="t-title" style={{ display: "block" }}>
                    {step.templateName}
                  </span>
                  <span className="t-secondary" style={{ display: "block" }}>
                    {step.channel === "sms" ? "Text" : "Email"} · day {step.offsetDays}
                    {step.subject ? ` · “${step.subject}”` : ""}
                  </span>
                  <span className="t-mono" style={{ display: "block", color: "var(--color-ink-2)", marginTop: 2 }}>
                    {count(stat?.sent ?? 0)} sent · {count(stat?.delivered ?? 0)} delivered
                    {(stat?.failed ?? 0) > 0 ? ` · ${count(stat!.failed)} failed` : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 16 }}>
        <p className="t-label" style={{ margin: "0 0 8px" }}>
          Guardrails
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          <Guardrail>
            At most {campaign.maxTouchesPerPatient} touches per patient from this campaign, checked at
            send time.
          </Guardrail>
          <Guardrail>
            Sending only between {ctx.location.quietStartHour}:00 and {ctx.location.quietEndHour}:00 in{" "}
            {ctx.location.timezone.replace("_", " ")}, at most {ctx.location.hourlySendCap} touches an
            hour.
          </Guardrail>
          <Guardrail>
            A patient who books — from a link, a call or the front desk — stops receiving this
            sequence immediately.
          </Guardrail>
          <Guardrail>
            {count(summary.stoppedBooked)} enrolments have already stopped because the patient booked.
          </Guardrail>
        </ul>
      </section>

      <div style={{ marginTop: 24 }}>
        <CampaignControls
          campaignId={campaign.id}
          status={campaign.status}
          stepCount={summary.steps.length}
          canSend={gate.ok}
          launch={launchCampaignAction}
          setStatus={setStatusAction}
        />
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="t-label" style={{ margin: 0 }}>
        {label}
      </p>
      <p className="t-mono" style={{ margin: "2px 0 0", fontSize: "1.0625rem" }}>
        {value}
      </p>
    </div>
  );
}

function Guardrail({ children }: { children: React.ReactNode }) {
  return (
    <li className="t-secondary" style={{ display: "flex", gap: 8 }}>
      <span style={{ color: "var(--color-aqua)", lineHeight: 0, flex: "none", marginTop: 2 }}>
        <Icon name="shield-line" size={18} />
      </span>
      {children}
    </li>
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
