import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { countLists } from "@/lib/lists";
import { listCapacity } from "@/lib/plans";
import { NewListForm } from "./NewListForm";
import { env } from "@/lib/env";
import { DEFAULT_REWARD_TIERS } from "@/lib/referrals";
import { IconChevronLeft } from "@/components/icons";

export const metadata: Metadata = { title: "New list" };
export const dynamic = "force-dynamic";

export default async function NewListPage({
  searchParams,
}: {
  searchParams: Promise<{ first?: string }>;
}) {
  const user = await requireUser();
  const { first } = await searchParams;
  const capacity = listCapacity(user.plan, await countLists(user.id));
  const pagesBase = `${env.appUrl.replace(/^https?:\/\//, "")}/l`;

  return (
    <main className="screen">
      <header style={{ paddingTop: 32, paddingBottom: 24 }}>
        {first ? null : (
          <Link href="/lists" className="btn-quiet" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <IconChevronLeft size={18} />
            Lists
          </Link>
        )}
        <h1 className="t-h2" style={{ marginTop: first ? 0 : 16 }}>
          {first ? "One thing before you launch." : "New launch page."}
        </h1>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          {first
            ? "Name the product. You get a page, a queue and referral mechanics — all editable after."
            : "Every list gets its own page, queue and reward ladder."}
        </p>
      </header>

      {capacity.allowed ? (
        <>
          <NewListForm pagesBase={pagesBase} />
          <section style={{ marginTop: 40 }}>
            <p className="t-label">Included from the first signup</p>
            <ul style={{ marginTop: 12 }}>
              {DEFAULT_REWARD_TIERS.map((tier) => (
                <li key={tier.threshold} className="row">
                  <span className="t-data" style={{ color: "var(--color-flare)", flex: "none" }}>
                    {tier.threshold}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="t-title" style={{ display: "block" }}>
                      {tier.label}
                    </span>
                    <span className="t-secondary">{tier.description}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="t-secondary" style={{ marginTop: 12 }}>
              Every confirmed referral moves someone 50 places up the queue. Both numbers are yours
              to change.
            </p>
          </section>
        </>
      ) : (
        <section className="panel" style={{ padding: 20 }}>
          <p className="t-title">{capacity.reason}</p>
          <p className="t-secondary" style={{ marginTop: 8 }}>
            Your existing list, its signups and its referral graph are untouched — nothing is
            deleted when you sit at a limit.
          </p>
          <Link href="/settings/billing" className="btn btn-primary btn-full" style={{ marginTop: 16 }}>
            See plans
          </Link>
        </section>
      )}
    </main>
  );
}
