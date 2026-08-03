import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { touches } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ConsentGlyphs, DetailRow, Pill, ScreenHeader } from "@/components/ui";
import { visitValueCentsFor } from "@/lib/attribution";
import { formatDay, formatMonthYear } from "@/lib/dates";
import { money, phoneDisplay, phoneHref } from "@/lib/format";
import { bucketLongLabel, bucketFor, monthsOverdue } from "@/lib/recall";
import { getPatient } from "@/server/overdue";
import { PatientForms } from "./PatientForms";
import {
  doNotContactAction,
  optOutAction,
  recordBookingAction,
  updatePatientAction,
} from "./actions";

export const metadata: Metadata = { title: "Patient" };
export const dynamic = "force-dynamic";

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireUser();
  const found = await getPatient({ locationIds: ctx.locations.map((l) => l.id), patientId: id });
  if (!found) notFound();

  const { patient, history } = found;
  const now = new Date();
  const bucket = bucketFor(patient.nextDueOn, now);
  const months = monthsOverdue(patient.nextDueOn, now);
  const visitValueCents = visitValueCentsFor(ctx.practice.settings);

  const touchHistory = await getDb()
    .select()
    .from(touches)
    .where(and(eq(touches.patientId, patient.id)))
    .orderBy(desc(touches.occurredAt))
    .limit(12);

  return (
    <main className="screen">
      <ScreenHeader
        label={bucketLongLabel(bucket)}
        title={`${patient.firstName} ${patient.lastName}`}
        action={patient.doNotContact ? <Pill tone="red">Do not contact</Pill> : <ConsentGlyphs patient={patient} />}
      />

      <section style={{ display: "grid", gap: 2 }}>
        <DetailRow term="Chart">{patient.externalId ?? "—"}</DetailRow>
        <DetailRow term="Last visit">
          {patient.lastVisitOn ? formatDay(patient.lastVisitOn) : "none on file"}
        </DetailRow>
        <DetailRow term="Due">
          {patient.nextDueOn ? formatMonthYear(patient.nextDueOn) : "unknown"}
          {months > 0 ? ` · ${months} mo overdue` : ""}
        </DetailRow>
        <DetailRow term="Est. visit value">{money(visitValueCents)}</DetailRow>
        <DetailRow term="Mobile">
          {patient.phone ? (
            <a href={phoneHref(patient.phone)} style={{ color: "var(--color-aqua-text)" }}>
              {phoneDisplay(patient.phone)}
            </a>
          ) : (
            "none on file"
          )}
        </DetailRow>
        <DetailRow term="Email">{patient.email ?? "none on file"}</DetailRow>
      </section>

      <PatientForms
        patient={{
          id: patient.id,
          recallIntervalMonths: patient.recallIntervalMonths,
          emailConsent: patient.emailConsent,
          smsConsent: patient.smsConsent,
          hasEmail: Boolean(patient.email),
          hasPhone: Boolean(patient.phone),
          emailOptedOut: Boolean(patient.emailOptedOutAt),
          smsOptedOut: Boolean(patient.smsOptedOutAt),
          doNotContact: patient.doNotContact,
        }}
        update={updatePatientAction}
        optOut={optOutAction}
        doNotContact={doNotContactAction}
        recordBooking={recordBookingAction}
      />

      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 16 }}>
        <p className="t-label" style={{ margin: "0 0 8px" }}>
          Outreach history
        </p>
        {touchHistory.length === 0 ? (
          <p className="t-secondary" style={{ margin: 0 }}>
            Nothing has been sent to this patient yet.
          </p>
        ) : (
          touchHistory.map((touch) => (
            <div
              key={touch.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                padding: "8px 0",
                borderBottom: "1px solid var(--color-hairline)",
              }}
            >
              <span className="t-secondary" style={{ color: "var(--color-ink)" }}>
                {touch.channel === "sms" ? "Text" : touch.channel === "email" ? "Email" : "Call"} ·{" "}
                {touch.status.replace("_", " ")}
              </span>
              <span className="t-mono" style={{ color: "var(--color-ink-2)" }}>
                {formatDay(touch.occurredAt)}
              </span>
            </div>
          ))
        )}
      </section>

      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 16 }}>
        <p className="t-label" style={{ margin: "0 0 8px" }}>
          Visit history
        </p>
        {history.length === 0 ? (
          <p className="t-secondary" style={{ margin: 0 }}>
            No visits in any import. Until a visit date exists, this patient cannot be counted as
            overdue — RecallDesk does not guess.
          </p>
        ) : (
          history.map((visit, index) => (
            <div
              key={`${visit.visitedOn.toISOString()}-${index}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                padding: "8px 0",
                borderBottom: "1px solid var(--color-hairline)",
              }}
            >
              <span className="t-secondary" style={{ color: "var(--color-ink)" }}>
                {visit.kind === "hygiene" ? "Hygiene" : "Other treatment"}
                {visit.visitedOn.getTime() > now.getTime() ? " · scheduled" : ""}
              </span>
              <span className="t-mono" style={{ color: "var(--color-ink-2)" }}>
                {formatDay(visit.visitedOn)}
              </span>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
