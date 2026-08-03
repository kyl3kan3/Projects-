import type { Metadata } from "next";
import { DealLine } from "@/components/DealLine";
import { IconFile } from "@/components/icons";
import { formatLong, relativeDays } from "@/lib/dates";
import { loadPortal } from "@/lib/portal";
import { PortalUpload } from "./PortalUpload";

/**
 * /p/[token] — the party portal (DESIGN.md screen 5).
 *
 * Mobile-first at 390px, because clients read this on a phone in a car park.
 * Plain language, no login, no jargon, and never any money: done / next / what
 * we need from you, with the upload inline and the deal line in miniature.
 */
export const metadata: Metadata = {
  title: "Your transaction",
  // A capability URL must never be indexed, whatever robots.txt says.
  robots: { index: false, follow: false },
};

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await loadPortal(token);

  if (!view) {
    return (
      <main className="mx-auto max-w-md px-5 py-14">
        <span className="inline-flex items-center gap-2">
          <IconFile size={22} />
          <span className="t-title">ListingLoop</span>
        </span>
        <h1 className="t-display mt-8">This link is no longer active.</h1>
        <p className="t-body mt-3 text-dim">
          Links expire when a coordinator closes or revokes them. Reply to the last email you had
          from your coordinator and they will send a new one — nothing has gone wrong with your
          transaction.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-5 pb-16 pt-10">
      <span className="inline-flex items-center gap-2">
        <IconFile size={22} />
        <span className="t-title">ListingLoop</span>
      </span>

      <h1 className="t-display mt-8">{view.address}</h1>
      <p className="t-body mt-2 text-dim">
        {view.partyName} · {view.partyRoleLabel}. This page shows where your transaction stands. It
        updates itself; there is nothing to log in to.
      </p>

      <div className="dealline-scroll mt-8">
        <DealLine dates={view.lineDates} today={view.today} compact width={520} />
      </div>
      <p className="t-secondary mt-1">
        Each square is a date on the contract. The line marks today.
      </p>

      {view.needed.length > 0 ? (
        <section className="mt-10" aria-labelledby="needed-heading">
          <h2 id="needed-heading" className="t-h2">
            What we need from you
          </h2>
          <ul className="mt-3 list-none p-0">
            {view.needed.map((item) => (
              <li key={item.taskId} className="hairline-b py-4">
                <p className="t-title">{item.label}</p>
                {item.dueOn ? (
                  <p className="t-secondary mt-1">
                    Needed by <span className="t-mono">{formatLong(item.dueOn)}</span> —{" "}
                    {relativeDays(view.today, item.dueOn)}
                  </p>
                ) : (
                  <p className="t-secondary mt-1">No fixed date on this one yet.</p>
                )}
                {item.sentence ? <p className="t-secondary mt-1">{item.sentence}</p> : null}
                <PortalUpload token={token} taskId={item.taskId as string} label={item.label} />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="mt-10">
          <h2 className="t-h2">Nothing needed from you right now.</h2>
          <p className="t-body mt-2 text-dim">
            If that changes you will get an email before the date, not after it.
          </p>
        </section>
      )}

      {view.received.length > 0 ? (
        <section className="mt-10" aria-labelledby="received-heading">
          <h2 id="received-heading" className="t-h2">
            What you have sent us
          </h2>
          <p className="t-secondary mt-1">
            Received and on the file. Your coordinator confirms each one.
          </p>
          <ul className="mt-3 list-none p-0">
            {view.received.map((doc) => (
              <li key={doc.id} className="hairline-b py-3">
                <p className="t-title">{doc.label}</p>
                <p className="t-secondary mt-0.5">
                  {doc.filename} · <span className="t-mono">v{doc.version}</span> ·{" "}
                  <span className="t-mono">
                    {doc.uploadedAt.toISOString().slice(0, 10)}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10" aria-labelledby="next-heading">
        <h2 id="next-heading" className="t-h2">
          What is next
        </h2>
        {view.next.length === 0 ? (
          <p className="t-body mt-2 text-dim">Nothing outstanding — the file is waiting on closing.</p>
        ) : (
          <ul className="mt-3 list-none p-0">
            {view.next.map((item) => (
              <li key={item.taskId} className="hairline-b py-3">
                <p className="t-title">{item.label}</p>
                <p className="t-secondary mt-0.5">
                  {item.dueOn ? (
                    <>
                      <span className="t-mono">{formatLong(item.dueOn)}</span> ·{" "}
                      {relativeDays(view.today, item.dueOn)}
                      {item.status === "missed" ? " · past due" : ""}
                    </>
                  ) : (
                    "Waiting on a date"
                  )}
                  {item.mine ? " · yours" : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="done-heading">
        <h2 id="done-heading" className="t-h2">
          Already done
        </h2>
        {view.done.length === 0 ? (
          <p className="t-body mt-2 text-dim">Nothing ticked off yet — it is early.</p>
        ) : (
          <ul className="mt-3 list-none p-0">
            {view.done.map((item) => (
              <li key={item.taskId} className="hairline-b py-3">
                <p className="t-title">{item.label}</p>
                {item.dueOn ? (
                  <p className="t-secondary mt-0.5">
                    <span className="t-mono">{formatLong(item.dueOn)}</span>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-12 border-t border-line pt-5">
        <p className="t-secondary">
          Questions? {view.coordinatorName ?? "Your coordinator"}
          {view.coordinatorEmail ? (
            <>
              {" — "}
              <a className="btn-quiet" href={`mailto:${view.coordinatorEmail}`}>
                {view.coordinatorEmail}
              </a>
            </>
          ) : null}
          . This link is personal to you; please do not forward it.
        </p>
      </footer>
    </main>
  );
}
