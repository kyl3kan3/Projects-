import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BeltTransition } from "@/components/belt-bar";
import { IconDownload } from "@/components/icons";
import { Empty, Pill, ScreenTitle, SectionHead } from "@/components/ui";
import { requireSchool } from "@/lib/auth";
import { listCandidates, loadEvent, previewPromotions } from "@/lib/gradings";
import { formatDate, formatDay, dayKey } from "@/lib/time";
import { CandidateList } from "./CandidateList";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ eventId: string }>;
}): Promise<Metadata> {
  const { eventId } = await params;
  const event = await loadEvent(eventId);
  return { title: event?.name ?? "Grading event" };
}

export default async function GradingEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ recorded?: string }>;
}) {
  const { school, user } = await requireSchool();
  const { eventId } = await params;
  const query = await searchParams;

  const event = await loadEvent(eventId);
  if (!event || event.schoolId !== school.id) notFound();

  const candidates = await listCandidates(eventId);
  const eligible = candidates.filter((c) => c.status === "eligible");
  const nearMiss = candidates.filter((c) => c.status === "near_miss");
  const invited = candidates.filter((c) => c.status === "invited" || c.status === "confirmed");
  const graded = candidates.filter(
    (c) => c.status === "promoted" || c.status === "held_back" || c.status === "no_show",
  );

  // The review sheet's from -> to pairs, computed from live enrollment rows.
  const reviewable = [...invited, ...eligible];
  const previews = await previewPromotions(
    eventId,
    reviewable.map((c) => c.candidateId),
  );

  const recorded = query.recorded ? Number(query.recorded) : null;

  return (
    <main className="screen">
      <ScreenTitle
        eyebrow={`${formatDate(event.heldOn, school.timezone)} · ${event.programIds.length} program${event.programIds.length === 1 ? "" : "s"}`}
        title={event.name}
        action={
          <Link href="/gradings" className="btn-quiet">
            All events
          </Link>
        }
      />

      {recorded !== null ? (
        <p className="t-data record-line crimson" role="status">
          {recorded} promotion{recorded === 1 ? "" : "s"} recorded ·{" "}
          {formatDay(dayKey(new Date(), school.timezone))} · {user.name}
        </p>
      ) : null}

      <div className="flex items-center gap-3" style={{ marginTop: 8, flexWrap: "wrap" }}>
        {event.status === "completed" ? (
          <Pill tone="ok">Completed</Pill>
        ) : event.status === "inviting" ? (
          <Pill tone="eligible">Inviting</Pill>
        ) : (
          <Pill tone="quiet">Draft</Pill>
        )}
        <span className="t-data fg-2">
          {candidates.length} candidate{candidates.length === 1 ? "" : "s"} · {eligible.length + invited.length} eligible ·{" "}
          {nearMiss.length} near miss
        </span>
      </div>

      {event.status === "completed" ? (
        <>
          <SectionHead
            right={
              <Link href={`/gradings/${eventId}/certificates`} className="btn-quiet">
                <span className="flex items-center gap-2">
                  <IconDownload size={18} /> Certificate data
                </span>
              </Link>
            }
          >
            Recorded
          </SectionHead>
          {graded.length === 0 ? (
            <Empty
              title="Completed with nothing recorded"
              body="The event was closed without promotions. Nobody's rank changed, and the near-miss list stays as the coaching record."
            />
          ) : (
            <div>
              {graded.map((candidate) => (
                <div key={candidate.candidateId} className="row-block">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="t-title">{candidate.studentName}</p>
                    {candidate.status === "promoted" ? (
                      <Pill tone="ok">Promoted</Pill>
                    ) : candidate.status === "held_back" ? (
                      <Pill tone="warn">Held back</Pill>
                    ) : (
                      <Pill tone="quiet">No show</Pill>
                    )}
                  </div>
                  <p className="t-secondary fg-3" style={{ marginTop: 2 }}>
                    {candidate.programName} · now {candidate.rankName}
                    {candidate.stripesEarned > 0
                      ? ` · ${candidate.stripesEarned} stripe${candidate.stripesEarned === 1 ? "" : "s"}`
                      : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      ) : candidates.length === 0 ? (
        <Empty
          title="Nobody is in contention yet"
          body="No active enrollment in these programs is eligible or within five classes of it. Log some check-ins and rebuild the list — or check the requirements on the ladder."
          action={
            <Link href="/curriculum" className="btn btn-secondary">
              Review the curriculum
            </Link>
          }
        />
      ) : (
        <CandidateList
          eventId={eventId}
          canGrade={user.role !== "front_desk"}
          eligible={eligible}
          nearMiss={nearMiss}
          invited={invited}
          previews={previews.map((p) => ({
            candidateId: p.candidateId ?? "",
            studentName: p.studentName,
            from: {
              beltColorHex: p.fromBeltColorHex,
              rankName: p.fromRankName,
              stripesEarned: p.fromStripes,
              stripesTotal: p.fromStripesTotal,
            },
            to: {
              beltColorHex: p.toBeltColorHex,
              rankName: p.toRankName,
              stripesEarned: p.toStripes,
              stripesTotal: p.toStripesTotal,
            },
          }))}
        />
      )}

      {event.status !== "completed" && previews.length > 0 && user.role !== "front_desk" ? (
        <>
          <SectionHead>What would be written</SectionHead>
          <div className="card" style={{ padding: 16 }}>
            {previews.slice(0, 6).map((preview, index) => (
              <div key={preview.enrollmentId} style={{ marginBottom: index === previews.length - 1 ? 0 : 16 }}>
                <p className="t-secondary" style={{ marginBottom: 6 }}>
                  {preview.studentName}
                </p>
                <BeltTransition
                  from={{
                    beltColorHex: preview.fromBeltColorHex,
                    rankName: preview.fromRankName,
                    stripesEarned: preview.fromStripes,
                    stripesTotal: preview.fromStripesTotal,
                  }}
                  to={{
                    beltColorHex: preview.toBeltColorHex,
                    rankName: preview.toRankName,
                    stripesEarned: preview.toStripes,
                    stripesTotal: preview.toStripesTotal,
                  }}
                />
              </div>
            ))}
            {previews.length > 6 ? (
              <p className="t-data fg-3" style={{ marginTop: 12 }}>
                + {previews.length - 6} more
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </main>
  );
}
