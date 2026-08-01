import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadAttentionQueue } from "@/lib/portals";
import { AttentionRow } from "@/components/AttentionRow";

export const metadata: Metadata = { title: "Needs attention" };

export default async function AttentionPage() {
  const { workspace } = await requireUser();
  const queue = await loadAttentionQueue(workspace.id);

  const groups = [
    { kind: "approval", title: "Approvals your clients haven't answered" },
    { kind: "message", title: "Replies waiting on you" },
    { kind: "stale", title: "Portals gone quiet" },
    { kind: "uninvited", title: "Portals nobody has been invited to" },
  ] as const;

  return (
    <main className="screen screen-app">
      <header className="pt-10 pb-6">
        <p className="t-label">{workspace.name}</p>
        <h1 className="t-display mt-2">Needs attention</h1>
        <p className="t-secondary mt-3">
          Oldest first. The thing that has been waiting longest is the thing most likely to cost you
          the relationship.
        </p>
      </header>

      {queue.length === 0 ? (
        <p className="t-secondary">
          Nothing is waiting. Enjoy it —{" "}
          <Link href="/compose" style={{ color: "var(--wl-accent)" }}>
            post an update
          </Link>{" "}
          while you have the room.
        </p>
      ) : (
        groups.map((group) => {
          const items = queue.filter((i) => i.kind === group.kind);
          if (items.length === 0) return null;
          return (
            <section key={group.kind} className="mb-8">
              <p className="t-label mb-2">{group.title}</p>
              {items.map((item, i) => (
                <AttentionRow key={`${item.portalId}-${i}`} item={item} />
              ))}
            </section>
          );
        })
      )}
    </main>
  );
}
