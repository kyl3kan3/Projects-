import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { jurisdictionSources } from "@/db/schema";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCalendarInspection,
  IconMapPin,
  IconRefresh,
} from "@/components/icons";
import { ChecklistBoard } from "@/components/ChecklistBoard";
import { RequirementCard } from "@/components/RequirementCard";
import { StatusPill } from "@/components/StatusPill";
import { requireUser } from "@/lib/auth";
import { loadChecklist } from "@/lib/checklists";
import { longDate, money, progressLabel, relativeDays, shortDate } from "@/lib/format";
import { getJob } from "@/lib/jobs";
import { jobTypeLabel } from "@/lib/taxonomy";
import { allowedTransitions, displayStatus, expiryRuleLabel, listApplications } from "@/lib/tracker";
import { STATUS_LABEL } from "@/lib/statuses";
import { closeJobAction, recordInspectionResultAction, regenerateChecklistAction } from "../actions";
import { AddApplicationForm, AddInspectionForm, NotesForm, TransitionForm } from "./JobForms";

export const metadata: Metadata = { title: "Job" };

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org } = await requireUser();
  const detail = await getJob(id, org.id);
  if (!detail) notFound();

  const { job, jurisdiction } = detail;
  const bundle = await loadChecklist(job.id);
  const applications = await listApplications(job.id);

  const source = bundle?.record.sourceId
    ? ((await getDb()
        .select()
        .from(jurisdictionSources)
        .where(eq(jurisdictionSources.id, bundle.record.sourceId))) ?? [])[0]
    : null;

  return (
    <main className="screen pt-6">
      <Link href="/jobs" className="btn-quiet btn-quiet-sm">
        <IconArrowLeft size={18} />
        Jobs
      </Link>

      <header className="mt-4">
        <h1 className="t-h2">{job.siteAddress}</h1>
        <p className="t-secondary mt-1 flex items-center gap-1.5">
          <IconMapPin size={16} style={{ color: "var(--color-fg-3)" }} />
          {jurisdiction.name} · {jobTypeLabel(job.jobType)}
          {detail.assignedName ? ` · ${detail.assignedName}` : ""}
        </p>
        {bundle && (
          <p className="t-data mt-2" style={{ color: "var(--color-fg-3)" }}>
            {progressLabel(bundle.progress.verified, bundle.progress.total)} · pinned to v
            {bundle.record.version} · generated {shortDate(bundle.checklist.generatedAt)}
          </p>
        )}
      </header>

      {bundle?.stale && (
        <div className="banner banner-enter mt-5">
          <IconAlertTriangle size={18} style={{ color: "var(--color-ochre)" }} />
          <div className="min-w-0 flex-1">
            <p className="t-title">Requirements changed since this checklist was generated</p>
            <p className="t-secondary mt-1">
              This job is still working from v{bundle.record.version}. Nothing has been rewritten —
              review the diff, then regenerate when the crew is ready. Stamps you have already made
              are kept.
            </p>
            <div className="mt-2 flex flex-wrap gap-4">
              <Link
                href={`/jurisdictions/${jurisdiction.slug}/history/${job.jobType}`}
                className="btn-quiet btn-quiet-sm"
              >
                View the diff
              </Link>
              <form action={regenerateChecklistAction}>
                <input type="hidden" name="jobId" value={job.id} />
                <button type="submit" className="btn-quiet btn-quiet-sm">
                  <IconRefresh size={16} />
                  Regenerate from the current version
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {bundle ? (
        <>
          <div className="mt-6">
            <RequirementCard
              record={bundle.record}
              jurisdiction={jurisdiction}
              sourceLabel={source?.label ?? null}
              sourceUrl={source?.url ?? null}
              historyHref={`/jurisdictions/${jurisdiction.slug}/history/${job.jobType}`}
              suggestHref={`/jurisdictions/${jurisdiction.slug}/suggest/${bundle.record.id}`}
            />
          </div>

          <div className="mt-6">
            <ChecklistBoard
              items={bundle.items.map((item) => ({
                id: item.id,
                kind: item.kind,
                title: item.title,
                detail: item.detail,
                state: item.state,
                verifiedAt: item.verifiedAt ? item.verifiedAt.toISOString() : null,
                naReason: item.naReason,
              }))}
            />
          </div>
        </>
      ) : (
        <NotCoveredYet
          jurisdictionName={jurisdiction.name}
          departmentName={jurisdiction.departmentName}
          phone={jurisdiction.contact.phone ?? null}
          hours={jurisdiction.contact.hours ?? null}
          portalUrl={jurisdiction.portalUrl}
          jobType={job.jobType}
        />
      )}

      {/* ---- Permit applications ---- */}
      <section className="mt-8">
        <h2 className="t-h2">Permit applications</h2>
        {applications.length === 0 && (
          <p className="t-secondary mt-2">
            Nothing submitted yet. Add the application when it goes over the counter and the status
            timeline starts here.
          </p>
        )}

        {applications.map(({ application, inspections }) => {
          const status = displayStatus(application);
          return (
            <article key={application.id} className="mt-5 hairline-t pt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="t-title">{application.permitName}</p>
                  {application.jurisdictionRefNumber && (
                    <p className="t-data mt-1" style={{ color: "var(--color-fg-2)" }}>
                      {application.jurisdictionRefNumber}
                    </p>
                  )}
                </div>
                <StatusPill status={status} />
              </div>

              {application.expiresAt && (
                <p
                  className="t-secondary mt-2"
                  style={{
                    color: status === "expired" ? "var(--color-signal-red)" : "var(--color-fg-2)",
                  }}
                >
                  <span className="t-mono">{longDate(application.expiresAt)}</span> —{" "}
                  {status === "expired" ? "expired" : `expires ${relativeDays(application.expiresAt)}`}.{" "}
                  {expiryRuleLabel(jurisdiction)}.
                </p>
              )}

              <ol className="mt-3">
                {application.statusHistory.map((event, index) => (
                  <li key={`${event.at}-${index}`} className="flex gap-3 py-1">
                    <span className="t-data shrink-0" style={{ color: "var(--color-fg-3)" }}>
                      {shortDate(new Date(event.at))}
                    </span>
                    <span className="t-secondary">
                      {STATUS_LABEL[event.status]}
                      {event.note ? ` — ${event.note}` : ""} · {event.by}
                    </span>
                  </li>
                ))}
              </ol>

              <TransitionForm
                applicationId={application.id}
                options={allowedTransitions(application.status)}
                needsRef={!application.jurisdictionRefNumber}
              />

              <div className="mt-4">
                <p className="t-label">Inspections</p>
                {inspections.length === 0 && (
                  <p className="t-secondary mt-1">
                    None noted. The record's inspection sequence is on the requirement card above.
                  </p>
                )}
                <ul>
                  {inspections.map((inspection) => (
                    <li key={inspection.id} className="row">
                      <IconCalendarInspection
                        size={18}
                        style={{ color: "var(--color-fg-3)" }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="t-title block">{inspection.inspectionType}</span>
                        <span className="t-secondary block">
                          {inspection.scheduledFor
                            ? `Scheduled ${longDate(inspection.scheduledFor)}`
                            : "Not scheduled"}
                          {inspection.leadTimeDays
                            ? ` · book ${inspection.leadTimeDays} day${inspection.leadTimeDays === 1 ? "" : "s"} ahead`
                            : ""}
                          {inspection.reinspectionFeeCents
                            ? ` · reinspection ${money(inspection.reinspectionFeeCents)}`
                            : ""}
                        </span>
                        {inspection.contactNotes && (
                          <span className="t-secondary block">{inspection.contactNotes}</span>
                        )}
                        {inspection.result === "pending" && (
                          <span className="mt-2 flex gap-3">
                            <form action={recordInspectionResultAction}>
                              <input type="hidden" name="inspectionId" value={inspection.id} />
                              <input type="hidden" name="applicationId" value={application.id} />
                              <input type="hidden" name="result" value="passed" />
                              <button type="submit" className="btn-quiet btn-quiet-sm">
                                Passed
                              </button>
                            </form>
                            <form action={recordInspectionResultAction}>
                              <input type="hidden" name="inspectionId" value={inspection.id} />
                              <input type="hidden" name="applicationId" value={application.id} />
                              <input type="hidden" name="result" value="failed" />
                              <button
                                type="submit"
                                className="btn-quiet btn-quiet-sm"
                                style={{ color: "var(--color-signal-red)" }}
                              >
                                Failed
                              </button>
                            </form>
                          </span>
                        )}
                      </span>
                      <span
                        className="t-data shrink-0"
                        style={{
                          color:
                            inspection.result === "failed"
                              ? "var(--color-signal-red)"
                              : inspection.result === "passed"
                                ? "var(--color-brick)"
                                : "var(--color-fg-3)",
                        }}
                      >
                        {inspection.result}
                      </span>
                    </li>
                  ))}
                </ul>

                <AddInspectionForm
                  applicationId={application.id}
                  suggestions={bundle?.record.inspectionSequence ?? []}
                  defaultLeadTime={bundle?.record.inspectionLeadTimeDays ?? null}
                  defaultContact={bundle?.record.inspectionContact ?? null}
                />
              </div>
            </article>
          );
        })}

        <AddApplicationForm
          jobId={job.id}
          suggestions={bundle?.record.permitsRequired ?? ["Building permit"]}
        />
      </section>

      <section className="mt-8">
        <NotesForm jobId={job.id} notes={job.notes ?? ""} />
      </section>

      <section className="mt-8 hairline-t pt-4">
        <form action={closeJobAction}>
          <input type="hidden" name="jobId" value={job.id} />
          <input type="hidden" name="status" value={job.status === "active" ? "closed" : "active"} />
          <button type="submit" className="btn btn-secondary btn-full">
            {job.status === "active" ? "Close this job" : "Reopen this job"}
          </button>
        </form>
        <p className="t-secondary mt-2">
          Closing frees an active-job slot on your plan. Nothing is deleted — the checklist, the
          stamps, and the permit timeline stay on the record.
        </p>
      </section>
    </main>
  );
}

/**
 * The honest gap. No invented requirements: the department's own contact card, and
 * a coverage request already filed on the org's behalf.
 */
function NotCoveredYet({
  jurisdictionName,
  departmentName,
  phone,
  hours,
  portalUrl,
  jobType,
}: {
  jurisdictionName: string;
  departmentName: string;
  phone: string | null;
  hours: string | null;
  portalUrl: string | null;
  jobType: string;
}) {
  return (
    <section className="card mt-6">
      <p className="t-label">Not covered yet</p>
      <p className="t-body mt-2">
        We have no verified {jobTypeLabel(jobType).toLowerCase()} record for {jurisdictionName}, so
        there is nothing to generate. We filed a coverage request when you created this job — rather
        than guess at a fee and have you eat the difference.
      </p>
      <div className="mt-4 hairline-t pt-3">
        <p className="t-title">{departmentName}</p>
        {phone && <p className="t-data mt-1">{phone}</p>}
        {hours && <p className="t-secondary mt-1">{hours}</p>}
        {portalUrl && (
          <a
            href={portalUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="btn-quiet btn-quiet-sm mt-2"
          >
            Open their portal
          </a>
        )}
      </div>
    </section>
  );
}
