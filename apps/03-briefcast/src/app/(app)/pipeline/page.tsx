import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { fmtMeta } from "@/lib/format";
import { BrandMark, IconMic } from "@/components/icons";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  recording: "Recording",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
  skipped: "Skipped",
};

export default async function PipelinePage() {
  const session = await requireSession();

  const meetings = await db.query.meetings.findMany({
    where: eq(schema.meetings.orgId, session.orgId),
    orderBy: desc(schema.meetings.startsAt),
    limit: 40,
  });

  // action-item + pending-proposal counts per meeting for the card meta line
  const meetingIds = meetings.map((m) => m.id);
  const items = meetingIds.length
    ? await db.query.actionItems.findMany({ where: inArray(schema.actionItems.meetingId, meetingIds) })
    : [];
  const pending = meetingIds.length
    ? await db.query.crmSyncLogs.findMany({
        where: and(inArray(schema.crmSyncLogs.meetingId, meetingIds), eq(schema.crmSyncLogs.status, "pending")),
      })
    : [];

  const aiCount = (id: string) => items.filter((i) => i.meetingId === id && i.status === "open").length;
  const needsYou = (id: string) => pending.filter((p) => p.meetingId === id && p.operation === "update_field").length;

  return (
    <main className="px-5 pt-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BrandMark size={24} />
          <span className="font-semibold">Briefcast</span>
        </div>
        <span className="onair">
          <span className="live-dot" />
          <span className="wave"><span /><span /><span /></span>
          Ready
        </span>
      </div>

      <h1 className="t-h2 mt-6">This week</h1>

      <div className="mt-4 space-y-3">
        {meetings.length === 0 && (
          <div className="card p-5">
            <p className="t-title">No briefs yet</p>
            <p className="t-secondary mt-1">Connect a calendar and the bot joins your next call automatically.</p>
          </div>
        )}
        {meetings.map((m) => {
          const unread = m.status === "ready" && needsYou(m.id) > 0;
          const live = m.status === "recording";
          return (
            <Link key={m.id} href={`/meetings/${m.id}`} className="card relative block p-4">
              {unread && <span className="dogear" aria-label="Needs review" />}
              <div className="flex items-center gap-2">
                {live && <IconMic size={16} className="text-[var(--color-blue)]" />}
                <span className="pill">{STATUS_LABEL[m.status]}</span>
                {m.isExternal && <span className="pill">External</span>}
              </div>
              <h3 className="t-title mt-2 pr-4" style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}>
                {m.title}
              </h3>
              <p className="mono mt-1 text-[var(--color-stone)]">{fmtMeta(m.startsAt, m.durationSeconds, m.platform)}</p>
              {m.status === "ready" && (
                <p className="t-secondary mt-2">
                  {aiCount(m.id)} action {aiCount(m.id) === 1 ? "item" : "items"}
                  {needsYou(m.id) > 0 && (
                    <span className="text-[var(--color-coral)]"> · {needsYou(m.id)} need you</span>
                  )}
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </main>
  );
}
