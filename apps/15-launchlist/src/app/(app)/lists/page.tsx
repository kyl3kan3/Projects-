import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listCounters, listsFor, pageUrl } from "@/lib/lists";
import { count } from "@/lib/format";
import { limitLabel, listCapacity, plan } from "@/lib/plans";
import { IconPlus, Wordmark } from "@/components/icons";

export const metadata: Metadata = { title: "Your lists" };
export const dynamic = "force-dynamic";

const STATUS_LABEL = { pre: "Pre-launch", launched: "Launched", archived: "Archived" } as const;

export default async function ListsPage() {
  const user = await requireUser();
  const lists = await listsFor(user.id);
  const live = lists.filter((l) => l.status !== "archived");
  const counters = await Promise.all(lists.map((l) => listCounters(l.id)));
  const capacity = listCapacity(user.plan, live.length);
  const limits = plan(user.plan);

  return (
    <main className="screen">
      <header style={{ paddingTop: 32, paddingBottom: 24 }}>
        <Wordmark />
        <h1 className="t-h2" style={{ marginTop: 24 }}>
          {live.length === 0
            ? "No lists yet."
            : live.length === 1
              ? "One launch in flight."
              : `${live.length} launches in flight.`}
        </h1>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          {live.length} of {limitLabel(limits.lists)} on {limits.name} ·{" "}
          <Link href="/settings/billing">Plan and billing</Link> ·{" "}
          <Link href="/settings">Account</Link>
        </p>
      </header>

      {lists.length === 0 ? (
        <EmptyState />
      ) : (
        <ul>
          {lists.map((list, index) => {
            const c = counters[index];
            return (
              <li key={list.id}>
                <Link href={`/lists/${list.id}`} className="row" style={{ color: "inherit" }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="t-title" style={{ display: "block" }}>
                      {list.name}
                    </span>
                    <span className="t-data" style={{ color: "var(--color-text-3)", display: "block", marginTop: 4 }}>
                      {pageUrl(list).replace(/^https?:\/\//, "")}
                    </span>
                  </span>
                  <span style={{ textAlign: "right", flex: "none" }}>
                    <span className="t-data" style={{ display: "block" }}>
                      {count(c.inQueue)}
                    </span>
                    <span className="t-label" style={{ display: "block", marginTop: 4 }}>
                      {STATUS_LABEL[list.status]}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {!capacity.allowed ? (
        <p className="t-secondary" style={{ marginTop: 24 }}>
          {capacity.reason} <Link href="/settings/billing">See plans</Link>
        </p>
      ) : null}

      <div className="thumb-cta">
        {capacity.allowed ? (
          <Link href="/lists/new" className="btn btn-primary btn-full">
            <IconPlus size={18} />
            New list
          </Link>
        ) : (
          <Link href="/settings/billing" className="btn btn-secondary btn-full">
            Upgrade to run another launch
          </Link>
        )}
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <section className="panel" style={{ padding: 20 }}>
      <p className="t-title">Start with the product you&apos;re about to launch.</p>
      <p className="t-secondary" style={{ marginTop: 8 }}>
        You get a hosted page, a confirmed-email queue, and referral mechanics that work on the
        first signup. Most people are live in under two minutes.
      </p>
      <ul style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {[
          { name: "Ledgerly", detail: "Bookkeeping that closes itself · 3 reward tiers" },
          { name: "Bench Notes", detail: "Lab notebook for wet labs · launching in March" },
          { name: "Tideline", detail: "Surf forecasts for people who paddle out at 6am" },
        ].map((example) => (
          <li key={example.name} className="hairline-t" style={{ paddingTop: 12 }}>
            <p className="t-title">{example.name}</p>
            <p className="t-data" style={{ marginTop: 4, color: "var(--color-text-3)" }}>
              {example.detail}
            </p>
          </li>
        ))}
      </ul>
      <p className="t-secondary" style={{ marginTop: 16, color: "var(--color-text-3)" }}>
        Examples, so you can see the shape — your own list starts empty.
      </p>
    </section>
  );
}
