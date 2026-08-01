import type { Metadata } from "next";
import Link from "next/link";
import { listApprovals, approvalLabel, approvalTone } from "@/lib/approvals";
import { dayLabel, stampDateTime } from "@/lib/format";
import { MODULE_COPY } from "@/components/module-copy";
import { SignageChip } from "@/components/SignageChip";
import { PortalTheme } from "../PortalTheme";
import { PortalFooter, PortalTopBar } from "../PortalChrome";
import { requirePortalModule } from "../guard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Approvals", robots: { index: false } };

export default async function PortalApprovals({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await requirePortalModule(slug, "approvals");
  const approvals = await listApprovals(viewer.portalId);
  const pending = approvals.filter((a) => a.approval.status === "pending");
  const answered = approvals.filter((a) => a.approval.status !== "pending");

  return (
    <PortalTheme branding={viewer.workspace.branding}>
      <main className="screen screen-portal">
        <PortalTopBar
          branding={viewer.workspace.branding}
          agencyName={viewer.workspace.name}
          backHref={`/p/${slug}`}
        />
        <header className="pt-8 pb-6">
          <h1 className="t-h2">Approvals</h1>
          <p className="t-secondary mt-2">
            One tap approves. If something isn&apos;t right, send it back with a note — it goes
            straight to {viewer.workspace.name} with your words attached.
          </p>
        </header>

        {approvals.length === 0 ? (
          <p className="t-secondary">{MODULE_COPY.approvals.empty}</p>
        ) : null}

        {pending.length > 0 ? (
          <section className="mb-8">
            <p className="t-label mb-1">Waiting on you</p>
            {pending.map(({ approval, file }) => (
              <Link key={approval.id} href={`/p/${slug}/approvals/${approval.id}`} className="row">
                <span className="min-w-0 flex-1">
                  <span className="t-title block truncate">{approval.title}</span>
                  <span className="t-secondary block truncate">
                    {file ? `${file.name} v${file.version}` : "No file attached"} ·{" "}
                    {dayLabel(approval.createdAt)}
                  </span>
                </span>
                <SignageChip tone="amber">awaiting you</SignageChip>
              </Link>
            ))}
          </section>
        ) : null}

        {answered.length > 0 ? (
          <section>
            <p className="t-label mb-1">Answered</p>
            {answered.map(({ approval, file }) => (
              <Link key={approval.id} href={`/p/${slug}/approvals/${approval.id}`} className="row">
                <span className="min-w-0 flex-1">
                  <span className="t-title block truncate">{approval.title}</span>
                  <span className="t-data mt-1 block truncate" style={{ color: "var(--color-ink-2)" }}>
                    {approval.decidedAt && approval.decidedByName
                      ? `${approvalLabel(approval.status)} BY ${approval.decidedByName.toUpperCase()} · ${stampDateTime(approval.decidedAt)}`
                      : file
                        ? `${file.name} v${file.version}`
                        : ""}
                  </span>
                </span>
                <SignageChip
                  tone={
                    approvalTone(approval.status) === "green"
                      ? "green"
                      : approvalTone(approval.status) === "amber"
                        ? "amber"
                        : "neutral"
                  }
                >
                  {approvalLabel(approval.status)}
                </SignageChip>
              </Link>
            ))}
          </section>
        ) : null}

        <PortalFooter show={viewer.showBadge} />
      </main>
    </PortalTheme>
  );
}
