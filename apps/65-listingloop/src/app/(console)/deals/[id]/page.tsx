import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DealLine } from "@/components/DealLine";
import {
  DateStatusPlacard,
  DealStatusPlacard,
  Placard,
  TaskStatusPlacard,
} from "@/components/Placard";
import { IconDownload } from "@/components/icons";
import { activitySentence, dealActivity } from "@/lib/activity";
import { requireSession } from "@/lib/auth";
import { formatDollars } from "@/lib/commissions";
import { formatLong, formatShort, relativeDays } from "@/lib/dates";
import { loadDealFile } from "@/lib/deals";
import { latestByLabel } from "@/lib/documents";
import { canUsePartyPortal, isReadOnly } from "@/lib/plans";
import { rungLabel } from "@/lib/reminder-rules";
import { formatBytes } from "@/lib/storage";
import { PARTY_ROLE_LABELS } from "@/lib/templates";
import { AnchorSheet } from "./AnchorSheet";
import {
  CommissionEditor,
  DateActions,
  DealStatusForm,
  NoteComposer,
  PartyEditor,
  TaskActions,
  UploadForm,
} from "./DealForms";

export const metadata: Metadata = { title: "Deal file" };

export default async function DealPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ opened?: string }>;
}) {
  const { id } = await params;
  const { opened } = await searchParams;
  const { account } = await requireSession();

  const file = await loadDealFile(id, account.id, account.timezone, account.state, account.settings);
  if (!file) notFound();

  const activity = await dealActivity(file.deal.id);
  const readOnly = isReadOnly(account);
  const portalAllowed = canUsePartyPortal(account).allowed;

  const lineDates = file.dates.map((d) => ({
    key: d.key,
    label: d.label,
    dueOn: d.dueOn,
    status: d.status,
  }));
  const nextDate = file.dates.find((d) => d.status === "upcoming" || d.status === "at_risk");
  const missed = file.dates.filter((d) => d.status === "missed");
  const docsByLabel = latestByLabel(file.documents);

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-6 lg:pb-10">
      <p className="t-label">
        <Link href="/deals" className="btn-quiet">
          Pipeline
        </Link>
      </p>

      <header className="mt-2">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <h1 className="t-display">{file.deal.address}</h1>
            <p className="t-secondary mt-1">
              {file.templateName ?? "No checklist"}
              {file.deal.mlsNumber ? (
                <>
                  {" · "}
                  <span className="t-mono">{file.deal.mlsNumber}</span>
                </>
              ) : null}
              {file.deal.priceCents ? (
                <>
                  {" · "}
                  <span className="t-mono">{formatDollars(file.deal.priceCents)}</span>
                </>
              ) : null}
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <DealStatusPlacard status={file.deal.status} />
            <a className="btn btn-secondary btn-sm" href={`/api/deals/${file.deal.id}/packet`}>
              <IconDownload size={16} />
              Closing packet
            </a>
          </div>
        </div>

        <AnchorSheet
          dealId={file.deal.id}
          today={file.today}
          contractDate={file.deal.contractDate}
          acceptanceDate={file.deal.acceptanceDate}
          closingDate={file.deal.closingDate}
          dates={lineDates}
          readOnly={readOnly}
        />
      </header>

      {opened === "1" ? (
        <p className="t-body panel mt-5 p-4" role="status">
          <strong className="font-medium">
            {file.dates.length} {file.dates.length === 1 ? "date" : "dates"} computed.
          </strong>{" "}
          Every one carries the sentence that produced it — it is printed under each task below.
        </p>
      ) : null}

      {/* --- The timeline, full width on top (DESIGN.md screen 2) --- */}
      <section className="mt-8" aria-labelledby="timeline-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="timeline-heading" className="t-h2">
            The timeline
          </h2>
          <p className="t-secondary">
            {nextDate ? (
              <>
                Next: {nextDate.label} ·{" "}
                <span className="t-mono">{formatShort(nextDate.dueOn)}</span> (
                {relativeDays(file.today, nextDate.dueOn)})
              </>
            ) : (
              "Nothing left on the clock."
            )}
          </p>
        </div>
        <div className="dealline-scroll mt-4">
          <DealLine
            dates={lineDates}
            today={file.today}
            width={Math.max(720, lineDates.length * 92)}
            emptyNote="No computed dates — this file is waiting on an anchor date."
          />
        </div>
        {missed.length > 0 ? (
          <p className="t-secondary mt-2">
            <Placard tone="keybox">{missed.length} missed</Placard> —{" "}
            {missed.map((m) => m.label).join(", ")}
          </p>
        ) : null}
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.6fr_1fr]">
        {/* --- The checklist --- */}
        <div className="min-w-0">
          <section aria-labelledby="checklist-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="checklist-heading" className="t-h2">
                The checklist
              </h2>
              <span className="t-secondary">
                {file.completeness.satisfied} of {file.completeness.required} required documents on
                file
              </span>
            </div>
            <div
              className="meter mt-2"
              role="img"
              aria-label={`${file.completeness.percent}% of required documents on file`}
            >
              <div
                className="meter-fill"
                data-tone={file.completeness.percent === 100 ? "cedar" : undefined}
                style={{ width: `${file.completeness.percent}%` }}
              />
            </div>

            <ul className="mt-5 list-none p-0">
              {file.tasks.map((task) => (
                <li key={task.id} className="hairline-b py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="min-w-0">
                      <span className="t-title block">{task.label}</span>
                      <span className="t-secondary block">
                        {PARTY_ROLE_LABELS[task.ownerRole as keyof typeof PARTY_ROLE_LABELS] ??
                          task.ownerRole}
                        {task.docRequired ? " · document required" : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-baseline gap-3">
                      {task.date ? (
                        <span className="t-mono">{formatShort(task.date.dueOn)}</span>
                      ) : null}
                      <TaskStatusPlacard status={task.status} />
                    </span>
                  </div>

                  {task.date ? (
                    <p className="t-secondary mt-1">
                      <DateStatusPlacard status={task.date.status} />{" "}
                      <span className="ml-2">{task.date.sentence}</span>
                    </p>
                  ) : task.unresolvedRule ? (
                    <p className="t-secondary mt-1">
                      <span className="needs-date">Needs a date</span>{" "}
                      <span className="ml-2">{task.unresolvedRule}</span>
                    </p>
                  ) : null}

                  {task.documents.length > 0 ? (
                    <ul className="mt-2 list-none p-0">
                      {task.documents.slice(0, 4).map((doc) => (
                        <li key={doc.id} className="t-secondary">
                          <a className="btn-quiet" href={`/api/documents/${doc.id}`}>
                            {doc.filename}
                          </a>{" "}
                          <span className="t-mono">v{doc.version}</span> ·{" "}
                          {formatBytes(doc.byteSize)} · {doc.uploadedBy}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {readOnly ? null : (
                    <div className="mt-3 flex flex-col gap-2">
                      <TaskActions dealId={file.deal.id} taskId={task.id} status={task.status} />
                      {task.date ? (
                        <DateActions
                          dealId={file.deal.id}
                          dateId={task.date.id}
                          storedStatus={task.date.storedStatus}
                        />
                      ) : null}
                      {task.docRequired ? (
                        <UploadForm
                          dealId={file.deal.id}
                          taskId={task.id}
                          label={task.label}
                          compact
                        />
                      ) : null}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* --- The reminder ledger --- */}
          <section className="mt-10" aria-labelledby="ledger-heading">
            <h2 id="ledger-heading" className="t-h2">
              Reminders sent
            </h2>
            {file.reminderLedger.length === 0 ? (
              <p className="t-body mt-2 text-dim">
                Nothing has gone out yet. Each date warns its owning parties at T-7, T-3 and T-1 —
                exactly once per rung.
              </p>
            ) : (
              <ul className="mt-3 list-none p-0">
                {file.reminderLedger.map((row) => (
                  <li key={row.id} className="hairline-b py-3">
                    <p className="t-mono">
                      {rungLabel(row.offsetDays)} · {row.dateLabel}
                      {row.aboutDueOn ? ` · for ${formatShort(row.aboutDueOn)}` : ""}
                    </p>
                    <p className="t-secondary">
                      {row.sentAt.toISOString().slice(0, 16).replace("T", " ")} UTC —{" "}
                      {row.recipients.length === 0
                        ? "no addressable party"
                        : row.recipients
                            .map((r) => `${r.name}${r.failed ? " (failed)" : ""}`)
                            .join(", ")}
                    </p>
                    {row.stale ? (
                      <p className="t-secondary" style={{ color: "var(--color-amber-strong)" }}>
                        The date moved after this went out — this rung will not fire again.
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* --- Recompute history --- */}
          {file.recomputes.length > 0 ? (
            <section className="mt-10" aria-labelledby="recompute-heading">
              <h2 id="recompute-heading" className="t-h2">
                Recomputes
              </h2>
              <ul className="mt-3 list-none p-0">
                {file.recomputes.map((r) => (
                  <li key={r.id} className="hairline-b py-3">
                    <p className="diff-move">
                      {r.oldValue ? formatShort(r.oldValue) : "not set"} →{" "}
                      {formatShort(r.newValue)} · {r.diff.length}{" "}
                      {r.diff.length === 1 ? "date" : "dates"} moved
                    </p>
                    <ul className="mt-1 list-none p-0">
                      {r.diff.slice(0, 6).map((d) => (
                        <li key={d.key} className="diff-reason">
                          {d.summary}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* --- Activity + notes --- */}
          <section className="mt-10" aria-labelledby="activity-heading">
            <h2 id="activity-heading" className="t-h2">
              The file&rsquo;s memory
            </h2>
            {readOnly ? null : <NoteComposer dealId={file.deal.id} />}
            <ul className="mt-4 list-none p-0">
              {activity.map((row) => {
                const { verb, body } = activitySentence(row);
                return (
                  <li key={row.id} className="hairline-b py-3">
                    <p className="t-secondary">
                      <span className="t-mono">
                        {row.occurredAt.toISOString().slice(0, 16).replace("T", " ")}
                      </span>{" "}
                      · {row.actor}
                    </p>
                    <p className="t-body mt-0.5">
                      <span className="font-medium">{verb}</span>
                      {body ? <span className="text-dim"> — {body}</span> : null}
                    </p>
                  </li>
                );
              })}
              {activity.length === 0 ? (
                <li className="t-secondary py-3">Nothing has happened on this file yet.</li>
              ) : null}
            </ul>
          </section>
        </div>

        {/* --- The rails --- */}
        <aside className="min-w-0">
          <section aria-labelledby="parties-heading">
            <h2 id="parties-heading" className="t-h2">
              Parties
            </h2>
            <p className="t-secondary mt-1">
              {portalAllowed
                ? "A portal link lets a client read the file without an account. Revoking stops it working; re-issuing produces the same address."
                : "Portal links are on Desk and Office."}
            </p>
            <ul className="mt-3 list-none p-0">
              {file.parties.map((p) => (
                <PartyEditor
                  key={p.id}
                  dealId={file.deal.id}
                  portalAllowed={portalAllowed}
                  readOnly={readOnly}
                  party={{
                    id: p.id,
                    role: p.role,
                    name: p.name,
                    email: p.email,
                    phone: p.phone,
                    notify: p.notify,
                    hasPortal: Boolean(p.portalTokenHash),
                  }}
                />
              ))}
            </ul>
            {file.parties.length === 0 ? (
              <p className="t-secondary mt-2">
                Nobody on the file yet — a date with no addressable party cannot be reminded.
              </p>
            ) : null}
            <PartyEditor
              dealId={file.deal.id}
              party={null}
              portalAllowed={portalAllowed}
              readOnly={readOnly}
            />
          </section>

          <section className="mt-10" aria-labelledby="commission-heading">
            <h2 id="commission-heading" className="t-h2">
              Commission
            </h2>
            <div className="mt-3">
              <CommissionEditor
                dealId={file.deal.id}
                priceCents={file.deal.priceCents}
                rateBps={file.commission.rateBps}
                referralFeeCents={file.commission.referralFeeCents}
                tcFeeCents={file.commission.tcFeeCents}
                split={file.commission.split}
                lines={file.commissionLines}
                readOnly={readOnly}
              />
            </div>
          </section>

          <section className="mt-10" aria-labelledby="docs-heading">
            <h2 id="docs-heading" className="t-h2">
              Documents
            </h2>
            {docsByLabel.length === 0 ? (
              <p className="t-body mt-2 text-dim">
                Nothing on file. Every task marked &ldquo;document required&rdquo; has an upload
                below it, and a party with a portal link can send theirs straight in.
              </p>
            ) : (
              <ul className="mt-3 list-none p-0">
                {docsByLabel.map((doc) => (
                  <li key={doc.id} className="hairline-b py-2">
                    <p className="t-title">{doc.label}</p>
                    <p className="t-secondary">
                      <a className="btn-quiet" href={`/api/documents/${doc.id}`}>
                        {doc.filename}
                      </a>{" "}
                      <span className="t-mono">v{doc.version}</span> · {formatBytes(doc.byteSize)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {readOnly ? null : (
              <UploadForm dealId={file.deal.id} taskId={null} label="Other document" />
            )}
          </section>

          <section className="mt-10" aria-labelledby="status-heading">
            <h2 id="status-heading" className="t-h2">
              File status
            </h2>
            <p className="t-secondary mt-1">
              Closed and terminated files stop counting against your plan.
            </p>
            <div className="mt-3">
              {readOnly ? (
                <Placard tone="dim">Read-only</Placard>
              ) : (
                <DealStatusForm dealId={file.deal.id} status={file.deal.status} />
              )}
            </div>
            <dl className="mt-6 p-0">
              <div className="hairline-b flex items-baseline justify-between gap-4 py-2">
                <dt className="t-secondary">Contract</dt>
                <dd className="t-mono">
                  {file.deal.contractDate ? formatLong(file.deal.contractDate) : "—"}
                </dd>
              </div>
              <div className="hairline-b flex items-baseline justify-between gap-4 py-2">
                <dt className="t-secondary">Acceptance</dt>
                <dd className="t-mono">
                  {file.deal.acceptanceDate ? formatLong(file.deal.acceptanceDate) : "—"}
                </dd>
              </div>
              <div className="hairline-b flex items-baseline justify-between gap-4 py-2">
                <dt className="t-secondary">Closing</dt>
                <dd className="t-mono">
                  {file.deal.closingDate ? formatLong(file.deal.closingDate) : "—"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="t-secondary">Holiday calendar</dt>
                <dd className="t-mono">US federal + {account.state}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </main>
  );
}
