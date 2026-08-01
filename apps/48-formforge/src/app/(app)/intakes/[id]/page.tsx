import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { actorFor, requireUser } from "@/lib/auth";
import { getIntake, readPacket } from "@/lib/intakes";
import { getPatientIdentity } from "@/lib/patients";
import { auditForIntake, auditVerb } from "@/lib/audit";
import { remindersForIntake } from "@/lib/reminders";
import { uploadSummaries } from "@/lib/uploads";
import { blockFields, blockHeading, safeConfig, screenerAnswers, screenerInstrument } from "@/lib/blocks";
import { SCREENERS, scoreLine, scoreScreener } from "@/lib/screeners";
import { evidenceSummary } from "@/lib/signature";
import { canExportCsv } from "@/lib/plans";
import { settingsOf } from "@/lib/practices";
import { bytesLabel, clockLocal, dayLocal, displayStatus, shortHash, stampLocal } from "@/lib/format";
import { StatusPill } from "@/components/StatusPill";
import { SignatureBlock } from "@/components/SignatureBlock";
import { IconAlert, IconBell, IconDownload, IconFile } from "@/components/icons";
import { clientIp } from "@/lib/request";
import { resendLinkAction, stopRemindersAction } from "../actions";

export const metadata: Metadata = { title: "Packet" };

/**
 * One packet, read in full — the screen that produces a `viewed` audit row every
 * single time it loads. That is not incidental: this is the page that answers "who
 * saw this patient's answers", and it can only answer it honestly if it is itself
 * on the record.
 *
 * The reminder history and the audit trail below are rendered from the same rows
 * an auditor would export, so what staff see and what an auditor gets are the
 * same facts.
 */
