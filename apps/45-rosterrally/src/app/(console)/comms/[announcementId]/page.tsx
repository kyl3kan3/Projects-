import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ResendForm } from "./ResendForm";
import { resendUnreachedAction } from "../actions";
import { ScreenTitle, SectionHead } from "@/components/ui";
import { IconCheck, IconEye, IconMail, IconPhone } from "@/components/icons";
import { requireUser } from "@/lib/auth";
import { getReceipts } from "@/lib/comms";
import { formatReceiptTime } from "@/lib/time";

export const metadata: Metadata = { title: "Receipts" };

/**
 * The receipt grid — "sent" is not "seen", made visible.
 *
 * An email that was opened says OPENED with the time. An SMS whose tracked link
 * was followed says VIEWED LINK, never "opened": nobody can observe an SMS being
 * read, and claiming otherwise would be the one dishonest thing in the product.
 */
export default async function ReceiptsPage({
  params,
}: {
  params: Promise<{ announcementId: string }>;
}) {
  const { club, timezone } = await requireUser().then((ctx) => ({
    club: ctx.club,
    timezone: ctx.club.timezone,
  }));
  const { announcementId } = await params;
  const grid = await getReceipts(announcementId);
  if (!grid || grid.announcement.clubId !== club.id) notFound();

  const { counts } = grid;

  return (
    <main className="screen">
      <ScreenTitle
        eyebrow={`${grid.announcement.audienceLabel} · ${grid.announcement.channels.join(" + ")}`}
        title={grid.announcement.subject}
      />

      <div className="panel p-4">
        <p className="t-body whitespace-pre-wrap">{grid.announcement.body}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
        <div>
          <p className="t-label">Sent</p>
          <p className="t-data-lg mt-1">{counts.sent}</p>
        </div>
        <div>
          <p className="t-label">Opened</p>
          <p className="t-data-lg mt-1 turf">{counts.opened}</p>
        </div>
        <div>
          <p className="t-label">Viewed link</p>
          <p className="t-data-lg mt-1 turf">{counts.viewedLink}</p>
        </div>
        <div>
          <p className="t-label">Unreached</p>
          <p
            className="t-data-lg mt-1"
            style={{ color: counts.unreached > 0 ? "var(--warn)" : "var(--fg-2)" }}
          >
            {counts.unreached}
          </p>
        </div>
        {counts.skipped > 0 ? (
          <div>
            <p className="t-label">Skipped</p>
            <p className="t-data-lg mt-1" style={{ color: "var(--fg-3)" }}>
              {counts.skipped}
            </p>
          </div>
        ) : null}
        {counts.failed > 0 ? (
          <div>
            <p className="t-label">Failed</p>
            <p className="t-data-lg mt-1 red">{counts.failed}</p>
          </div>
        ) : null}
      </div>

      {counts.unreached > 0 ? (
        <div className="mt-4">
          <ResendForm
            action={resendUnreachedAction}
            announcementId={grid.announcement.id}
            count={counts.unreached}
          />
        </div>
      ) : (
        <p className="t-secondary mt-4 turf">
          <IconCheck size={14} /> Every family on this list has demonstrably seen it.
        </p>
      )}

      <SectionHead>Who saw it</SectionHead>
      <div className="panel">
        {grid.rows.map((row) => (
          <div key={row.householdId} className="px-4">
            <div className="row">
              <span className="min-w-0 flex-1">
                <span className="t-title block truncate">{row.contactName}</span>
                {row.channels.map((c) => (
                  <span
                    key={`${row.householdId}-${c.channel}`}
                    className="t-secondary flex items-center gap-2"
                    style={{ color: "var(--fg-3)" }}
                  >
                    {c.channel === "email" ? <IconMail size={14} /> : <IconPhone size={14} />}
                    {c.destination}
                    {c.error ? ` · ${c.error}` : ""}
                  </span>
                ))}
              </span>
              <span className="flex flex-col items-end gap-1">
                {row.channels.map((c) => {
                  const label =
                    c.openedAt && c.channel === "email"
                      ? `OPENED ${formatReceiptTime(c.openedAt, timezone)}`
                      : c.clickedAt && c.channel === "sms"
                        ? `VIEWED LINK ${formatReceiptTime(c.clickedAt, timezone)}`
                        : c.status === "skipped"
                          ? "SKIPPED"
                          : c.status === "failed" || c.status === "bounced"
                            ? c.status.toUpperCase()
                            : c.deliveredAt
                              ? "DELIVERED"
                              : c.status.toUpperCase();
                  const tone =
                    label.startsWith("OPENED") || label.startsWith("VIEWED")
                      ? "var(--accent)"
                      : label === "FAILED" || label === "BOUNCED"
                        ? "var(--bad)"
                        : label === "SKIPPED"
                          ? "var(--fg-3)"
                          : "var(--fg-2)";
                  return (
                    <span
                      key={`${row.householdId}-${c.channel}-status`}
                      className="t-data flex items-center gap-1"
                      style={{ color: tone }}
                    >
                      {label.startsWith("OPENED") || label.startsWith("VIEWED") ? (
                        <IconEye size={12} />
                      ) : null}
                      {label}
                    </span>
                  );
                })}
              </span>
            </div>
          </div>
        ))}
      </div>

      <p className="t-secondary mt-4" style={{ color: "var(--fg-3)" }}>
        Email opens come from a tracking pixel. A text cannot report an open — nobody can see that —
        so a text only ever shows delivery and, if the family taps the link, &ldquo;viewed
        link&rdquo;. We do not dress one up as the other.
      </p>

      <p className="mt-6">
        <Link href="/comms" className="btn-quiet">
          Back to comms
        </Link>
      </p>
    </main>
  );
}
