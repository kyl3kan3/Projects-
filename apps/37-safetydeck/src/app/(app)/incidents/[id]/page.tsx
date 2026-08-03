import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getIncident } from "@/lib/incident-store";
import { privacyReasonLabel, severeDuty } from "@/lib/incidents";
import { monthDayYear } from "@/lib/dates";
import { ScreenHeader } from "@/components/ScreenHeader";
import { StatusPill } from "@/components/StatusPill";
import { IconDownload } from "@/components/icons";
import { CaseTools } from "./CaseTools";

export const metadata: Metadata = { title: "Case" };

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { company } = await requireUser();
  const found = await getIncident(company.id, id);
  if (!found) notFound();
  const { incident, employee, logName } = found;

  const duty = severeDuty(
    {
      treatment: incident.treatment,
      amputationOrEyeLoss: Boolean(incident.recordabilityBasis.answers.amputationOrEyeLoss),
    },
    incident.learnedAt,
  );

  return (
    <main className="screen">
      <ScreenHeader
        label={`Case ${incident.year}-${String(incident.caseNumber).padStart(3, "0")}`}
        title={logName}
        back={{ href: `/incidents?year=${incident.year}`, label: "Incidents" }}
        action={
          incident.recordable ? (
            <StatusPill tone={incident.needsJudgment ? "orange" : "red"}>
              {incident.needsJudgment ? "Review" : "Recordable"}
            </StatusPill>
          ) : (
            <StatusPill tone="green">First aid</StatusPill>
          )
        }
      />

      <div
        className="panel p-5"
        style={{
          borderLeft: `2px solid ${
            incident.recordable
              ? incident.needsJudgment
                ? "var(--color-orange)"
                : "var(--color-red)"
              : "var(--color-green)"
          }`,
        }}
      >
        <p className="t-label">Determination</p>
        <p className="t-title mt-1">{incident.recordabilityBasis.criterion}</p>
        <p className="t-data mt-1" style={{ color: "var(--color-fg-3)" }}>
          {incident.recordabilityBasis.citation} · logic {incident.formLogicVersion}
        </p>
        <p className="t-secondary mt-3">{incident.recordabilityBasis.explanation}</p>
      </div>

      <dl className="mt-6">
        <Line label="Employee" value={employee.name} />
        <Line label="On the log as" value={logName} />
        <Line label="Job title" value={employee.jobTitle ?? "—"} />
        <Line label="Occurred" value={incident.occurredAt.toISOString().slice(0, 16).replace("T", " ") + " UTC"} />
        <Line label="Office learned" value={incident.learnedAt.toISOString().slice(0, 16).replace("T", " ") + " UTC"} />
        <Line label="Site" value={incident.siteLabel} />
        <Line label="Where" value={incident.whereOccurred ?? "—"} />
        <Line label="Injury" value={incident.injuryType} />
        <Line label="Body part" value={incident.bodyPart ?? "—"} />
        <Line label="Object or substance" value={incident.objectSubstance ?? "—"} />
        <Line label="Treatment" value={incident.treatment.replace(/_/g, " ")} />
        <Line label="Days away" value={String(incident.daysAway)} />
        <Line label="Days restricted" value={String(incident.daysRestricted)} />
        <Line label="Still counting" value={incident.stillCounting ? "Yes" : "No"} />
        <Line label="Entered by" value={`${incident.createdBy} · ${monthDayYear(incident.createdAt.toISOString().slice(0, 10))}`} />
      </dl>

      <section className="mt-6">
        <h2 className="t-label">What happened</h2>
        <p className="t-body mt-2">{incident.description}</p>
      </section>

      {incident.privacyCase ? (
        <p className="t-secondary mt-6 rule-t pt-5">
          Privacy-concern case under 1904.29(b)(7):{" "}
          {privacyReasonLabel(incident.privacyReason) ?? "category recorded at intake"}. The name
          is withheld from the Form 300 and kept here instead.
        </p>
      ) : null}

      <CaseTools
        incidentId={incident.id}
        daysAway={incident.daysAway}
        daysRestricted={incident.daysRestricted}
        stillCounting={incident.stillCounting}
        duty={
          duty.required
            ? {
                hours: duty.hours,
                reason: duty.reason,
                citation: duty.citation,
                deadlineIso: duty.deadline.toISOString(),
                phone: duty.phone,
                phoneLabel: duty.phoneLabel,
                portal: duty.portal,
                note: duty.note,
              }
            : null
        }
        reportedAt={incident.reportedToOshaAt ? incident.reportedToOshaAt.toISOString().slice(0, 16) : ""}
        reportNote={incident.oshaReportNote ?? ""}
      />

      <section className="mt-10">
        <h2 className="t-label">Forms</h2>
        <a
          className="row"
          href={`/api/forms/301?incident=${incident.id}`}
          target="_blank"
          rel="noreferrer"
        >
          <IconDownload size={18} style={{ color: "var(--color-hardhat)" }} />
          <span className="min-w-0 flex-1">
            <span className="t-title block">Form 301 — incident report</span>
            <span className="t-secondary block">
              The detail report you keep on file for five years
            </span>
          </span>
        </a>
        <a
          className="row"
          href={`/api/forms/300?year=${incident.year}`}
          target="_blank"
          rel="noreferrer"
        >
          <IconDownload size={18} style={{ color: "var(--color-hardhat)" }} />
          <span className="min-w-0 flex-1">
            <span className="t-title block">Form 300 — {incident.year} log</span>
            <span className="t-secondary block">Every recordable case for the year</span>
          </span>
        </a>
      </section>
    </main>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="rule-b flex items-baseline justify-between gap-4 py-3">
      <dt className="t-label">{label}</dt>
      <dd className="t-data text-right" style={{ maxWidth: "62%" }}>
        {value}
      </dd>
    </div>
  );
}
