import type { Metadata } from "next";
import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { statusPageMonitors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { listMonitors } from "@/lib/monitors";
import { listStatusPages } from "@/lib/status-pages";
import { plan } from "@/lib/plans";
import { env } from "@/lib/env";
import { IconTrash } from "@/components/icons";
import { NewStatusPageForm } from "./NewStatusPageForm";
import {
  createStatusPageAction,
  deleteStatusPageAction,
  setMonitorsAction,
  togglePublishedAction,
} from "./actions";

export const metadata: Metadata = { title: "Status pages" };
export const dynamic = "force-dynamic";

export default async function StatusPagesScreen() {
  const { team } = await requireUser();
  const [pages, monitors] = await Promise.all([listStatusPages(team.id), listMonitors(team.id)]);
  const limits = plan(team.plan);

  const db = getDb();
  const links = pages.length
    ? await db
        .select()
        .from(statusPageMonitors)
        .where(
          inArray(
            statusPageMonitors.statusPageId,
            pages.map((p) => p.id),
          ),
        )
    : [];

  const atLimit = pages.length >= limits.statusPages;

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <p className="t-label">Status pages</p>
        <h1 className="t-h2 mt-2">
          {pages.length === 0 ? "Show your users the truth." : `${pages.length} published.`}
        </h1>
        <p className="t-secondary mt-1">
          {pages.length} of {limits.statusPages} on {limits.name}
          {limits.customDomain ? " · custom domains available" : ""}
        </p>
      </header>

      {pages.length ? (
        <section className="mb-8 flex flex-col gap-4">
          {pages.map((page) => {
            const selected = links
              .filter((l) => l.statusPageId === page.id)
              .map((l) => l.monitorId);
            const url = `${env.statusBaseUrl}/status/${page.slug}`;
            return (
              <article key={page.id} className="panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="t-title truncate">{page.title}</p>
                    <a
                      className="t-data mt-1 block truncate"
                      style={{ color: "var(--color-phosphor)" }}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {url}
                    </a>
                  </div>
                  <form action={togglePublishedAction}>
                    <input type="hidden" name="id" value={page.id} />
                    <input type="hidden" name="published" value={page.published ? "false" : "true"} />
                    <button
                      type="submit"
                      className="toggle"
                      role="switch"
                      aria-checked={page.published}
                      aria-label={page.published ? "Unpublish" : "Publish"}
                    />
                  </form>
                </div>

                <form action={setMonitorsAction} className="mt-4">
                  <input type="hidden" name="id" value={page.id} />
                  <p className="t-label mb-2">Monitors shown</p>
                  <div className="flex flex-col gap-2">
                    {monitors.map((monitor) => (
                      <label key={monitor.id} className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          name="monitorIds"
                          value={monitor.id}
                          defaultChecked={selected.includes(monitor.id)}
                          className="size-5"
                        />
                        <span className="t-secondary">{monitor.name}</span>
                      </label>
                    ))}
                  </div>
                  <button className="btn btn-secondary mt-3" type="submit">
                    Save selection
                  </button>
                </form>

                <div className="hairline-t mt-4 flex items-center justify-between pt-3">
                  <span className="t-secondary">
                    {page.showBadge
                      ? "Shows the “Monitored by PulseWatch” footer"
                      : "No PulseWatch footer"}
                  </span>
                  <form action={deleteStatusPageAction}>
                    <input type="hidden" name="id" value={page.id} />
                    <button
                      className="btn-quiet"
                      type="submit"
                      style={{ color: "var(--color-red)" }}
                      aria-label="Delete status page"
                    >
                      <IconTrash size={18} />
                    </button>
                  </form>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      <section className="pb-8">
        <p className="t-label mb-3">{pages.length ? "Add another" : "Create your first"}</p>
        {atLimit ? (
          <p className="t-secondary">
            The {limits.name} plan includes {limits.statusPages} status page
            {limits.statusPages === 1 ? "" : "s"}. Upgrade in Settings to add more.
          </p>
        ) : (
          <NewStatusPageForm
            action={createStatusPageAction}
            monitors={monitors.map((m) => ({ id: m.id, name: m.name }))}
            statusBaseUrl={env.statusBaseUrl}
            suggestedSlug={team.slug}
          />
        )}
      </section>
    </main>
  );
}
