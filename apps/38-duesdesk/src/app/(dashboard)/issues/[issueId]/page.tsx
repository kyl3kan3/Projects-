import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatIso } from "@/lib/dates";
import { ISSUE_KIND_LABELS, signPhotos, threadForBoard } from "@/lib/issues";
import { can } from "@/lib/plans";
import { IssuePill } from "@/components/ledger";
import { IconChevronLeft } from "@/components/icons";
import { AddEntryForm, NoticeForm, StatusForm } from "../IssueForms";

export const metadata: Metadata = { title: "Issue" };
export const dynamic = "force-dynamic";

const EVENT_KIND_LABELS: Record<string, string> = {
  comment: "Entry",
  status_change: "Status change",
  notice_sent: "Notice sent",
};

export default async function IssuePage({ params }: { params: Promise<{ issueId: string }> }) {
  const { user, association } = await requireUser();
  const { issueId } = await params;
  const thread = await threadForBoard(association.id, issueId);
  if (!thread) notFound();

  const { issue, household, events } = thread;
  const canEdit = can(user.role, "issues");
  const photoUrls = await signPhotos(events.flatMap((e) => e.photoKeys));

  return (
    <main className="screen">
      <header className="pt-8">
        <Link href="/issues" className="btn-quiet inline-flex items-center gap-1">
          <IconChevronLeft size={18} />
          Issues
        </Link>
        <div className="mt-6 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="t-number">{issue.number}</span>
              <span className="t-label">{ISSUE_KIND_LABELS[issue.kind]}</span>
            </span>
            <h1 className="t-h2 mt-2">{issue.title}</h1>
            <p className="t-secondary mt-1">
              {household ? (
                <Link href={`/roster/${household.id}`}>{household.unitLabel}</Link>
              ) : (
                "Common area"
              )}{" "}
              · opened {formatIso(issue.createdAt.toISOString().slice(0, 10))}
            </p>
          </div>
          <IssuePill status={issue.status} />
        </div>
      </header>

      {issue.resolutionNote ? (
        <section className="mt-6 panel p-4">
          <p className="t-label">Resolution</p>
          <p className="t-body mt-2">{issue.resolutionNote}</p>
        </section>
      ) : null}

      <section className="mt-8 split">
        <div>
          <h2 className="t-h2">Timeline</h2>
          <p className="t-secondary mt-2">
            Append-only. Nothing here is edited or removed, which is the whole reason it is worth
            anything at an annual meeting.
          </p>

          <article className="panel mt-4">
            {events.map((event, index) => {
              const boardOnly = event.visibility === "board_only";
              return (
                <div
                  key={event.id}
                  className={index === 0 ? "p-4" : "p-4 hairline-t"}
                >
                  <div className={boardOnly ? "inset p-3" : ""}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="t-title">{event.authorLabel}</span>
                      <span className="t-data ink-3">
                        {formatIso(event.createdAt.toISOString().slice(0, 10))}{" "}
                        {event.createdAt.toISOString().slice(11, 16)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="t-label">{EVENT_KIND_LABELS[event.kind] ?? "Entry"}</span>
                      {boardOnly ? (
                        <span className="t-label" style={{ color: "var(--color-amber)" }}>
                          Board only
                        </span>
                      ) : null}
                    </div>
                    <p className="t-body mt-2 whitespace-pre-wrap">{event.body}</p>
                    {event.photoKeys.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {event.photoKeys.map((key) => {
                          const url = photoUrls.get(key);
                          return url ? (
                            <a key={key} href={url} target="_blank" rel="noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img className="thumb" src={url} alt="Attached to this issue" />
                            </a>
                          ) : (
                            <span key={key} className="thumb flex items-center justify-center">
                              <span className="t-label">Missing</span>
                            </span>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </article>

          {canEdit ? (
            <div className="panel mt-4 p-4">
              <p className="t-label">Add an entry</p>
              <div className="mt-3">
                <AddEntryForm issueId={issue.id} />
              </div>
            </div>
          ) : null}
        </div>

        <div>
          {canEdit ? (
            <>
              <div className="panel p-4">
                <p className="t-label">Status</p>
                <div className="mt-3">
                  <StatusForm issueId={issue.id} current={issue.status} />
                </div>
              </div>

              {household ? (
                <div className="panel mt-4 p-4">
                  <p className="t-label">Notify the household</p>
                  <div className="mt-3">
                    <NoticeForm issueId={issue.id} kind={issue.kind} />
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          <div className="panel mt-4 p-4">
            <p className="t-label">What the household sees</p>
            <p className="t-secondary mt-2">
              {events.filter((e) => e.visibility === "member_visible").length} of {events.length}{" "}
              entries. Board-only notes are filtered out in the database query behind their portal,
              not hidden by the page — so a rendering mistake cannot leak one.
            </p>
            {household ? (
              <p className="t-secondary mt-2">
                They reach it from the payment link in any DuesDesk email.
              </p>
            ) : null}
          </div>

          {issue.status === "open" || issue.status === "in_progress" ? (
            <div className="panel mt-4 p-4">
              <p className="t-label">Before you escalate</p>
              <p className="t-secondary mt-2">
                DuesDesk does not generate legal notices or fine schedules. Violation process is set
                by your state&apos;s statute and the association&apos;s own governing documents —
                read those, and take counsel&apos;s advice, before anything beyond a notice.
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
