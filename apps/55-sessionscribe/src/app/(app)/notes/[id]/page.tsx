import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePractice } from "@/lib/auth";
import { noteWithChain, renderNoteText } from "@/lib/notes";
import { recordAudit } from "@/lib/audit";
import { requestMeta } from "@/lib/request";
import { billingFacts } from "@/lib/billing";
import { entitlement } from "@/lib/plans";
import { provenanceNotices, PURGED_MEDIA_NOTICE } from "@/lib/honesty";
import {
  CAPTURE_LABEL,
  formatClock,
  formatDate,
  formatDuration,
  formatStamp,
  formatTime,
} from "@/lib/format";
import { ReviewRoom } from "@/components/ReviewRoom";

export const metadata: Metadata = { title: "Review" };
export const dynamic = "force-dynamic";

export default async function NotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { practice, user } = await requirePractice();
  const found = await noteWithChain(practice.id, id);
  if (!found) notFound();
  const { ctx, chain } = found;

  // Every access to a note is an audit event. This is the read path, so this is
  // where the `viewed` row is written — not in a helper someone can forget.
  const meta = await requestMeta();
  await recordAudit({
    practiceId: practice.id,
    actorId: user.id,
    action: "viewed",
    targetKind: "note",
    targetId: ctx.note.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { sessionId: ctx.session.id, status: ctx.note.status },
  });

  const ent = entitlement(billingFacts(practice), new Date());
  const purged = Boolean(ctx.transcript?.purgedAt || ctx.artifact?.purgedAt);
  const hasTranscript = Boolean(
    ctx.transcript && !ctx.transcript.purgedAt && ctx.transcript.segments.length > 0,
  );

  const signatures = chain
    .filter((v) => v.signature)
    .map((v) => ({
      version: v.signature!.version,
      reason: v.version.reason,
      signerName: user.name,
      credentials: v.signature!.signerCredentials,
      stamp: formatStamp(v.signature!.signedAt, practice.timezone),
      hash: v.signature!.contentHash,
      intact: v.intact,
    }));

  const lastSigned = chain.filter((v) => v.signature).at(-1);

  return (
    <ReviewRoom
      noteId={ctx.note.id}
      status={ctx.note.status}
      clientLabel={ctx.client.displayLabel}
      templateName={ctx.template.name}
      heldAtLabel={`${formatDate(ctx.session.heldAt, practice.timezone)} at ${formatTime(ctx.session.heldAt, practice.timezone)}`}
      metaLine={`${CAPTURE_LABEL[ctx.session.captureKind]} · ${formatDuration(ctx.session.durationMinutes)}${
        ctx.note.model ? ` · drafted by ${ctx.note.model}` : ""
      }`}
      sectionSpecs={ctx.template.sections.map((s) => ({
        key: s.key,
        label: s.label,
        guidance: s.guidance,
      }))}
      sections={ctx.note.sections}
      segments={
        hasTranscript
          ? ctx.transcript!.segments.map((s) => ({
              speaker: s.speaker,
              startMs: s.startMs,
              endMs: s.endMs,
              text: s.text,
            }))
          : []
      }
      hasTranscript={hasTranscript}
      transcriptNote={purged ? PURGED_MEDIA_NOTICE(practice.retentionDays) : null}
      notices={provenanceNotices({
        transcriptProvider: ctx.transcript?.provider,
        noteModel: ctx.note.model,
      })}
      signatures={signatures}
      signerName={user.name}
      signerCredentials={user.credentials || user.name}
      failureReason={
        ctx.session.status === "failed"
          ? (ctx.session.failureReason ??
            "The pipeline failed for a reason it could not describe. Try again, or write shorthand instead.")
          : null
      }
      canAmend={ent.amendments}
      amendmentNotice={
        ent.amendments
          ? null
          : "Amendments are a Caseload feature. This signed note stays exactly as it is, and stays exportable."
      }
      clockLabel={
        ctx.note.draftGeneratedAt
          ? formatClock(ctx.note.draftGeneratedAt, practice.timezone)
          : formatClock(ctx.session.heldAt, practice.timezone)
      }
      signedClockLabel={
        lastSigned?.signature
          ? formatClock(lastSigned.signature.signedAt, practice.timezone)
          : null
      }
      exportHref={`/api/exports/note/${ctx.note.id}`}
      plainText={renderNoteText(ctx, chain, {
        timeZone: practice.timezone,
        signerName: user.name,
        signerCredentials: user.credentials || user.name,
      })}
    />
  );
}
