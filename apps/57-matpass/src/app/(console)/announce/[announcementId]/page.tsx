import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { announcements } from "@/db/schema";
import { Pill, ScreenTitle, SectionHead } from "@/components/ui";
import { deliveryDetail } from "@/lib/announcements";
import { requireSchool } from "@/lib/auth";
import { formatDate } from "@/lib/time";
import { RetryForm } from "./RetryForm";

export const metadata: Metadata = { title: "Delivery" };

export default async function AnnouncementPage({
  params,
}: {
  params: Promise<{ announcementId: string }>;
}) {
  const { school } = await requireSchool();
  const { announcementId } = await params;
  const db = getDb();

  const [announcement] = await db
    .select()
    .from(announcements)
    .where(and(eq(announcements.id, announcementId), eq(announcements.schoolId, school.id)));
  if (!announcement) notFound();

  const rows = await deliveryDetail({ announcementId, schoolId: school.id });
  const failing = rows.filter((r) => r.status === "bounced" || r.status === "failed");
  const queued = rows.filter((r) => r.status === "queued");

  return (
    <main className="screen">
      <ScreenTitle
        eyebrow={
          announcement.sentAt
            ? `Sent ${formatDate(announcement.sentAt, school.timezone)}`
            : "Not sent"
        }
        title={announcement.subject}
        action={
          <Link href="/announce" className="btn-quiet">
            All announcements
          </Link>
        }
      />

      <div className="card" style={{ padding: 16, whiteSpace: "pre-wrap" }}>
        <p className="t-body">{announcement.bodyMd}</p>
      </div>

      <SectionHead>
        {rows.length} household{rows.length === 1 ? "" : "s"}
      </SectionHead>
      {failing.length > 0 ? (
        <p className="t-secondary amber" style={{ marginBottom: 12 }}>
          {failing.length} address{failing.length === 1 ? "" : "es"} could not be reached. Fix the
          household&rsquo;s email on the billing screen and retry.
        </p>
      ) : null}

      <div>
        {rows.map((row) => (
          <div key={`${row.familyName}-${row.email ?? "none"}`} className="row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="t-title">{row.familyName}</p>
              <p className="t-secondary fg-3" style={{ marginTop: 2 }}>
                {row.email ?? "no email on file"}
              </p>
            </div>
            <span style={{ flex: "none" }}>
              {row.status === "delivered" || row.status === "sent" ? (
                <Pill tone="ok">{row.status === "delivered" ? "Delivered" : "Sent"}</Pill>
              ) : row.status === "queued" ? (
                <Pill tone="quiet">Queued</Pill>
              ) : (
                <Pill tone="warn">{row.status === "bounced" ? "Bounced" : "Failed"}</Pill>
              )}
            </span>
          </div>
        ))}
      </div>

      {queued.length > 0 || failing.length > 0 ? (
        <div style={{ marginTop: 24 }}>
          <RetryForm announcementId={announcementId} />
        </div>
      ) : null}
    </main>
  );
}
