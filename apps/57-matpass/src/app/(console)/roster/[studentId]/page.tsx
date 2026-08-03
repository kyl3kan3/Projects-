import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BeltBar } from "@/components/belt-bar";
import { IconFlagDrop } from "@/components/icons";
import {
  Empty,
  Pill,
  RequirementMath,
  ScreenTitle,
  SectionHead,
  Sparkline,
} from "@/components/ui";
import { requireSchool } from "@/lib/auth";
import { promotionTimeline } from "@/lib/gradings";
import { formatMoney } from "@/lib/plans";
import { loadStudent } from "@/lib/roster";
import { daysAgoPhrase, dayKey, daysBetween, formatDate, formatDay } from "@/lib/time";
import { StudentActions } from "./StudentActions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ studentId: string }>;
}): Promise<Metadata> {
  const { school } = await requireSchool();
  const { studentId } = await params;
  const detail = await loadStudent({ schoolId: school.id, studentId, timezone: school.timezone });
  return { title: detail ? `${detail.student.firstName} ${detail.student.lastName}` : "Student" };
}

export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ seated?: string; stripes?: string }>;
}) {
  const { school, user } = await requireSchool();
  const { studentId } = await params;
  const query = await searchParams;

  const detail = await loadStudent({
    schoolId: school.id,
    studentId,
    timezone: school.timezone,
  });
  if (!detail) notFound();

  const timeline = await promotionTimeline(detail.enrollments.map((e) => e.enrollment.id));
  const today = dayKey(new Date(), school.timezone);
  const justPromoted = Boolean(query.seated);

  return (
    <main className="screen">
      <ScreenTitle
        eyebrow={detail.family.name}
        title={`${detail.student.firstName} ${detail.student.lastName}`}
        action={
          <span className="flex items-center gap-2">
            {detail.student.status === "paused" ? <Pill tone="warn">Paused</Pill> : null}
            {detail.student.status === "inactive" ? <Pill tone="quiet">Inactive</Pill> : null}
            {detail.openFlagId ? (
              <Link href="/retention" className="alarm" aria-label="Open retention flag">
                <IconFlagDrop size={22} />
              </Link>
            ) : null}
          </span>
        }
      />

      {justPromoted ? (
        <p className="t-data record-line crimson" role="status">
          {query.seated}
          {query.stripes && Number(query.stripes) > 0
            ? ` · ${query.stripes} stripe${query.stripes === "1" ? "" : "s"}`
            : ""}{" "}
          · {formatDay(today)} · {user.name}
        </p>
      ) : null}

      {detail.enrollments.length === 0 ? (
        <Empty
          title="Not enrolled in a program yet"
          body="A student needs an enrollment before the belt bar means anything — the rank ladder is what eligibility is measured against."
          action={
            <Link href="/curriculum" className="btn btn-secondary">
              Open the curriculum
            </Link>
          }
        />
      ) : null}

      {detail.enrollments.map((enrollment, index) => (
        <section key={enrollment.enrollment.id} style={{ paddingTop: index === 0 ? 8 : 32 }}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="t-label">{enrollment.programName}</p>
            {enrollment.progress.eligible ? (
              <Pill tone="eligible">Eligible</Pill>
            ) : enrollment.progress.step === "top" ? (
              <Pill tone="quiet">Top of ladder</Pill>
            ) : (
              <Pill tone="warn">Near miss</Pill>
            )}
          </div>
          <p className="t-title" style={{ marginTop: 8 }}>
            {enrollment.rankName}
            {enrollment.stripesTotal > 0
              ? ` · ${enrollment.stripesEarned} of ${enrollment.stripesTotal} stripes`
              : ""}
          </p>
          <div style={{ marginTop: 12 }}>
            <BeltBar
              beltColorHex={enrollment.beltColorHex}
              rankName={enrollment.rankName}
              stripesEarned={enrollment.stripesEarned}
              stripesTotal={enrollment.stripesTotal}
              classesDone={enrollment.progress.classesDone}
              classesRequired={enrollment.progress.classesRequired}
              size="kiosk"
              met={enrollment.progress.eligible}
              seatingStripe={justPromoted && index === 0}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <RequirementMath eligibility={enrollment.progress} />
          </div>
          <p className="t-secondary fg-3" style={{ marginTop: 8 }}>
            Working toward{" "}
            {enrollment.progress.step === "stripe"
              ? "the next stripe"
              : enrollment.nextRankName
                ? enrollment.nextRankName
                : "nothing further in this ladder"}{" "}
            · promoted {formatDate(enrollment.enrollment.promotedAt, school.timezone)}
            {enrollment.enrollment.status === "paused" ? " · clock paused" : ""}
          </p>
          <StudentActions
            studentId={detail.student.id}
            studentStatus={detail.student.status}
            enrollmentId={enrollment.enrollment.id}
            atTop={enrollment.progress.step === "top"}
            signoffRequired={enrollment.signoffRequired}
            signedOff={Boolean(enrollment.enrollment.signoffAt)}
            canPromote={user.role !== "front_desk"}
            nextLabel={
              enrollment.progress.step === "stripe"
                ? "the next stripe"
                : (enrollment.nextRankName ?? "the next rank")
            }
          />
        </section>
      ))}

      <SectionHead>Attendance · last 12 weeks</SectionHead>
      <Sparkline weeks={detail.weeklyCheckins} />
      <p className="t-secondary" style={{ marginTop: 8 }}>
        <span className="t-data">{detail.totalCheckins}</span>{" "}
        {detail.totalCheckins === 1 ? "check-in" : "check-ins"} all time ·{" "}
        {detail.lastSeen
          ? `last seen ${daysAgoPhrase(daysBetween(dayKey(detail.lastSeen, school.timezone), today))}`
          : "never checked in"}
      </p>

      <SectionHead>Promotion history</SectionHead>
      {timeline.length === 0 ? (
        <p className="t-secondary">
          Nothing recorded yet. The first promotion — on the mat or at a grading — starts the
          timeline, and it is permanent from then on.
        </p>
      ) : (
        <div>
          {timeline.map((entry) => (
            <div key={entry.id} className="row-block">
              <div className="flex items-baseline justify-between gap-3">
                <p className="t-title">
                  {entry.toRankName}
                  {entry.toStripes > 0
                    ? ` · ${entry.toStripes} stripe${entry.toStripes === 1 ? "" : "s"}`
                    : ""}
                </p>
                <span className="t-data fg-3" style={{ flex: "none" }}>
                  {formatDate(entry.promotedOn, school.timezone)}
                </span>
              </div>
              <p className="t-secondary fg-3" style={{ marginTop: 2 }}>
                from {entry.fromRankName}
                {entry.fromStripes > 0 ? ` · ${entry.fromStripes} stripes` : ""} ·{" "}
                {entry.eventName ?? "on the mat"}
                {entry.graderName ? ` · ${entry.graderName}` : ""}
              </p>
              {entry.note ? (
                <p className="t-secondary" style={{ marginTop: 4 }}>
                  {entry.note}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <SectionHead>Household</SectionHead>
      <div className="card" style={{ padding: 16 }}>
        <p className="t-title">{detail.family.name}</p>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          {detail.family.email ?? "no guardian email on file"}
          {detail.family.phone ? ` · ${detail.family.phone}` : ""}
        </p>
        <p className="t-secondary fg-3" style={{ marginTop: 8 }}>
          Guardian contact lives on the household, never on the child.
        </p>
        {detail.familySiblings.length > 1 ? (
          <p className="t-secondary" style={{ marginTop: 12 }}>
            Also training:{" "}
            {detail.familySiblings
              .filter((s) => s.id !== detail.student.id)
              .map((s) => s.name)
              .join(", ")}
          </p>
        ) : null}
        <div className="flex items-center gap-3" style={{ marginTop: 16 }}>
          {detail.billing ? (
            <>
              <Pill
                tone={
                  detail.billing.status === "past_due"
                    ? "warn"
                    : detail.billing.status === "paused"
                      ? "warn"
                      : detail.billing.status === "canceled"
                        ? "quiet"
                        : "ok"
                }
              >
                {detail.billing.status === "past_due"
                  ? "Past due"
                  : detail.billing.status === "paused"
                    ? "Paused"
                    : detail.billing.status === "canceled"
                      ? "Cancelled"
                      : "Paid"}
              </Pill>
              <span className="t-secondary">
                {detail.billing.planName}
                {detail.billing.amountCents !== null
                  ? ` · ${formatMoney(detail.billing.amountCents)}`
                  : ""}
              </span>
            </>
          ) : (
            <span className="t-secondary fg-3">No membership on file</span>
          )}
          <Link href="/billing" className="btn-quiet" style={{ marginLeft: "auto" }}>
            Billing
          </Link>
        </div>
        {detail.billing?.pastDueSince ? (
          <p className="t-data amber" style={{ marginTop: 12 }}>
            card failed {formatDate(detail.billing.pastDueSince, school.timezone)} · retry link sent
            · attendance is not affected
          </p>
        ) : null}
      </div>

      <SectionHead>Kiosk PIN</SectionHead>
      <p className="t-data-lg">{detail.student.kioskPin ?? "—"}</p>
      <p className="t-secondary fg-3" style={{ marginTop: 4 }}>
        Typed at the door instead of a name. Nothing else about a student leaves the kiosk.
      </p>
    </main>
  );
}
