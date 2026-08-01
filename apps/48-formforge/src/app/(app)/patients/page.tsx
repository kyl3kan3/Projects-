import type { Metadata } from "next";
import Link from "next/link";
import { actorFor, requireUser } from "@/lib/auth";
import { listPatients } from "@/lib/patients";
import { listIntakes } from "@/lib/intakes";
import { displayStatus } from "@/lib/format";
import { StatusDot } from "@/components/StatusPill";
import { IconChevronRight } from "@/components/icons";
import { clientIp } from "@/lib/request";

export const metadata: Metadata = { title: "Patients" };

/**
 * The patient directory.
 *
 * Opening this page decrypts every name in it, which is a disclosure — so it writes
 * one audit row saying how many records were opened, and the page says so out loud.
 * A practice should know that browsing the directory is on the record, because the
 * whole product promise is that it is.
 */
export default async function PatientsPage() {
  const { user, practice } = await requireUser();
  const actor = actorFor(user, await clientIp());

  const [patients, intakes] = await Promise.all([
    listPatients(practice, actor),
    listIntakes(practice.id, { limit: 500 }),
  ]);

  const now = new Date();
  const byPatient = new Map<string, { count: number; latest: Date; status: string }>();
  for (const row of intakes) {
    const existing = byPatient.get(row.patientId);
    const status = displayStatus(row.intake, 120, now);
    if (!existing || row.intake.sentAt > existing.latest) {
      byPatient.set(row.patientId, {
        count: (existing?.count ?? 0) + 1,
        latest: row.intake.sentAt,
        status,
      });
    } else {
      byPatient.set(row.patientId, { ...existing, count: existing.count + 1 });
    }
  }

  return (
    <main className="screen pt-6">
      <h1 className="t-h2 mb-1">Patients</h1>
      <p className="t-secondary mb-6">
        {patients.length === 0
          ? "A patient record is created the first time you send them a packet."
          : `${patients.length} record${patients.length === 1 ? "" : "s"}. Opening this page decrypted every name on it, and that read is in the audit log.`}
      </p>

      {patients.length === 0 ? (
        <div className="panel p-5">
          <p className="t-title">No patients yet</p>
          <p className="t-secondary mt-1 mb-4">
            Names, contact details and dates of birth are stored as ciphertext under this
            practice&apos;s own key — there is nothing to see here until you send a packet.
          </p>
          <Link href="/intakes/new" className="btn btn-secondary">
            Send an intake
          </Link>
        </div>
      ) : (
        <ul className="list-none p-0">
          {patients.map((patient, i) => {
            const summary = byPatient.get(patient.id);
            return (
              <li key={patient.id} className="enter" style={{ animationDelay: `${Math.min(i, 8) * 24}ms` }}>
                <Link href={`/patients/${patient.id}`} className="row no-underline">
                  {summary && (
                    <StatusDot status={summary.status as Parameters<typeof StatusDot>[0]["status"]} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="t-title block truncate">{patient.fullName}</span>
                    <span className="t-secondary block truncate">
                      {patient.dob ? `DOB ${patient.dob} · ` : ""}
                      {summary
                        ? `${summary.count} packet${summary.count === 1 ? "" : "s"}`
                        : "no packets sent"}
                    </span>
                  </span>
                  <span style={{ color: "var(--color-ink-3)" }}>
                    <IconChevronRight size={18} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
