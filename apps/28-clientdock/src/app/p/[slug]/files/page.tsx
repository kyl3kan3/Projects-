import type { Metadata } from "next";
import Link from "next/link";
import { listFileStacks } from "@/lib/files";
import { listApprovals } from "@/lib/approvals";
import { dayLabel, fileSize, stampDate } from "@/lib/format";
import { MODULE_COPY } from "@/components/module-copy";
import { SignageChip } from "@/components/SignageChip";
import { IconDownload } from "@/components/icons";
import { PortalTheme } from "../PortalTheme";
import { PortalFooter, PortalTopBar, PreviewNotice } from "../PortalChrome";
import { requirePortalModule } from "../guard";
import { ClientUpload } from "./ClientUpload";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Files", robots: { index: false } };

export default async function PortalFiles({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await requirePortalModule(slug, "files");
  const [stacks, approvals] = await Promise.all([
    listFileStacks(viewer.portalId),
    viewer.portal.enabledModules.includes("approvals")
      ? listApprovals(viewer.portalId)
      : Promise.resolve([]),
  ]);

  // Approved files badge in the list — the reason the audit trail is worth keeping.
  const approvedFileIds = new Set(
    approvals
      .filter((a) => a.approval.status === "approved" && a.approval.fileId)
      .map((a) => a.approval.fileId as string),
  );

  const folders = [...new Set(stacks.map((s) => s.folder))];

  return (
    <PortalTheme branding={viewer.workspace.branding}>
      <main className="screen screen-portal">
        <PortalTopBar
          branding={viewer.workspace.branding}
          agencyName={viewer.workspace.name}
          backHref={`/p/${slug}`}
        />
        <header className="pt-8 pb-6">
          <h1 className="t-h2">Files</h1>
          <p className="t-secondary mt-2">
            Every version is kept. The newest sits on top of its stack, and nothing is ever
            overwritten.
          </p>
        </header>
        <PreviewNotice show={viewer.mode === "preview"} />

        {stacks.length === 0 ? (
          <p className="t-secondary">
            {MODULE_COPY.files.empty} {viewer.workspace.name} will stock this room.
          </p>
        ) : (
          folders.map((folder) => (
            <section key={folder} className="mb-8">
              <p className="t-label mb-1">{folder}</p>
              {stacks
                .filter((s) => s.folder === folder)
                .map((stack) => (
                  <article key={stack.stackKey} className="hairline-b py-4">
                    <div className="flex items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="t-title block truncate">{stack.current.name}</span>
                        <span className="t-data mt-1 block" style={{ color: "var(--color-ink-2)" }}>
                          V{stack.current.version} · {fileSize(stack.current.size)} ·{" "}
                          {dayLabel(stack.current.createdAt)}
                        </span>
                      </span>
                      {approvedFileIds.has(stack.current.id) ? (
                        <SignageChip tone="green">approved</SignageChip>
                      ) : null}
                      <Link
                        href={`/p/${slug}/files/${stack.current.id}`}
                        className="btn btn-secondary"
                        style={{ height: 44, padding: "0 12px" }}
                        aria-label={`Download ${stack.current.name} version ${stack.current.version}`}
                      >
                        <IconDownload size={18} />
                      </Link>
                    </div>

                    {stack.versions.length > 1 ? (
                      <div className="scroll-x mt-3">
                        <div className="flex gap-2">
                          {stack.versions.map((v) => (
                            <Link
                              key={v.id}
                              href={`/p/${slug}/files/${v.id}`}
                              className="chip chip-tab"
                              data-active={v.id === stack.current.id ? "true" : undefined}
                            >
                              V{v.version} · {stampDate(v.createdAt)}
                            </Link>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </article>
                ))}
            </section>
          ))
        )}

        {viewer.mode === "client" ? (
          <section className="hairline-t pt-6">
            <p className="t-label mb-2">Send something back</p>
            <ClientUpload slug={slug} />
          </section>
        ) : null}

        <PortalFooter show={viewer.showBadge} />
      </main>
    </PortalTheme>
  );
}
