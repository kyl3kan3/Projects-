import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { estimates, proposals, walkthroughs } from "@/db/schema";
import { ScreenHeader } from "@/components/ScreenHeader";
import { StatusPill } from "@/components/StatusPill";
import { IconAlert, IconChevronRight, IconMic, IconRefresh } from "@/components/icons";
import { requireOnboardedUser } from "@/lib/auth";
import { estimatePill, JOB_STATUS_LABEL, proposalPill, proposalState, timeAgo, walkthroughPill } from "@/lib/display";
import { getJob } from "@/lib/jobs";
import { formatMoney } from "@/lib/money";
import { describeFailure } from "@/lib/walkthroughs";
import { JobStatusControls } from "./JobStatusControls";

export const metadata: Metadata = { title: "Job" };
export const dynamic = "force-dynamic";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { org } = await requireOnboardedUser();
  const { id } = await params;
  const job = await getJob(org.id, id);
  if (!job) notFound();

  const db = getDb();
  const [walkthroughRows, estimateRows, proposalRows] = await Promise.all([
    db.select().from(walkthroughs).where(eq(walkthroughs.jobId, job.id)).orderBy(desc(walkthroughs.createdAt)),
    db.select().from(estimates).where(eq(estimates.jobId, job.id)).orderBy(asc(estimates.version)),
    db.select().from(proposals).where(eq(proposals.jobId, job.id)).orderBy(desc(proposals.sentAt)),
  ]);

  const openWalkthrough = walkthroughRows.find((row) =>
    ["capturing", "uploaded", "transcribing", "drafting"].includes(row.status),
  );
  const failed = walkthroughRows.find((row) => row.status === "failed");

  return (
    <main>
      <ScreenHeader
        title={job.customerName}
        meta={`${job.address} · ${JOB_STATUS_LABEL[job.status]}`}
        backHref="/jobs"
        backLabel="Jobs"
        showSettings={false}
      />

      <section className="gutter" style={{ paddingBottom: 24 }}>
        <p className="t-title">{job.title}</p>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          {job.customerEmail ? job.customerEmail : "No email on file yet"}
          {job.customerPhone ? ` · ${job.customerPhone}` : ""}
        </p>
        {!job.customerEmail ? (
          <p className="t-secondary" style={{ marginTop: 8, color: "var(--color-amber)" }}>
            Add an email address before sending — that is where the proposal link goes.
          </p>
        ) : null}
      </section>

      {failed && !openWalkthrough ? (
        <section className="gutter" style={{ paddingBottom: 24 }}>
          <div className="panel" style={{ padding: 16, display: "flex", gap: 12 }}>
            <IconAlert size={20} style={{ color: "var(--color-red)", flex: "none" }} />
            <div>
              <p className="t-title">Last walkthrough did not draft</p>
              <p className="t-secondary" style={{ marginTop: 4 }}>
                {describeFailure(failed.failureReason)}
              </p>
              <Link
                href={`/jobs/${job.id}/capture?w=${failed.id}`}
                className="btn-quiet"
                style={{ paddingLeft: 0 }}
              >
                <IconRefresh size={18} />
                Pick it back up
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {estimateRows.length ? (
        <section className="gutter" style={{ paddingBottom: 24 }}>
          <p className="t-label" style={{ paddingBottom: 4 }}>
            Estimates
          </p>
          {[...estimateRows].reverse().map((estimate) => (
            <Link key={estimate.id} href={`/estimates/${estimate.id}`} className="row">
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="t-title" style={{ display: "block" }}>
                  Version {estimate.version}
                </span>
                <span
                  className="t-secondary"
                  style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}
                >
                  <StatusPill pill={estimatePill(estimate.status)} />
                  <span style={{ color: "var(--color-text-3)" }}>
                    {estimate.draftedByModel ? `drafted by ${estimate.draftedByModel}` : "manual"} ·{" "}
                    {timeAgo(estimate.updatedAt)}
                  </span>
                </span>
              </span>
              <span className="t-data" style={{ flex: "none" }}>
                {formatMoney(estimate.totalCents)}
              </span>
              <IconChevronRight size={18} style={{ color: "var(--color-text-3)", flex: "none" }} />
            </Link>
          ))}
        </section>
      ) : null}

      {proposalRows.length ? (
        <section className="gutter" style={{ paddingBottom: 24 }}>
          <p className="t-label" style={{ paddingBottom: 4 }}>
            Proposals
          </p>
          {proposalRows.map((proposal) => (
            <Link key={proposal.id} href={`/proposals/${proposal.id}`} className="row">
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="t-title" style={{ display: "block" }}>
                  Sent {timeAgo(proposal.sentAt)}
                </span>
                <span style={{ display: "block", marginTop: 4 }}>
                  <StatusPill pill={proposalPill(proposalState(proposal))} />
                </span>
              </span>
              <span className="t-data" style={{ flex: "none" }}>
                {formatMoney(proposal.totalCents)}
              </span>
              <IconChevronRight size={18} style={{ color: "var(--color-text-3)", flex: "none" }} />
            </Link>
          ))}
        </section>
      ) : null}

      {walkthroughRows.length ? (
        <section className="gutter" style={{ paddingBottom: 24 }}>
          <p className="t-label" style={{ paddingBottom: 4 }}>
            Walkthroughs
          </p>
          {walkthroughRows.map((walkthrough) => (
            <div key={walkthrough.id} className="row">
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="t-title" style={{ display: "block" }}>
                  {timeAgo(walkthrough.createdAt)}
                </span>
                <span
                  className="t-secondary"
                  style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}
                >
                  <StatusPill pill={walkthroughPill(walkthrough.status)} />
                  <span style={{ color: "var(--color-text-3)" }}>
                    {walkthrough.durationSeconds > 0
                      ? `${Math.round(walkthrough.durationSeconds / 60)} min`
                      : "no audio"}
                    {walkthrough.transcriptSource === "demo_fixture" ? " · demo transcript" : ""}
                  </span>
                </span>
              </span>
              {["capturing", "failed"].includes(walkthrough.status) ? (
                <Link
                  href={`/jobs/${job.id}/capture?w=${walkthrough.id}`}
                  className="btn-quiet"
                  style={{ flex: "none" }}
                >
                  Resume
                </Link>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      <section className="gutter" style={{ paddingBottom: 24 }}>
        <p className="t-label" style={{ paddingBottom: 8 }}>
          Job status
        </p>
        <JobStatusControls jobId={job.id} status={job.status} />
      </section>

      <div className="thumb-bar">
        <Link href={`/jobs/${job.id}/capture`} className="btn btn-primary btn-full">
          <IconMic size={18} />
          {walkthroughRows.length ? "Another walkthrough" : "Start walkthrough"}
        </Link>
      </div>
    </main>
  );
}