export default async function IntakeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, practice } = await requireUser();
  const resolved = await getIntake(practice.id, id);
  if (!resolved) notFound();

  const ip = await clientIp();
  const actor = actorFor(user, ip);
  const settings = settingsOf(practice);

  const [packet, identity, reminders, files, trail] = await Promise.all([
    readPacket(resolved, actor),
    getPatientIdentity(practice, resolved.intake.patientId, actor),
    remindersForIntake(resolved.intake.id),
    uploadSummaries(practice, resolved.intake.id, actor),
    auditForIntake(practice.id, resolved.intake.id),
  ]);

  const status = displayStatus(resolved.intake, 120);
  const hideScores = settings.hideScoresFromFrontDesk && user.role === "frontdesk";
  const blocks = resolved.version.blocks;
  const answered = Object.keys(packet.answers).length;

  return (
    <main className="screen pt-6">
      <Link href="/intakes" className="btn-quiet mb-4 inline-block">
        Back to intakes
      </Link>

      <div className="mb-1 flex items-start justify-between gap-3">
        <h1 className="t-h2 min-w-0 break-words">{identity?.fullName ?? "Patient record"}</h1>
        <StatusPill status={status} />
      </div>
      <p className="t-data mb-1" style={{ color: "var(--color-ink-2)" }}>
        {resolved.version.title.toUpperCase()} · V{resolved.version.version}
      </p>
      <p className="t-secondary mb-6">
        Sent {stampLocal(resolved.intake.sentAt, settings.timeZone)}
        {resolved.intake.completedAt
          ? ` · finished ${stampLocal(resolved.intake.completedAt, settings.timeZone)}`
          : ` · link expires ${stampLocal(resolved.intake.expiresAt, settings.timeZone)}`}
        {identity?.dob ? ` · DOB ${identity.dob}` : ""}
      </p>

      {/* ---- actions ---- */}
      <div className="mb-8 flex flex-wrap gap-3">
        <a href={`/api/exports/packet/${resolved.intake.id}`} className="btn btn-secondary">
          <IconDownload size={18} />
          Export PDF
        </a>
        {canExportCsv(practice.plan) && (
          <a href="/api/exports/intakes.csv" className="btn btn-secondary">
            Export CSV
          </a>
        )}
        {(status === "sent" || status === "started" || status === "overdue") && (
          <>
            <form action={resendLinkAction}>
              <input type="hidden" name="intakeId" value={resolved.intake.id} />
              <button className="btn btn-secondary" type="submit">
                Resend link
              </button>
            </form>
            <form action={stopRemindersAction}>
              <input type="hidden" name="intakeId" value={resolved.intake.id} />
              <button className="btn btn-secondary" type="submit">
                <IconBell size={18} />
                Stop reminders
              </button>
            </form>
          </>
        )}
      </div>

      {answered === 0 && packet.signatures.length === 0 ? (
        <div className="panel p-5">
          <p className="t-title">Nothing filled in yet</p>
          <p className="t-secondary mt-1">
            The packet has been sent but not started. Reminders below are scheduled; resending the
            link issues a new one and retires the old.
          </p>
        </div>
      ) : (
        <>
          {/* ---- answers ---- */}
          {blocks.map((block) => {
            if (block.kind === "consent" || block.kind === "signature") return null;

            if (block.kind === "screener") {
              const instrument = screenerInstrument(block);
              if (!instrument) return null;
              const def = SCREENERS[instrument];
              const raw = screenerAnswers(block, packet.answers);
              const result = scoreScreener(instrument, raw);
              if (hideScores) {
                return (
                  <section key={block.key} className="mb-8">
                    <h2 className="t-label mb-2">{def.name}</h2>
                    <p className="t-secondary">
                      Screener scores are hidden for the front-desk role in this practice&apos;s
                      settings.
                    </p>
                  </section>
                );
              }
              return (
                <section key={block.key} className="mb-8">
                  <h2 className="t-label mb-2">{def.name}</h2>
                  <p className="t-data mb-1" style={{ fontSize: 15 }}>
                    {scoreLine(result)}
                  </p>
                  <p className="t-secondary mb-3">
                    {result.answered} of {result.items} items answered
                  </p>
                  {result.flagged && (
                    <p
                      className="mb-3 flex items-start gap-2 text-[13px] leading-[1.45]"
                      style={{ color: "var(--color-clay)" }}
                    >
                      <IconAlert size={18} />
                      <span>
                        Item 9 was answered above zero. This packet was flagged for the assigned
                        clinician when it was submitted.
                      </span>
                    </p>
                  )}
                  <ol className="list-none p-0">
                    {def.items.map((item, i) => {
                      const value = raw[i];
                      const option = def.options.find((o) => String(o.value) === value);
                      return (
                        <li key={i} className="hairline-b py-3">
                          <p className="t-secondary">
                            {i + 1}. {item}
                          </p>
                          <p className="t-data mt-1" style={{ color: "var(--color-ink)" }}>
                            {option ? `${option.value} · ${option.label}` : "not answered"}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              );
            }

            const fields = blockFields(block);
            const fileRows = files.filter((f) => f.blockKey === block.key);
            return (
              <section key={block.key} className="mb-8">
                <h2 className="t-label mb-2">{blockHeading(block)}</h2>
                {fields.length > 0 && (
                  <dl className="m-0">
                    {fields.map((field) => (
                      <div key={field.name} className="hairline-b py-3">
                        <dt className="t-secondary">{field.label}</dt>
                        <dd className="m-0 mt-1" style={{ fontSize: 16, lineHeight: 1.5 }}>
                          {packet.answers[field.name]?.trim() || (
                            <span style={{ color: "var(--color-ink-3)" }}>—</span>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                {fileRows.map((file) => (
                  <a
                    key={file.id}
                    href={`/api/exports/upload/${file.id}`}
                    className="row no-underline"
                    style={{ color: "var(--color-ink)" }}
                  >
                    <span style={{ color: "var(--color-teal)" }}>
                      <IconFile size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="t-title block truncate">{file.filename}</span>
                      <span className="t-secondary">
                        {file.contentType} · {bytesLabel(file.byteSize)}
                      </span>
                    </span>
                    <IconDownload size={18} />
                  </a>
                ))}
              </section>
            );
          })}

          {/* ---- signatures and evidence ---- */}
          {packet.signatures.length > 0 && (
            <section className="mb-8">
              <h2 className="t-label mb-3">Signatures</h2>
              {packet.signatures.map((entry) => {
                const summary = evidenceSummary(entry.record, entry.signedName);
                const block = blocks.find((b) => b.key === entry.record.blockKey);
                const heading = block ? safeConfig("signature", block.config)?.heading : null;
                return (
                  <div key={entry.record.id} className="panel mb-4 p-4">
                    <p className="t-label mb-3">{heading ?? "Signature"}</p>
                    <SignatureBlock
                      kind={entry.record.kind}
                      payload={entry.payload}
                      signedName={entry.signedName}
                      monoLine={summary.monoLine}
                      replay={false}
                    />
                    <details className="mt-4">
                      <summary className="btn-quiet" style={{ cursor: "pointer" }}>
                        Evidence summary
                      </summary>
                      <ul className="mt-3 list-none p-0">
                        {summary.lines.map((line, i) => (
                          <li
                            key={i}
                            className="t-data py-1"
                            style={{
                              color: summary.verified ? "var(--color-ink-2)" : "var(--color-clay)",
                              wordBreak: "break-word",
                            }}
                          >
                            {line}
                          </li>
                        ))}
                      </ul>
                      <p className="t-secondary mt-2">
                        The text above is the copy stored with this signature, not the packet as it
                        reads today. Editing the packet publishes a new version and leaves this
                        untouched.
                      </p>
                    </details>
                  </div>
                );
              })}
            </section>
          )}
        </>
      )}

      {/* ---- reminders ---- */}
      <section className="mb-8">
        <h2 className="t-label mb-2">Reminders</h2>
        {reminders.length === 0 ? (
          <p className="t-secondary">No reminders scheduled for this packet.</p>
        ) : (
          <ul className="list-none p-0">
            {reminders.map((r) => (
              <li key={r.id} className="ledger-row">
                <span>{dayLocal(r.scheduledFor, settings.timeZone)}</span>
                <span>{clockLocal(r.scheduledFor, settings.timeZone)}</span>
                <span className="ledger-verb">{r.channel.toUpperCase()}</span>
                <span>step {r.step + 1}</span>
                <span
                  style={{
                    color:
                      r.status === "sent"
                        ? "var(--color-moss)"
                        : r.status === "failed"
                          ? "var(--color-clay)"
                          : "var(--color-ink-3)",
                  }}
                >
                  {r.status.toUpperCase()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- this packet's own audit trail ---- */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="t-label">Who touched this packet</h2>
          <Link href={`/audit?target=${resolved.intake.id}`} className="btn-quiet">
            Full ledger
          </Link>
        </div>
        <ul className="list-none p-0">
          {trail.slice(0, 12).map((event) => (
            <li key={event.id} className="ledger-row">
              <span>{clockLocal(event.createdAt, settings.timeZone)}</span>
              <span>{dayLocal(event.createdAt, settings.timeZone)}</span>
              <span className="ledger-verb">{auditVerb(event.action)}</span>
              <span className="min-w-0 break-words">{event.actorLabel}</span>
              {event.targetLabel && <span>{event.targetLabel}</span>}
              {event.ip && <span style={{ color: "var(--color-ink-3)" }}>{event.ip}</span>}
            </li>
          ))}
        </ul>
        <p className="t-secondary mt-3">
          Your visit to this page is on that list. The audit table refuses UPDATE and DELETE at the
          database level — {shortHash(resolved.version.blocksHash)} is this version&apos;s content
          hash.
        </p>
      </section>
    </main>
  );
}
