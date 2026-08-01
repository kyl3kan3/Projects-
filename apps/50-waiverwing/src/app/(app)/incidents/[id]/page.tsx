import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { incidentFile } from "@/lib/incidents";
import { evidenceSummary } from "@/lib/signatures";
import { IconDownload, IconShieldCheck, IconShieldSlash } from "@/components/icons";
import { LinkParticipant } from "./LinkParticipant";
import { setStatusAction, unlinkParticipantAction } from "../actions";

export const metadata: Metadata = { title: "Incident" };
export const dynamic = "force-dynamic";

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { account, location } = await requireUser();
  const file = await incidentFile(account.id, id);
  if (!file) notFound();

  const tz = location.timezone;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  return (
    <div className="px-5 lg:px-0">
      <div className="pt-6">
        <Link href="/incidents" className="btn-quiet">
          All incidents
        </Link>
      </div>

      <p className="t-data mt-4" style={{ color: "var(--color-text-2)" }}>
        OCCURRED {fmt.format(file.incident.occurredAt).toUpperCase()} ·{" "}
        {file.incident.status.toUpperCase()}
      </p>
      <h1 className="t-h2 mt-1.5">{file.incident.title}</h1>
      <p className="t-secondary mt-2">
        {file.incident.whereText ? `${file.incident.whereText} · ` : ""}
        Logged by {file.loggedBy ?? "a member of staff"} at{" "}
        {fmt.format(file.incident.createdAt)}
      </p>

      <p className="t-label mt-8">The account</p>
      <p className="t-body mt-2 whitespace-pre-wrap">{file.incident.description}</p>

      <p className="t-label mt-8">People linked</p>
      {file.entries.length === 0 ? (
        <p className="t-secondary mt-2">
          Nobody linked yet. Search below — linking snapshots the waiver that was in force at the
          time of the incident, so doing it now and doing it in a week give the same file.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {file.entries.map((e) => (
            <div key={e.link.id} className="panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/participants/${e.participant.id}`}
                    className="t-title no-underline"
                    style={{ color: "var(--color-text)" }}
                  >
                    {e.participant.firstName} {e.participant.lastName}
                  </Link>
                  {e.link.note ? <p className="t-secondary mt-1">{e.link.note}</p> : null}
                </div>
                {e.signature ? (
                  <IconShieldCheck size={20} style={{ color: "var(--color-pine)" }} />
                ) : (
                  <IconShieldSlash size={20} style={{ color: "var(--color-ember)" }} />
                )}
              </div>

              {e.signature ? (
                <>
                  <p className="t-data mt-3" style={{ color: "var(--color-text-2)" }}>
                    {evidenceSummary(e.signature, e.participant.dob, tz).monoLine}
                  </p>
                  <p className="t-secondary mt-2">
                    {e.signature.waiverTitle} v{e.signature.waiverVersion}
                    {e.signature.minorAtSigning
                      ? ` — signed by ${e.signature.signerName} (${e.signature.guardianRelationship ?? "guardian"})`
                      : ""}
                  </p>
                  <a
                    href={`/api/signatures/${e.signature.id}/pdf`}
                    className="btn-quiet mt-3 inline-block"
                    target="_blank"
                    rel="noreferrer"
                  >
                    View the waiver in force
                  </a>
                </>
              ) : (
                <p className="t-data mt-3" style={{ color: "var(--color-ember)" }}>
                  NO WAIVER IN FORCE AT THE TIME OF THIS INCIDENT
                </p>
              )}

              {file.incident.status === "open" ? (
                <form action={unlinkParticipantAction} className="mt-3">
                  <input type="hidden" name="incidentId" value={file.incident.id} />
                  <input type="hidden" name="participantId" value={e.participant.id} />
                  <button className="btn-quiet" style={{ color: "var(--color-ember)" }} type="submit">
                    Unlink
                  </button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {file.incident.status === "open" ? (
        <>
          <p className="t-label mt-10">Link someone</p>
          <div className="mt-3">
            <LinkParticipant incidentId={file.incident.id} />
          </div>
        </>
      ) : null}

      <div className="action-bar mt-8 flex flex-col gap-3">
        <a
          href={`/api/incidents/${file.incident.id}/pdf`}
          className="btn btn-primary btn-full"
          target="_blank"
          rel="noreferrer"
        >
          <IconDownload size={18} />
          Export the incident file as PDF
        </a>
        <form action={setStatusAction}>
          <input type="hidden" name="incidentId" value={file.incident.id} />
          <input
            type="hidden"
            name="status"
            value={file.incident.status === "open" ? "closed" : "open"}
          />
          <button className="btn btn-secondary btn-full" type="submit">
            {file.incident.status === "open" ? "Close this incident" : "Reopen this incident"}
          </button>
        </form>
      </div>
    </div>
  );
}
