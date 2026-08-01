import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { linkedMinors, participantCoverage } from "@/lib/search";
import { evidenceSummary, signatureHistory } from "@/lib/signatures";
import { coverageEndsAt } from "@/lib/minors";
import { CoveragePill } from "@/components/CoveragePill";
import { IconDownload, IconLink } from "@/components/icons";

export const metadata: Metadata = { title: "Participant" };
export const dynamic = "force-dynamic";

export default async function ParticipantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { account, location } = await requireUser();
  const found = await participantCoverage(account.id, id, { timeZone: location.timezone });
  if (!found) notFound();

  const { participant, state, guardian } = found;
  const minors = await linkedMinors(account.id, participant.id);
  const history = await signatureHistory(participant.id);
  const tz = location.timezone;

  // Mono date stamps carry no comma (DESIGN.md: `SIGNED MAR 2 2026`).
  const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      month: "short",
      day: "numeric",
      year: "numeric",
    })
      .format(d)
      .replace(",", "")
      .toUpperCase();

  return (
    <div className="px-5 lg:px-0">
      <div className="pt-6">
        <Link href="/participants" className="btn-quiet">
          All participants
        </Link>
      </div>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="t-h2">
            {participant.firstName} {participant.lastName}
          </h1>
          <p className="t-secondary mt-1.5">
            {participant.dob ? `Born ${participant.dob}` : "No date of birth on file"}
            {participant.isMinor ? " · minor at last signing" : ""}
          </p>
        </div>
        <CoveragePill coverage={state.coverage} />
      </div>

      {state.reason ? (
        <p className="t-secondary mt-3" style={{ color: "var(--color-ember)" }}>
          {state.reason}
        </p>
      ) : state.endsAt ? (
        <p className="t-data mt-3" style={{ color: "var(--color-text-2)" }}>
          COVERED UNTIL {fmtDate(state.endsAt)}
        </p>
      ) : (
        <p className="t-data mt-3" style={{ color: "var(--color-text-2)" }}>
          COVERAGE DOES NOT EXPIRE
        </p>
      )}

      {/* Contact */}
      <p className="t-label mt-8">Contact</p>
      <div className="mt-2">
        <div className="hairline-b flex items-center justify-between gap-4 py-3">
          <span className="t-secondary">Email</span>
          <span className="t-data">{participant.email ?? "—"}</span>
        </div>
        <div className="hairline-b flex items-center justify-between gap-4 py-3">
          <span className="t-secondary">Phone</span>
          <span className="t-data">{participant.phone ?? "—"}</span>
        </div>
        <div className="hairline-b flex items-start justify-between gap-4 py-3">
          <span className="t-secondary shrink-0">Emergency contact</span>
          <span className="t-secondary text-right" style={{ color: "var(--color-text)" }}>
            {participant.emergencyContact
              ? `${participant.emergencyContact.name} · ${participant.emergencyContact.phone} · ${participant.emergencyContact.relationship}`
              : "—"}
          </span>
        </div>
      </div>

      {Object.keys(participant.flags).length > 0 ? (
        <>
          <p className="t-label mt-8">Flags captured on the waiver</p>
          <div className="mt-2">
            {Object.entries(participant.flags).map(([label, value]) => (
              <div key={label} className="hairline-b py-3">
                <p className="t-secondary">{label}</p>
                <p className="t-body mt-1">{value}</p>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {/* Guardian / minor links */}
      {guardian ? (
        <>
          <p className="t-label mt-8">Signed for by</p>
          <Link href={`/participants/${guardian.id}`} className="row no-underline">
            <IconLink size={18} style={{ color: "var(--color-trail)" }} />
            <span className="min-w-0 flex-1">
              <span className="t-title">
                {guardian.firstName} {guardian.lastName}
              </span>
              <span className="t-secondary block">
                {history[0]?.guardianRelationship ?? "Guardian"}
                {guardian.email ? ` · ${guardian.email}` : ""}
              </span>
            </span>
          </Link>
        </>
      ) : null}

      {minors.length > 0 ? (
        <>
          <p className="t-label mt-8">Signs for</p>
          {minors.map((m) => (
            <Link key={m.id} href={`/participants/${m.id}`} className="row no-underline">
              <IconLink size={18} style={{ color: "var(--color-trail)" }} />
              <span className="min-w-0 flex-1">
                <span className="t-title">
                  {m.firstName} {m.lastName}
                </span>
                <span className="t-secondary block">Born {m.dob ?? "not recorded"}</span>
              </span>
            </Link>
          ))}
        </>
      ) : null}

      {/* Signature history — the evidence */}
      <p className="t-label mt-8">Signature history</p>
      {history.length === 0 ? (
        <p className="t-secondary py-4">
          This record exists because they were added to a guardian session or an incident, but
          nothing has been signed for them yet.
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-4">
          {history.map((sig) => {
            const evidence = evidenceSummary(sig, participant.dob, tz);
            const ends = coverageEndsAt(sig, participant.dob, tz);
            return (
              <div key={sig.id} className="panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="t-title">
                      {sig.waiverTitle}{" "}
                      <span className="t-data" style={{ color: "var(--color-text-2)" }}>
                        V{sig.waiverVersion}
                      </span>
                    </p>
                    <p className="t-secondary mt-1">
                      {sig.minorAtSigning
                        ? `Signed by ${sig.signerName} — ${sig.guardianRelationship ?? "guardian"}, when they were ${sig.signerAgeYears}`
                        : `Signed in their own name (${sig.signerAgeYears ?? "age not recorded"})`}
                    </p>
                  </div>
                  <a
                    href={`/api/signatures/${sig.id}/pdf`}
                    className="btn btn-secondary shrink-0"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <IconDownload size={16} />
                    PDF
                  </a>
                </div>

                <p className="t-data mt-3" style={{ color: "var(--color-text-2)" }}>
                  {evidence.monoLine}
                </p>
                <p className="t-data mt-1" style={{ color: "var(--color-text-3)" }}>
                  {ends.endsAt
                    ? `${ends.reason === "reached_majority" ? "AUTHORITY ENDS" : "EXPIRES"} ${fmtDate(ends.endsAt)}`
                    : "NO EXPIRY"}
                  {sig.capturedAt ? " · CAPTURED OFFLINE, SYNCED" : ""}
                </p>
                {!evidence.verified ? (
                  <p className="t-secondary mt-2" style={{ color: "var(--color-ember)" }}>
                    Evidence check failed: the stored waiver text no longer matches its hash.
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {history.length > 0 ? (
        <div className="action-bar mt-6">
          <a
            href={`/api/signatures/${history[0].id}/pdf`}
            className="btn btn-primary btn-full"
            target="_blank"
            rel="noreferrer"
          >
            <IconDownload size={18} />
            Export the current waiver as PDF
          </a>
        </div>
      ) : null}
    </div>
  );
}
