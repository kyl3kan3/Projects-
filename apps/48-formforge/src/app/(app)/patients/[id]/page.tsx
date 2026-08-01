import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { actorFor, requireUser } from "@/lib/auth";
import { getPatientIdentity } from "@/lib/patients";
import { intakeIdsForPatient, listIntakes } from "@/lib/intakes";
import { queryAuditEvents, auditVerb } from "@/lib/audit";
import { settingsOf } from "@/lib/practices";
import { clockLocal, dayLocal, displayStatus, stampLocal } from "@/lib/format";
import { StatusPill } from "@/components/StatusPill";
import { IconChevronRight } from "@/components/icons";
import { clientIp } from "@/lib/request";

export const metadata: Metadata = { title: "Patient" };

/**
 * One patient: their packets, and the answer to the question an anxious patient or a
 * records auditor actually asks — "show me everyone who has looked at my file."
 *
 * That list is assembled from the audit rows for this patient *and* for every packet
 * they have, because a disclosure of a packet is a disclosure of the person.
 */
export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, practice } = await requireUser();
  const actor = actorFor(user, await clientIp());
  const settings = settingsOf(practice);

  const identity = await getPatientIdentity(practice, id, actor);
  if (!identity) notFound();

  const [allIntakes, intakeIds] = await Promise.all([
    listIntakes(practice.id, { limit: 500 }),
    intakeIdsForPatient(practice.id, id),
  ]);
  const theirs = allIntakes.filter((row) => row.patientId === id);

  const trail = await queryAuditEvents({
    practiceId: practice.id,
    targetIds: [id, ...intakeIds],
    limit: 60,
  });

  const now = new Date();

  return (
    <main className="screen pt-6">
      <Link href="/patients" className="btn-quiet mb-4 inline-block">
        Back to patients
      </Link>

      <h1 className="t-h2 mb-1">{identity.fullName}</h1>
      <p className="t-secondary mb-6">
        {identity.dob ? `Born ${identity.dob} · ` : ""}
        {identity.email ?? "no email on file"}
        {identity.phone ? ` · ${identity.phone}` : ""}
        {identity.smsOptOut ? " · opted out of texts" : ""}
      </p>

      <section className="mb-10">
        <h2 className="t-label mb-2">Packets</h2>
        {theirs.length === 0 ? (
          <p className="t-secondary">No packets sent to this patient yet.</p>
        ) : (
          <ul className="list-none p-0">
            {theirs.map((row) => (
              <li key={row.intake.id}>
                <Link href={`/intakes/${row.intake.id}`} className="row no-underline">
                  <span className="min-w-0 flex-1">
                    <span className="t-title block truncate">{row.formTitle}</span>
                    <span className="t-secondary block">
                      v{row.formVersion} · sent {stampLocal(row.intake.sentAt, settings.timeZone)}
                    </span>
                  </span>
                  <StatusPill status={displayStatus(row.intake, 120, now)} />
                  <span style={{ color: "var(--color-ink-3)" }}>
                    <IconChevronRight size={18} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="t-label mb-1">Who has looked at this record</h2>
        <p className="t-secondary mb-3">
          Every read, export, send and signature touching this patient or their packets. Your own
          visit to this page is the newest row.
        </p>
        <ul className="list-none p-0">
          {trail.map((event) => (
            <li key={event.id} className="ledger-row">
              <span>{dayLocal(event.createdAt, settings.timeZone)}</span>
              <span>{clockLocal(event.createdAt, settings.timeZone)}</span>
              <span className="ledger-verb">{auditVerb(event.action)}</span>
              <span className="min-w-0 break-words">{event.actorLabel}</span>
              {event.targetLabel && <span>{event.targetLabel}</span>}
              {event.ip && <span style={{ color: "var(--color-ink-3)" }}>{event.ip}</span>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
