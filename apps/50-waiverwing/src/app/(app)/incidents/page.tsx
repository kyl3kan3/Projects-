import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listIncidents } from "@/lib/incidents";
import { featureAllowed } from "@/lib/plans";
import { IconFlag } from "@/components/icons";
import { NewIncidentForm } from "./NewIncidentForm";
import { localParts } from "@/lib/time";

export const metadata: Metadata = { title: "Incidents" };
export const dynamic = "force-dynamic";

export default async function IncidentsPage() {
  const { account, location } = await requireUser();
  const allowed = featureAllowed(account, "incidents");
  const incidents = allowed ? await listIncidents(account.id) : [];

  const open = incidents.filter((i) => i.status === "open");
  const closed = incidents.filter((i) => i.status === "closed");

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: location.timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  // datetime-local wants the venue's wall clock, not the server's.
  const p = localParts(new Date(), location.timezone);
  const pad = (n: number) => String(n).padStart(2, "0");
  const defaultLocal = `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;

  return (
    <div className="px-5 lg:px-0">
      <h1 className="t-h2 pt-6">Incidents</h1>
      <p className="t-secondary mt-2">
        Log it here and the waivers are already in the room. Each linked person carries the exact
        waiver that was in force when it happened.
      </p>

      {!allowed ? (
        <div className="panel mt-6 p-4">
          <p className="t-title">Incident notes are part of Front Desk</p>
          <p className="t-secondary mt-2">
            Everything else keeps running — waivers, search, PDF export. Incidents unlock at $59
            a month.
          </p>
          <Link href="/settings/billing" className="btn btn-primary mt-4">
            Compare plans
          </Link>
        </div>
      ) : (
        <>
          <p className="t-label mt-8">Open</p>
          {open.length === 0 ? (
            <div className="py-8">
              <IconFlag size={40} style={{ color: "var(--color-text-3)" }} />
              <p className="t-body mt-4">No open incidents.</p>
              <p className="t-secondary mt-2">
                The quiet state is the good one. When something does happen, log it here the same
                day — the file is much better when it is written while it is fresh.
              </p>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-4">
              {open.map((i) => (
                <Link
                  key={i.id}
                  href={`/incidents/${i.id}`}
                  className="panel block p-4 no-underline"
                  style={{ borderLeft: "2px solid var(--color-ember)" }}
                >
                  <p className="t-data" style={{ color: "var(--color-text-2)" }}>
                    {fmt.format(i.occurredAt).toUpperCase()}
                  </p>
                  <p className="t-title mt-1.5">{i.title}</p>
                  <p className="t-secondary mt-1">
                    {i.linkedCount === 0
                      ? "Nobody linked yet"
                      : `${i.linkedCount} ${i.linkedCount === 1 ? "person" : "people"} linked`}
                    {i.whereText ? ` · ${i.whereText}` : ""}
                  </p>
                </Link>
              ))}
            </div>
          )}

          {closed.length > 0 ? (
            <>
              <p className="t-label mt-10">Closed</p>
              <div className="mt-2">
                {closed.map((i) => (
                  <Link key={i.id} href={`/incidents/${i.id}`} className="row no-underline">
                    <span className="min-w-0 flex-1">
                      <span className="t-title">{i.title}</span>
                      <span className="t-secondary block">
                        {i.linkedCount} linked
                        {i.whereText ? ` · ${i.whereText}` : ""}
                      </span>
                    </span>
                    <span className="t-data shrink-0" style={{ color: "var(--color-text-3)" }}>
                      {fmt.format(i.occurredAt).toUpperCase()}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          ) : null}

          <p className="t-label mt-10">Log a new incident</p>
          <div className="mt-3">
            <NewIncidentForm defaultLocal={defaultLocal} />
          </div>
        </>
      )}
    </div>
  );
}
