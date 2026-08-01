import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadPortalSummaries } from "@/lib/portals";
import { agoStamp } from "@/lib/format";
import { ActionForm } from "@/components/ActionForm";
import { startThreadAction } from "../portals/actions";

export const metadata: Metadata = { title: "Compose" };

/**
 * One-tap "post an update". The quietest portal is offered first, because the
 * portal that has gone longest without a word is the one costing the agency
 * goodwill.
 */
export default async function ComposePage() {
  const { workspace } = await requireUser();
  const summaries = (await loadPortalSummaries(workspace.id))
    .filter((s) => s.portal.status === "active" && s.portal.enabledModules.includes("messages"))
    .sort((a, b) => a.portal.lastUpdatedAt.getTime() - b.portal.lastUpdatedAt.getTime());

  return (
    <main className="screen screen-app" style={{ maxWidth: 640 }}>
      <header className="pt-10 pb-6">
        <p className="t-label">{workspace.name}</p>
        <h1 className="t-display mt-2">Post an update.</h1>
        <p className="t-secondary mt-3">
          Three sentences beats a status call. It also emails them, with a reply address that lands
          back in the thread.
        </p>
      </header>

      {summaries.length === 0 ? (
        <div className="card p-5">
          <p className="t-title">No live portal has messages switched on.</p>
          <p className="t-secondary mt-2">
            Switch the Messages module on for a portal, or make a draft portal live, and it will show
            up here.
          </p>
          <Link href="/dashboard" className="btn btn-secondary btn-full mt-4">
            Go to portals
          </Link>
        </div>
      ) : (
        <>
          <ActionForm action={startThreadAction} submitLabel="Send it" pendingLabel="Sending…">
            <label className="flex flex-col gap-2">
              <span className="t-label">Which portal</span>
              <select className="input" name="portalId" defaultValue={summaries[0].portal.id}>
                {summaries.map((s) => (
                  <option key={s.portal.id} value={s.portal.id}>
                    {s.client?.company ?? s.portal.title} — quiet {agoStamp(s.portal.lastUpdatedAt)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="t-label">Subject</span>
              <input
                className="input"
                name="subject"
                required
                defaultValue="This week"
                placeholder="This week"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="t-label">Update</span>
              <textarea
                className="input"
                name="body"
                rows={5}
                required
                placeholder="Homepage v3 is with you for approval. Pricing page starts Monday. Nothing needed from you besides the sign-off."
              />
            </label>
          </ActionForm>

          <section className="hairline-t mt-8 pt-6">
            <p className="t-label mb-2">Quietest first</p>
            {summaries.map((s) => (
              <Link key={s.portal.id} href={`/portals/${s.portal.id}`} className="row">
                <span className="min-w-0 flex-1">
                  <span className="t-title block truncate">
                    {s.client?.company ?? s.portal.title}
                  </span>
                  <span className="t-data block" style={{ color: "var(--color-ink-3)" }}>
                    UPDATED {agoStamp(s.portal.lastUpdatedAt)}
                  </span>
                </span>
              </Link>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
