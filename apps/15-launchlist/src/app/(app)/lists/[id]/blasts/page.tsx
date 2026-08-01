import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ownedList } from "@/lib/lists";
import { blastsFor, segmentLabel } from "@/lib/blasts";
import { count, utcTimestamp } from "@/lib/format";
import { featureAllowed, plan } from "@/lib/plans";
import { emailConfigured } from "@/lib/email";
import { ListHeader } from "@/components/ListHeader";
import { IconSend } from "@/components/icons";
import { CancelBlastButton } from "./CancelBlastButton";

export const metadata: Metadata = { title: "Blasts" };
export const dynamic = "force-dynamic";

const STATUS_COPY = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
} as const;

export default async function BlastsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const list = await ownedList(user.id, (await params).id);
  if (!list) notFound();

  const allowed = featureAllowed(user.plan, "emailBlasts");
  const rows = await blastsFor(list.id);

  return (
    <main className="screen">
      <ListHeader list={list} section="Blasts" />

      {!allowed ? (
        <section className="panel" style={{ padding: 20 }}>
          <p className="t-title">Email blasts are on Growth.</p>
          <p className="t-secondary" style={{ marginTop: 8 }}>
            You&apos;re on {plan(user.plan).name}. Growth is $19/mo and includes 5,000 signups, a
            custom domain, and the badge off. Your list and its referral graph carry over untouched.
          </p>
          <Link href="/settings/billing" className="btn btn-primary btn-full" style={{ marginTop: 16 }}>
            See plans
          </Link>
        </section>
      ) : null}

      {allowed && !emailConfigured() ? (
        <p className="panel t-secondary" role="status" style={{ padding: 16, marginBottom: 24 }}>
          No email provider is configured (<span className="t-data">RESEND_API_KEY</span> is unset),
          so sends are written to the server log instead of delivered. Scheduling and segmenting
          work; nothing reaches an inbox until a key is set.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="t-secondary">
          Nothing sent yet. The one people wait for is the launch email — write it once, aim it at
          everyone or just your top referrers.
        </p>
      ) : (
        <ul>
          {rows.map((blast) => (
            <li key={blast.id} className="row" style={{ alignItems: "flex-start", paddingTop: 12, paddingBottom: 12 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="t-title" style={{ display: "block" }}>
                  {blast.subject}
                </span>
                <span className="t-secondary" style={{ display: "block", marginTop: 4 }}>
                  {segmentLabel({ segment: blast.segment, value: blast.segmentValue })} ·{" "}
                  {STATUS_COPY[blast.status]}
                  {blast.status === "sent"
                    ? ` · ${count(blast.sentCount)} delivered${blast.failedCount ? `, ${blast.failedCount} failed` : ""}`
                    : ""}
                  {blast.status === "sending"
                    ? ` · ${count(blast.sentCount)} of ${count(blast.recipientCount)}`
                    : ""}
                  {blast.status === "scheduled" && blast.scheduledAt
                    ? ` · ${utcTimestamp(blast.scheduledAt)}`
                    : ""}
                </span>
                {blast.lastError ? (
                  <span className="t-secondary" style={{ display: "block", marginTop: 4, color: "var(--color-red)" }}>
                    {blast.lastError}
                  </span>
                ) : null}
              </span>
              {blast.status === "scheduled" ? (
                <CancelBlastButton listId={list.id} blastId={blast.id} />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {allowed ? (
        <div className="thumb-cta">
          <Link href={`/lists/${list.id}/blasts/new`} className="btn btn-primary btn-full">
            <IconSend size={18} />
            Write a blast
          </Link>
        </div>
      ) : null}
    </main>
  );
}
