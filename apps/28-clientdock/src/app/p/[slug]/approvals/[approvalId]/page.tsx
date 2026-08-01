import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getApprovalScoped, noteApprovalViewed } from "@/lib/approvals";
import { fileSize, stampDate, stampDateTime } from "@/lib/format";
import { SignageChip } from "@/components/SignageChip";
import { IconDownload, IconStamp } from "@/components/icons";
import { PortalTheme } from "../../PortalTheme";
import { PortalFooter, PortalTopBar, PreviewNotice } from "../../PortalChrome";
import { requirePortalModule } from "../../guard";
import { ApprovalBar } from "./ApprovalBar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Approval", robots: { index: false } };

export default async function ApprovalScreen({
  params,
}: {
  params: Promise<{ slug: string; approvalId: string }>;
}) {
  const { slug, approvalId } = await params;
  const viewer = await requirePortalModule(slug, "approvals");

  // Scoped: the id from the URL is only ever resolved together with the portal id
  // from the signed session, so another portal's approval is simply not found.
  const found = await getApprovalScoped(viewer.portalId, approvalId);
  if (!found) notFound();
  const { approval, file, versions } = found;

  if (viewer.mode === "client" && viewer.contact) {
    await noteApprovalViewed(viewer.portalId, approval.id, viewer.contact.name).catch(() => {});
  }

  const decided = approval.status !== "pending";
  const approved = approval.status === "approved";

  return (
    <PortalTheme branding={viewer.workspace.branding}>
      <main
        className="screen screen-portal"
        style={{ paddingBottom: decided || viewer.mode === "preview" ? 80 : 200 }}
      >
        <PortalTopBar
          branding={viewer.workspace.branding}
          agencyName={viewer.workspace.name}
          backHref={`/p/${slug}/approvals`}
        />

        <header className="pt-8 pb-4">
          <div className="flex items-start gap-3">
            <h1 className="t-h2 min-w-0 flex-1">{approval.title}</h1>
            <SignageChip tone={approved ? "green" : decided ? "neutral" : "amber"}>
              {approved ? "approved" : decided ? "changes requested" : "awaiting you"}
            </SignageChip>
          </div>
          {approval.body ? <p className="t-body mt-3">{approval.body}</p> : null}
        </header>
        <PreviewNotice show={viewer.mode === "preview"} />

        {/* The deliverable on its card mat, with the seal landing in the corner. */}
        <section className="card relative mt-4 p-4" style={{ minHeight: 180 }}>
          {file ? (
            <>
              <p className="t-label">Under review</p>
              <p className="t-title mt-2">{file.name}</p>
              <p className="t-data mt-1" style={{ color: "var(--color-ink-2)" }}>
                V{file.version} · {fileSize(file.size)} · ADDED {stampDate(file.createdAt)}
              </p>
              <Link
                href={`/p/${slug}/files/${file.id}`}
                className="btn btn-secondary mt-4"
                style={{ height: 44 }}
              >
                <IconDownload size={18} />
                Open it
              </Link>
            </>
          ) : (
            <>
              <p className="t-label">No file attached</p>
              <p className="t-secondary mt-2">
                {viewer.workspace.name} is asking for a decision, not a document.
              </p>
            </>
          )}

          {approved ? (
            <span className="stamp-seal" data-press="true">
              <IconStamp size={16} />
              Approved
            </span>
          ) : null}
        </section>

        {versions.length > 1 ? (
          <div className="scroll-x mt-4">
            <div className="flex gap-2">
              {[...versions].reverse().map((v) => (
                <Link
                  key={v.id}
                  href={`/p/${slug}/files/${v.id}`}
                  className="chip chip-tab"
                  data-active={v.id === file?.id ? "true" : undefined}
                >
                  V{v.version}
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {approval.decidedAt && approval.decidedByName ? (
          <p className="t-data audit-type mt-6" style={{ color: "var(--color-ink-2)" }}>
            {approved ? "APPROVED BY " : "CHANGES REQUESTED BY "}
            {approval.decidedByName.toUpperCase()} · {stampDateTime(approval.decidedAt)}
          </p>
        ) : null}
        {approval.decisionComment ? (
          <p className="t-secondary mt-2">“{approval.decisionComment}”</p>
        ) : null}

        <section className="hairline-t mt-8 pt-6">
          <p className="t-label mb-2">Trail</p>
          <ul>
            {approval.audit.map((entry, i) => (
              <li key={i} className="t-data py-1.5" style={{ color: "var(--color-ink-2)" }}>
                {entry.event.replace("_", " ").toUpperCase()} · {entry.actor.toUpperCase()} ·{" "}
                {stampDateTime(new Date(entry.at))}
              </li>
            ))}
          </ul>
          <p className="t-secondary mt-3">
            Kept for good, so neither side has to remember who said yes and when.
          </p>
        </section>

        {decided ? (
          <p className="t-secondary mt-6">
            {approved
              ? "Nothing more needed from you. If a new version arrives, this will open again."
              : `${viewer.workspace.name} has your note. This reopens when they send the next version.`}
          </p>
        ) : viewer.mode === "client" ? (
          <ApprovalBar slug={slug} approvalId={approval.id} />
        ) : (
          <p className="t-secondary mt-6">
            In the client view you&apos;d approve from here. The buttons are theirs to press.
          </p>
        )}

        <PortalFooter show={viewer.showBadge} />
      </main>
    </PortalTheme>
  );
}
