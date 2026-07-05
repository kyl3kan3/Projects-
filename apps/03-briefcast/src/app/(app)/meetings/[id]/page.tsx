import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { fmtMeta } from "@/lib/format";
import { ActionItems } from "@/components/ActionItems";
import { CrmReview } from "@/components/CrmReview";
import { Transcript } from "@/components/Transcript";
import { IconFlag } from "@/components/icons";

export const dynamic = "force-dynamic";

/** The Brief — the money screen. Serif title, decisions, checkable action
 *  items, coral risks, folded transcript, and the CRM sync bar in the thumb
 *  zone. */
export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const meeting = await db.query.meetings.findFirst({
    where: and(eq(schema.meetings.id, id), eq(schema.meetings.orgId, session.orgId)),
  });
  if (!meeting) notFound();

  const summary = await db.query.summaries.findFirst({ where: eq(schema.summaries.meetingId, meeting.id) });
  const items = await db.query.actionItems.findMany({ where: eq(schema.actionItems.meetingId, meeting.id) });
  const transcript = await db.query.transcripts.findFirst({ where: eq(schema.transcripts.meetingId, meeting.id) });
  const segments = transcript
    ? await db.query.transcriptSegments.findMany({
        where: eq(schema.transcriptSegments.transcriptId, transcript.id),
        orderBy: asc(schema.transcriptSegments.idx),
      })
    : [];

  const crmConn = await db.query.crmConnections.findFirst({
    where: and(eq(schema.crmConnections.orgId, session.orgId), eq(schema.crmConnections.status, "active")),
  });
  const syncLogs = await db.query.crmSyncLogs.findMany({
    where: and(eq(schema.crmSyncLogs.meetingId, meeting.id), eq(schema.crmSyncLogs.operation, "update_field")),
  });

  // Field changes come from sync logs when composed, else straight from the
  // summary proposals (pre-CRM-connect preview).
  const changes = syncLogs.length
    ? syncLogs.map((l) => ({
        id: l.id,
        label: l.label ?? l.field ?? "FIELD",
        oldValue: l.oldValue,
        newValue: l.newValue ?? "",
        confidence: l.confidence,
        applied: l.status === "applied",
      }))
    : (summary?.crmFieldProposals ?? []).map((p, i) => ({
        id: `proposal-${i}`,
        label: p.label,
        oldValue: p.oldValue,
        newValue: p.newValue,
        confidence: p.confidence,
        applied: false,
      }));

  const processing = meeting.status === "processing" || meeting.status === "recording";

  return (
    <main className="px-5 pt-6 pb-8">
      <Link href="/pipeline" className="btn-quiet inline-flex px-0">← Briefs</Link>

      <h1 className="t-display mt-3" style={{ fontSize: "clamp(26px, 7vw, 34px)" }}>
        {meeting.title}
      </h1>
      <p className="mono mt-2 text-[var(--color-stone)]">{fmtMeta(meeting.startsAt, meeting.durationSeconds, meeting.platform)}</p>

      {processing ? (
        <PrintingSkeleton />
      ) : (
        <>
          {summary?.overview && (
            <section className="mt-7">
              <p className="brief-para t-body measure">{summary.overview}</p>
            </section>
          )}

          {summary && summary.decisions.length > 0 && (
            <section className="mt-7">
              <h2 className="t-h2">Decisions</h2>
              <ul className="mt-2 space-y-2">
                {summary.decisions.map((d, i) => (
                  <li key={i} className="brief-para t-body measure text-[15px]" style={{ animationDelay: `${i * 60}ms` }}>
                    {d.text}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {items.length > 0 && (
            <section className="mt-7">
              <h2 className="t-h2">Action items</h2>
              <div className="mt-2">
                <ActionItems items={items.map((i) => ({ id: i.id, text: i.text, ownerName: i.ownerName, dueDate: i.dueDate, status: i.status }))} />
              </div>
            </section>
          )}

          {summary && summary.risks.length > 0 && (
            <section className="mt-7 space-y-3">
              {summary.risks.map((r, i) => (
                <div key={i} className="risk">
                  <p className="t-label flex items-center gap-1.5 text-[var(--color-coral)]">
                    <IconFlag size={13} /> Risk
                  </p>
                  <p className="t-body mt-1 text-[15px]">{r.text}</p>
                </div>
              ))}
            </section>
          )}

          {changes.length > 0 && (
            <section className="mt-8">
              <h2 className="t-h2 mb-3">Keep the CRM honest</h2>
              <CrmReview changes={changes.filter((c) => !c.applied)} connected={!!crmConn} />
              {changes.some((c) => c.applied) && (
                <p className="mono mt-3 text-[var(--color-green)]">
                  {changes.filter((c) => c.applied).length} already synced
                </p>
              )}
            </section>
          )}

          {segments.length > 0 && (
            <section className="mt-4 border-t border-[var(--color-line)]">
              <Transcript segments={segments.map((s) => ({ idx: s.idx, speakerLabel: s.speakerLabel, startMs: s.startMs, text: s.text }))} />
            </section>
          )}
        </>
      )}
    </main>
  );
}

/** The signature: the printing skeleton. Typographic bars in exact line
 *  widths, resolving top-down. Server-rendered placeholder for the processing
 *  state (the animation lives in globals.css / the real-time client swap). */
function PrintingSkeleton() {
  const widths = ["96%", "88%", "72%", "0", "40%", "92%", "80%", "64%"];
  return (
    <div className="mt-7" aria-label="Brief is being typeset">
      {widths.map((w, i) =>
        w === "0" ? (
          <div key={i} className="h-4" />
        ) : (
          <div key={i} className="skeleton-line" style={{ width: w }} />
        ),
      )}
      <p className="mono mt-4 text-[var(--color-stone)]">Typesetting the brief…</p>
    </div>
  );
}
