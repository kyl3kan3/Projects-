import type { Metadata } from "next";
import { listThreads, replyAddressFor } from "@/lib/messages";
import { dayLabel } from "@/lib/format";
import { MODULE_COPY } from "@/components/module-copy";
import { PortalTheme } from "../PortalTheme";
import { PortalFooter, PortalTopBar, PreviewNotice } from "../PortalChrome";
import { requirePortalModule } from "../guard";
import { ClientReply } from "./ClientReply";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Messages", robots: { index: false } };

export default async function PortalMessages({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await requirePortalModule(slug, "messages");
  const threads = await listThreads(viewer.portalId);

  return (
    <PortalTheme branding={viewer.workspace.branding}>
      <main className="screen screen-portal">
        <PortalTopBar
          branding={viewer.workspace.branding}
          agencyName={viewer.workspace.name}
          backHref={`/p/${slug}`}
        />
        <header className="pt-8 pb-6">
          <h1 className="t-h2">Messages</h1>
          <p className="t-secondary mt-2">
            Reply here or just reply to the email — either way it lands in the same thread.
          </p>
        </header>
        <PreviewNotice show={viewer.mode === "preview"} />

        {threads.length === 0 ? (
          <p className="t-secondary">{MODULE_COPY.messages.empty}</p>
        ) : (
          threads.map(({ thread, messages }) => (
            <section key={thread.id} className="hairline-b pb-6 pt-2">
              <h2 className="t-title">{thread.subject}</h2>
              <ul className="mt-3">
                {messages.map((m) => (
                  <li key={m.id} className="py-2">
                    <p className="t-data" style={{ color: "var(--color-ink-3)" }}>
                      {m.authorName.toUpperCase()} · {dayLabel(m.createdAt).toUpperCase()}
                      {m.viaEmail ? " · BY EMAIL" : ""}
                    </p>
                    <p className="t-body mt-1" style={{ whiteSpace: "pre-wrap" }}>
                      {m.body}
                    </p>
                  </li>
                ))}
              </ul>
              {viewer.mode === "client" ? (
                <div className="mt-4">
                  <ClientReply slug={slug} threadId={thread.id} />
                </div>
              ) : (
                <p className="t-data mt-4 break-all" style={{ color: "var(--color-ink-3)" }}>
                  REPLY-TO {replyAddressFor(thread)}
                </p>
              )}
            </section>
          ))
        )}

        <PortalFooter show={viewer.showBadge} />
      </main>
    </PortalTheme>
  );
}
