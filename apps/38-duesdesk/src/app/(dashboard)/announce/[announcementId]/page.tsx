import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { deliveryReport, segmentLabel } from "@/lib/announcements";
import { formatIso } from "@/lib/dates";
import { can } from "@/lib/plans";
import { Notice } from "@/components/ledger";
import { IconChevronLeft } from "@/components/icons";
import { FixEmailForm, ResendForm } from "../AnnounceForms";

export const metadata: Metadata = { title: "Delivery report" };
export const dynamic = "force-dynamic";

const STATUS_COPY: Record<string, string> = {
  sent: "Sent",
  delivered: "Delivered",
  queued: "Queued",
  bounced: "Bounced",
  failed: "Failed",
  skipped: "No address on file",
  opted_out: "Not opted in to texts",
};

export default async function DeliveryReportPage({
  params,
}: {
  params: Promise<{ announcementId: string }>;
}) {
  const { user, association } = await requireUser();
  const { announcementId } = await params;
  const report = await deliveryReport(announcementId);
  if (!report || report.announcement.associationId !== association.id) notFound();

  const { announcement, counts, problems, total } = report;
  const canSend = can(user.role, "announce");
  const good = (counts.sent ?? 0) + (counts.delivered ?? 0);

  return (
    <main className="screen">
      <header className="pt-8">
        <Link href="/announce" className="btn-quiet inline-flex items-center gap-1">
          <IconChevronLeft size={18} />
          Announce
        </Link>
        <p className="t-label mt-6">{segmentLabel(announcement.segment)}</p>
        <h1 className="t-h2 mt-1">{announcement.subject}</h1>
        <p className="t-secondary mt-1">
          {announcement.sentAt
            ? `Sent ${formatIso(announcement.sentAt.toISOString().slice(0, 10))}`
            : "Not sent"}{" "}
          · {announcement.channels.join(" and ")}
        </p>
      </header>

      <section className="mt-6">
        <p className="t-data" style={{ fontSize: 15 }}>
          {good} DELIVERED
          {problems.length > 0 ? ` · ${problems.length} TO FIX` : ""}
          {total !== good + problems.length ? ` · ${total} attempts` : ""}
        </p>
      </section>

      <section className="mt-8 split">
        <div>
          <h2 className="t-h2">What went wrong</h2>
          {problems.length === 0 ? (
            <p className="t-secondary mt-3">
              Nothing. Every recipient in this segment was reached on at least one channel.
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-4">
              {problems.map((problem) => (
                <article
                  key={`${problem.memberId}-${problem.channel}`}
                  className="panel p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="t-title">{problem.memberName}</p>
                    <p className="t-label">{problem.unitLabel}</p>
                  </div>
                  <p className="t-secondary mt-1">
                    {problem.channel === "email" ? "Email" : "Text"} ·{" "}
                    {STATUS_COPY[problem.status] ?? problem.status}
                  </p>
                  <p className="t-data ink-3 mt-1 break-all">
                    {problem.destination || "no destination on file"}
                  </p>
                  {problem.error ? (
                    <p className="t-secondary mt-2">{problem.error}</p>
                  ) : null}

                  {canSend && problem.channel === "email" && problem.memberId ? (
                    <div className="hairline-t mt-3 pt-3">
                      <FixEmailForm memberId={problem.memberId} current={problem.destination} />
                    </div>
                  ) : null}
                  {problem.channel === "sms" && problem.status === "opted_out" ? (
                    <p className="t-secondary mt-2 ink-3">
                      Nothing to fix here — this member has not opted in to text messages, and only
                      they can change that from their own portal. They received the email.
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="panel p-4">
            <p className="t-label">Message</p>
            <p className="t-body mt-2 whitespace-pre-wrap">{announcement.bodyMd}</p>
          </div>

          <div className="panel mt-4 p-4">
            <p className="t-label">Counts</p>
            <div className="mt-2">
              {Object.entries(counts).map(([status, n]) => (
                <div key={status} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="t-secondary">{STATUS_COPY[status] ?? status}</span>
                  <span className="t-data">{n}</span>
                </div>
              ))}
            </div>
          </div>

          {canSend && problems.some((p) => p.channel === "email") ? (
            <div className="panel mt-4 p-4">
              <p className="t-label">Try again</p>
              <div className="mt-3">
                <ResendForm announcementId={announcement.id} />
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <Notice>
              Delivery states come from what the provider told us at send time. In dry-run mode
              nothing actually leaves the building, and every row here says so in its error field —
              so a rehearsal can never be mistaken for a real send.
            </Notice>
          </div>
        </div>
      </section>
    </main>
  );
}
