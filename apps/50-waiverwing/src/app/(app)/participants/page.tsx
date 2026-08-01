import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { recentParticipants } from "@/lib/search";
import { CoveragePill } from "@/components/CoveragePill";
import { IconLink, IconPeople } from "@/components/icons";
import { ParticipantSearch } from "./ParticipantSearch";

export const metadata: Metadata = { title: "Participants" };
export const dynamic = "force-dynamic";

export default async function ParticipantsPage() {
  const { account, location } = await requireUser();
  const recent = await recentParticipants(account.id, { timeZone: location.timezone });

  const dateFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: location.timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="px-5 lg:px-0">
      <h1 className="t-h2 pt-6">Participant database</h1>
      <p className="t-secondary mt-2">
        Every signer, forever. Search by any part of a name, an email or a phone number.
      </p>

      <div className="mt-5">
        <ParticipantSearch timeZone={location.timezone} />
      </div>

      <p className="t-label mt-8">Most recently active</p>
      <div className="mt-3">
        {recent.length === 0 ? (
          <div className="py-10">
            <IconPeople size={40} style={{ color: "var(--color-text-3)" }} />
            <p className="t-body mt-4">No participants yet.</p>
            <p className="t-secondary mt-2">
              The first signed waiver creates the first record here. Nothing to import, nothing
              to set up.
            </p>
            <Link href="/settings/poster" className="btn btn-primary mt-5">
              Print the QR poster
            </Link>
          </div>
        ) : (
          recent.map((r, i) => (
            <Link
              key={r.participantId}
              href={`/participants/${r.participantId}`}
              className="row enter no-underline"
              style={{ animationDelay: `${Math.min(i, 8) * 24}ms` }}
            >
              <span className="min-w-0 flex-1">
                <span className="t-title flex items-center gap-1.5">
                  {r.displayName}
                  {r.isMinor ? (
                    <IconLink size={14} style={{ color: "var(--color-text-3)" }} />
                  ) : null}
                </span>
                <span className="t-secondary block truncate">
                  {r.isMinor && r.guardianName ? `guardian: ${r.guardianName} · ` : ""}
                  {r.lastSignedAt
                    ? `last signed ${dateFmt.format(r.lastSignedAt).toUpperCase()}`
                    : "no waiver on file"}
                </span>
              </span>
              <CoveragePill coverage={r.coverage} />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
