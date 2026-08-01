import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { CATEGORY_LABELS, CATEGORY_ORDER, documentUrl, listDocuments } from "@/lib/documents";
import { formatIso } from "@/lib/dates";
import { can, featureAllowed, planForFeature } from "@/lib/plans";
import { storageName } from "@/lib/storage";
import { Notice, Pill } from "@/components/ledger";
import { IconDownload, IconFileLines } from "@/components/icons";
import { OverflowLinks } from "@/components/TabBar";
import { UploadForm, VisibilityForm } from "./DocumentForms";

export const metadata: Metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const { user, association } = await requireUser();
  const canEdit = can(user.role, "documents");
  const allowed = featureAllowed(association.plan, "documentLibrary");

  const current = await listDocuments(association.id);
  const history = await listDocuments(association.id, { includeSuperseded: true });
  const superseded = history.filter((d) => d.supersededAt);

  const urls = new Map<string, string>();
  for (const doc of history) {
    try {
      urls.set(doc.id, await documentUrl(doc));
    } catch {
      // A signed URL failure is not a reason to fail the page; the row says so.
    }
  }

  return (
    <main className="screen">
      <header className="flex items-start justify-between gap-4 pt-8">
        <div>
          <p className="t-label">Document library</p>
          <h1 className="t-h2 mt-1">The papers the association runs on.</h1>
          <p className="t-secondary mt-1">
            {current.length} current · {superseded.length} superseded and kept
          </p>
        </div>
        <OverflowLinks />
      </header>

      {!allowed ? (
        <section className="mt-6">
          <Notice tone="warn">
            The document library is part of {planForFeature("documentLibrary").name}. Anything
            already uploaded stays visible and downloadable — a plan change never hides an
            association&apos;s own records. <Link href="/settings/billing">See plans</Link>.
          </Notice>
        </section>
      ) : null}

      <section className="mt-8">
        {current.length === 0 && superseded.length === 0 ? (
          <div className="panel p-5">
            <div className="flex items-center gap-2">
              <IconFileLines size={20} className="ink-3" />
              <p className="t-title">Nothing filed yet.</p>
            </div>
            <p className="t-secondary mt-2">
              Start with the four every board is asked for: the bylaws, the CC&amp;Rs, the most
              recent minutes, and this year&apos;s budget. Once they are here, a member asking
              &ldquo;where does it say that?&rdquo; answers themselves.
            </p>
          </div>
        ) : (
          CATEGORY_ORDER.map((category) => {
            const rows = current.filter((d) => d.category === category);
            if (rows.length === 0) return null;
            return (
              <div key={category} className="mb-8">
                <h2 className="t-label">{CATEGORY_LABELS[category]}</h2>
                <div className="mt-2">
                  {rows.map((doc) => (
                    <div key={doc.id} className="hairline-b py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="t-title">
                            {doc.title}{" "}
                            <span className="t-data ink-2">{doc.versionLabel}</span>
                          </p>
                          <p className="t-secondary mt-1">
                            {formatIso(doc.createdAt.toISOString().slice(0, 10))} ·{" "}
                            {(doc.sizeBytes / 1024).toFixed(0)} KB
                          </p>
                        </div>
                        <div className="flex flex-none items-center gap-3">
                          {doc.memberVisible ? (
                            <Pill tone="good">Members</Pill>
                          ) : (
                            <Pill tone="quiet">Board only</Pill>
                          )}
                          {urls.get(doc.id) ? (
                            <a
                              className="btn-quiet inline-flex items-center gap-1"
                              href={urls.get(doc.id)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <IconDownload size={18} />
                              Open
                            </a>
                          ) : (
                            <span className="t-secondary">link unavailable</span>
                          )}
                        </div>
                      </div>
                      {canEdit ? (
                        <div className="mt-2">
                          <VisibilityForm documentId={doc.id} memberVisible={doc.memberVisible} />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </section>

      {superseded.length > 0 ? (
        <section className="mt-4">
          <h2 className="t-h2">Superseded</h2>
          <p className="t-secondary mt-2">
            Kept on purpose. A board that amended its bylaws in 2026 still needs to show what they
            said in 2023.
          </p>
          <div className="mt-2">
            {superseded.map((doc) => (
              <div key={doc.id} className="hairline-b flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="t-title ink-2">
                    {doc.title} <span className="t-data">{doc.versionLabel}</span>
                  </p>
                  <p className="t-data ink-3 mt-1">
                    replaced {formatIso(doc.supersededAt!.toISOString().slice(0, 10))}
                  </p>
                </div>
                {urls.get(doc.id) ? (
                  <a className="btn-quiet" href={urls.get(doc.id)} target="_blank" rel="noreferrer">
                    Open
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {canEdit ? (
        <section className="mt-10">
          <h2 className="t-h2">Upload</h2>
          <div className="panel mt-4 p-5">
            <UploadForm
              allowed={allowed}
              upgradeName={planForFeature("documentLibrary").name}
              supersedable={current.map((d) => ({
                id: d.id,
                label: `${d.title} ${d.versionLabel}`,
              }))}
            />
          </div>
          <p className="t-secondary mt-4">
            Files are held in {storageName() === "r2" ? "Cloudflare R2" : "local storage on this server"}{" "}
            and served only through short-lived signed links, never a public URL.
          </p>
        </section>
      ) : null}
    </main>
  );
}
