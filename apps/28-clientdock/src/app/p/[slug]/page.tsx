import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPortalShell, loadPortalView, recordVisit, resolveViewer } from "@/lib/portal-access";
import { agoStamp, dayLabel, moneyShort, overallProgress } from "@/lib/format";
import { MODULE_COPY } from "@/components/module-copy";
import { SignageChip } from "@/components/SignageChip";
import { IconBell } from "@/components/icons";
import { PortalTheme } from "./PortalTheme";
import { PortalFooter, PortalTopBar, PreviewNotice, WelcomeBand } from "./PortalChrome";
import { AccessRequest } from "./AccessRequest";
import type { ModuleId } from "@/db/schema";

/**
 * A portal is private: never cached at the edge, never revalidated into a shared
 * store. Reading the portal-session cookie already forces a dynamic render; this
 * says so out loud, because a cached portal page would be the worst bug this app
 * could have.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const shell = await loadPortalShell((await params).slug);
  return {
    // The title is the only thing a link preview can ever show, so it carries the
    // agency's name and nothing about the work.
    title: shell ? `${shell.workspace.name} — client portal` : "Client portal",
    robots: { index: false, follow: false },
  };
}

export default async function PortalHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const resolved = await resolveViewer(slug);
  if (resolved.kind === "not-found") notFound();

  if (resolved.kind === "needs-access" || resolved.kind === "closed") {
    const { shell } = resolved;
    return (
      <PortalTheme branding={shell.workspace.branding}>
        <main className="screen screen-portal">
          <PortalTopBar branding={shell.workspace.branding} agencyName={shell.workspace.name} />
          <div className="pt-10">
            <h1 className="t-display">
              {resolved.kind === "closed" ? "This portal is closed." : "Your link has expired."}
            </h1>
            <p className="t-secondary mt-3">
              {resolved.kind === "closed"
                ? `${shell.workspace.name} has closed this portal. Nothing has been deleted — get in touch with them if you need it back.`
                : "Links are single-use, which is what keeps the portal private. Ask for another and it arrives in a moment."}
            </p>
          </div>
          {resolved.kind === "needs-access" ? (
            <div className="mt-8">
              <AccessRequest slug={slug} agencyName={shell.workspace.name} />
            </div>
          ) : null}
          <PortalFooter show={shell.workspace.plan === "trial" || shell.workspace.plan === "solo"} />
        </main>
      </PortalTheme>
    );
  }

  const { viewer } = resolved;
  const view = await loadPortalView(viewer);
  // Fire-and-forget: a failed analytics write must never break the portal.
  await recordVisit(viewer).catch(() => {});

  const clientName = viewer.client?.company ?? viewer.portal.title;
  const modules = view.modules;
  const nextApproval = view.pendingApprovals[0];

  const summaryFor = (id: ModuleId): { line: string; chip: React.ReactNode } => {
    switch (id) {
      case "timeline": {
        const progress = overallProgress(view.phases);
        const active = view.phases.find((p) => p.progressPct > 0 && p.progressPct < 100);
        return {
          line: view.phases.length
            ? `${progress}% through · ${active ? active.name : "all phases complete"}`
            : MODULE_COPY.timeline.empty,
          chip:
            view.phases.length === 0 ? null : progress === 100 ? (
              <SignageChip tone="green">complete</SignageChip>
            ) : (
              <SignageChip>in progress</SignageChip>
            ),
        };
      }
      case "files": {
        const current = view.stacks[0];
        return {
          line: current
            ? `${view.stacks.length} deliverable${view.stacks.length === 1 ? "" : "s"} · ${current.current.name} v${current.current.version} ${dayLabel(current.current.createdAt)}`
            : MODULE_COPY.files.empty,
          chip: null,
        };
      }
      case "approvals": {
        const pending = view.pendingApprovals.length;
        return {
          line: pending
            ? `${pending} waiting on you`
            : view.approvals.length
              ? `All ${view.approvals.length} answered`
              : MODULE_COPY.approvals.empty,
          chip: pending ? (
            <SignageChip tone="amber">awaiting you</SignageChip>
          ) : view.approvals.length ? (
            <SignageChip tone="green">approved</SignageChip>
          ) : null,
        };
      }
      case "messages": {
        const last = view.threads[0]?.lastMessage;
        const yours = view.threads.filter((t) => t.lastMessage?.authorKind === "agency").length;
        return {
          line: last
            ? `${view.threads.length} thread${view.threads.length === 1 ? "" : "s"} · last ${dayLabel(last.createdAt)}`
            : MODULE_COPY.messages.empty,
          chip: yours ? <SignageChip>{yours} unread by you</SignageChip> : null,
        };
      }
      case "invoices": {
        const open = view.invoices.filter((i) => i.status === "open");
        const total = open.reduce((sum, i) => sum + i.amountCents, 0);
        return {
          line: open.length
            ? `${moneyShort(total)} due across ${open.length} invoice${open.length === 1 ? "" : "s"}`
            : view.invoices.length
              ? "All paid"
              : MODULE_COPY.invoices.empty,
          chip: open.length ? (
            <SignageChip tone="amber">due</SignageChip>
          ) : view.invoices.length ? (
            <SignageChip tone="green">paid</SignageChip>
          ) : null,
        };
      }
      case "links":
        return {
          line: view.links.length
            ? view.links.map((l) => l.label).slice(0, 2).join(" · ")
            : MODULE_COPY.links.empty,
          chip: null,
        };
    }
  };

  return (
    <PortalTheme branding={viewer.workspace.branding}>
      <main className="screen screen-portal" style={{ paddingBottom: nextApproval ? 160 : 80 }}>
        <PortalTopBar branding={viewer.workspace.branding} agencyName={viewer.workspace.name} />
        <WelcomeBand
          clientName={clientName}
          preparedBy={viewer.portal.preparedBy}
          note={viewer.portal.welcomeNote}
        />
        <PreviewNotice show={viewer.mode === "preview"} />

        <section className="pt-8">
          <p className="t-label mb-1">Since your last visit</p>
          {view.frontDesk.length === 0 ? (
            <p className="t-secondary py-3">
              Nothing new yet. {viewer.workspace.name} will stock these rooms as the work lands.
            </p>
          ) : (
            <div>
              {view.frontDesk.map((item, i) => (
                <Link key={`${item.headline}-${i}`} href={item.href ?? `/p/${slug}`} className="row">
                  {item.awaitingClient ? (
                    <IconBell size={18} style={{ color: "var(--color-amber)", flex: "none" }} />
                  ) : (
                    <span style={{ width: 18, flex: "none" }} />
                  )}
                  <span className="t-body min-w-0 flex-1">{item.headline}</span>
                  <span className="t-data" style={{ color: "var(--color-ink-3)" }}>
                    {dayLabel(item.at)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="modules-grid mt-8 flex flex-col gap-3">
          {modules.map((id, i) => {
            const copy = MODULE_COPY[id];
            const { line, chip } = summaryFor(id);
            return (
              <Link
                key={id}
                href={`/p/${slug}/${id}`}
                className="module-card arrive"
                style={{ "--i": Math.min(i, 5) } as React.CSSProperties}
              >
                <copy.Icon size={20} style={{ color: "var(--color-ink-2)", flex: "none" }} />
                <span className="min-w-0 flex-1">
                  <span className="t-h2 block">{copy.title}</span>
                  <span className="t-secondary mt-1 block truncate">{line}</span>
                </span>
                {chip ? (
                  <span
                    className="chip-light"
                    style={{ "--i": Math.min(i, 5) } as React.CSSProperties}
                  >
                    {chip}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </section>

        <p className="t-data mt-8" style={{ color: "var(--color-ink-3)" }}>
          LAST UPDATED {agoStamp(viewer.portal.lastUpdatedAt)}
        </p>

        <PortalFooter show={viewer.showBadge} />

        {nextApproval ? (
          <div className="approval-bar">
            <Link
              href={`/p/${slug}/approvals/${nextApproval.approval.id}`}
              className="btn btn-primary btn-full"
            >
              Review {nextApproval.approval.title}
            </Link>
          </div>
        ) : null}
      </main>
    </PortalTheme>
  );
}
